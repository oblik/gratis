// Loading the site and saving, creating and deleting entries, per notes/editing.md. No DOM UI
// here: `DOMParser` is passed in so this runs in the browser and in Node alike. Every read and
// write goes through the object cache, which holds the ETags the writes are conditional on.

import {
  collectionFolder,
  contentKey,
  entryIds,
  entryKey,
  isEntryId,
  json,
  parseKey,
  ROUTES,
  SCHEMA,
  templateKey,
  type Page,
  type Routes,
} from './bucket.ts'
import { render, type Content, type Dom } from './render.ts'
import { equal, type Fields, type Schema } from './schema.ts'
import type { Cache } from './storage.ts'

/** `entries` holds the ids of every collection that isn't a single, listed from the bucket. */
export interface Site {
  objects: Cache
  schema: Schema
  routes: Routes
  entries: Record<string, string[]>
}
export interface Entry {
  fields: Fields
  etag?: string
}
export type OnPage = (path: string) => void

const HTML = 'text/html; charset=utf-8'
const JSON_TYPE = 'application/json'

async function required(objects: Cache, key: string, fresh = false) {
  const object = await objects.get(key, { fresh })
  if (!object) throw new Error(`${key} is missing`)
  return object
}

/** Every entry key of the site: the singles, and each listed entry of the other collections. */
const entryKeys = (site: Site) =>
  Object.entries(site.schema.collections).flatMap(([name, { single }]) =>
    single ? [name] : site.entries[name].map((id) => entryKey(name, id)),
  )

export async function loadSite(objects: Cache): Promise<Site> {
  const schema: Schema = JSON.parse((await required(objects, SCHEMA)).text)
  const routes: Routes = JSON.parse((await required(objects, ROUTES)).text)
  const entries: Record<string, string[]> = {}
  await Promise.all(
    Object.entries(schema.collections)
      .filter(([, { single }]) => !single)
      .map(async ([name]) => {
        const folder = collectionFolder(name)
        entries[name] = entryIds(folder, await objects.list(folder))
      }),
  )
  const site = { objects, schema, routes, entries }
  await Promise.all(entryKeys(site).map((key) => objects.get(contentKey(key))))
  return site
}

/** An entry's fields and the ETag a save of them is conditional on. `fresh` refetches it and routes.json. */
export async function readEntry(
  site: Site,
  key: string,
  { fresh = false } = {},
): Promise<Entry> {
  if (fresh)
    site.routes = JSON.parse((await required(site.objects, ROUTES, true)).text)
  const file = await site.objects.get(contentKey(key), { fresh })
  return { fields: file ? JSON.parse(file.text) : {}, etag: file?.etag }
}

async function readContent(site: Site): Promise<Content> {
  const keys = entryKeys(site)
  const entries = await Promise.all(keys.map((key) => readEntry(site, key)))
  return Object.fromEntries(keys.map((key, i) => [key, entries[i].fields]))
}

/** Pages that read `key`, or that query its collection by one of `fields` (all fields: any query). */
function dependents(site: Site, key: string, fields?: string[]) {
  const { collection } = parseKey(key)
  return Object.keys(site.routes.pages).filter((path) => {
    const { deps } = site.routes.pages[path]
    const queried = deps.collections[collection]
    return (
      deps.entries.includes(key) ||
      (queried && (!fields || queried.some((field) => fields.includes(field))))
    )
  })
}

const ownPages = (site: Site, key: string) =>
  Object.keys(site.routes.pages).filter(
    (path) => site.routes.pages[path].entry === key,
  )

/** What deleting an entry touches: its own pages, deleted, and the others, re-rendered. */
export function affectedBy(site: Site, key: string) {
  const own = ownPages(site, key)
  return {
    own,
    others: dependents(site, key).filter((path) => !own.includes(path)),
  }
}

/** Writes routes.json with `pending` queued, conditional on the version last read. */
async function writeRoutes(site: Site, pending: string[]) {
  await site.objects.put(ROUTES, json({ ...site.routes, _pending: pending }), {
    type: JSON_TYPE,
    ifMatch: site.objects.peek(ROUTES)?.etag,
  })
  site.routes._pending = pending
}

/** Renders and writes the given pages, recording their new dependencies in site.routes. */
async function renderPages(
  site: Site,
  paths: string[],
  { DOMParser }: Dom,
  onPage?: OnPage,
) {
  const content = await readContent(site)
  for (const path of paths) {
    const page = site.routes.pages[path]
    if (!page) continue // deleted since it was queued
    const template = await required(site.objects, templateKey(page.template))
    const { html, deps } = render(
      template.text,
      { content, entry: page.entry },
      { DOMParser },
    )
    await site.objects.put(page.file, html, { type: HTML })
    Object.assign(page, { deps, updated: new Date().toISOString() })
    onPage?.(path)
  }
}

