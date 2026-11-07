import {
  collectionFolder,
  contentKey,
  entryIds,
  entryKey,
  ROUTES,
  SCHEMA,
} from './bucket.ts'
import type { SiteState } from './plan.ts'
import type { Routes } from './routes.ts'
import type { Fields, Schema } from './schema.ts'
import type { Cache } from './storage.ts'
import type { Content, Dom } from './template/render.ts'

export interface Site extends SiteState {
  objects: Cache
  dom: Dom
}
export interface Entry {
  fields: Fields
  etag?: string
}
export async function required(objects: Cache, key: string, fresh = false) {
  const object = await objects.get(key, { fresh })
  if (!object) throw new Error(`${key} is missing`)
  return object
}

const entryKeys = (site: Site) =>
  Object.entries(site.schema.collections).flatMap(([name, { single }]) =>
    single ? [name] : site.entries[name].map((id) => entryKey(name, id)),
  )

export async function loadSite(objects: Cache, dom: Dom): Promise<Site> {
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
  const site = { objects, dom, schema, routes, entries }
  await Promise.all(entryKeys(site).map((key) => objects.get(contentKey(key))))
  return site
}

/** `fresh` refetches the entry and routes.json. */
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

export async function readContent(site: Site): Promise<Content> {
  const keys = entryKeys(site)
  const entries = await Promise.all(keys.map((key) => readEntry(site, key)))
  return Object.fromEntries(keys.map((key, i) => [key, entries[i].fields]))
}