/**
 * The save, in the order notes/editing.md gives: queue `paths` on top of any pending ones, write
 * the change, render the queue, clear it. Returns the pages rendered.
 */
async function commit(
  site: Site,
  paths: string[],
  write: () => Promise<void>,
  dom: Dom,
  onPage?: OnPage,
) {
  const pending = [...new Set([...site.routes._pending, ...paths])]
  await writeRoutes(site, pending)
  await write()
  await renderPages(site, pending, dom, onPage)
  await writeRoutes(site, [])
  return pending
}

/**
 * Saves an entry's fields, then re-renders every page that depends on it. Content before HTML.
 * `etag` is the version the edit started from; it defaults to the cached one.
 */
export function saveEntry(
  site: Site,
  key: string,
  fields: Fields,
  { DOMParser, etag }: Dom & { etag?: string },
  onPage?: OnPage,
) {
  const file = contentKey(key)
  const before: Fields = JSON.parse(site.objects.peek(file)?.text ?? '{}')
  const changed = [
    ...new Set([...Object.keys(before), ...Object.keys(fields)]),
  ].filter((field) => !equal(before[field], fields[field]))
  return commit(
    site,
    dependents(site, key, changed),
    () =>
      site.objects
        .put(file, json(fields), {
          type: JSON_TYPE,
          ifMatch: etag ?? site.objects.peek(file)?.etag,
        })
        .then(() => {}),
    { DOMParser },
    onPage,
  )
}

/** The pages a new entry gets: one per route bound to its collection. */
function pagesOf(site: Site, collection: string, id: string) {
  const pages: Record<string, Page> = {}
  for (const [template, binding] of Object.entries(site.schema.routes)) {
    if (binding.collection !== collection) continue
    const at = (s: string) => s.replace(`[${binding.param}]`, id)
    pages[at(template)] = {
      template,
      file: at(binding.file),
      entry: entryKey(collection, id),
      deps: { entries: [entryKey(collection, id)], collections: {} },
      updated: '',
    }
  }
  return pages
}

/** Creates an entry with a page per route bound to its collection, and re-renders the pages that query it. */
export async function createEntry(
  site: Site,
  collection: string,
  id: string,
  fields: Fields,
  dom: Dom,
  onPage?: OnPage,
) {
  if (!isEntryId(id))
    throw new Error(
      `"${id}" isn't a valid id: use lowercase letters, digits and dashes`,
    )
  const key = entryKey(collection, id)
  const pages = pagesOf(site, collection, id)
  Object.assign(site.routes.pages, pages)
  try {
    return await commit(
      site,
      [...Object.keys(pages), ...dependents(site, key)],
      async () => {
        // An existing entry of the same id fails the write instead of being overwritten.
        await site.objects.put(contentKey(key), json(fields), {
          type: JSON_TYPE,
          ifNoneMatch: '*',
        })
        site.entries[collection] = [...site.entries[collection], id].sort()
      },
      dom,
      onPage,
    )
  } catch (error) {
    // The entry wasn't written (an existing id, a routes.json conflict): take its pages back out,
    // from routes.json too if the queue was written.
    if (!site.entries[collection].includes(id)) {
      for (const path of Object.keys(pages)) delete site.routes.pages[path]
      if (site.routes._pending.some((path) => path in pages))
        await writeRoutes(
          site,
          site.routes._pending.filter((path) => !(path in pages)),
        ).catch(() => {})
    }
    throw error
  }
}

/** Deletes an entry and its pages, and re-renders the pages that read or query it. */
export function deleteEntry(
  site: Site,
  key: string,
  dom: Dom,
  onPage?: OnPage,
) {
  const { collection, id } = parseKey(key)
  const own = ownPages(site, key)
  const files = own.map((path) => site.routes.pages[path].file)
  for (const path of own) delete site.routes.pages[path]
  return commit(
    site,
    dependents(site, key),
    async () => {
      await site.objects.delete(contentKey(key))
      site.entries[collection] = site.entries[collection].filter(
        (other) => other !== id,
      )
      for (const file of files) await site.objects.delete(file)
    },
    dom,
    onPage,
  )
}

/** Finishes an interrupted save: renders what the last one left queued, if anything. */
export function renderPending(site: Site, dom: Dom, onPage?: OnPage) {
  if (!site.routes._pending.length) return Promise.resolve([])
  return commit(site, [], async () => {}, dom, onPage)
}

/** Regenerates every page, dependencies included (notes/editing.md). */
export const renderAll = (site: Site, dom: Dom, onPage?: OnPage) =>
  commit(site, Object.keys(site.routes.pages), async () => {}, dom, onPage)
