// Loading the site and saving, creating and deleting entries, per docs/edit-flow.md. No DOM UI
// here: `DOMParser` is passed in so this runs in the browser and in Node alike. Every read and
// write goes through the object cache, which holds the ETags the writes are conditional on.
//
// An entry is named by its key: `site` for a single, `posts/hello` for entry `hello` of `posts`.

import { render, type Content, type Deps, type Dom } from '../renderer/index.ts';
import { templateFile } from '../renderer/paths.ts';
import { equal } from './path.ts';
import type { Cache } from './storage.ts';

export type Fields = Record<string, unknown>;
export interface TextField { type: 'text'; label: string; localized?: boolean; multiline?: boolean }
export interface BooleanField { type: 'boolean'; label: string }
export type Field = TextField | BooleanField;
export interface Collection { single: boolean; label?: string; storage: { path: string; source: string }; fields: Record<string, Field> }
/** A dynamic route bound to a collection: one page per entry, the entry id in `param`. */
export interface RouteBinding { collection: string; param: string; file: string }
export interface Schema { collections: Record<string, Collection>; routes?: Record<string, RouteBinding> }
export interface Page { template: string; file: string; entry?: string; deps: Deps; updated: string }
export interface Routes { pages: Record<string, Page>; _pending: string[] }
/** `entries` holds the ids of every collection that isn't a single, listed from the bucket. */
export interface Site { objects: Cache; schema: Schema; routes: Routes; entries: Record<string, string[]> }
export interface Entry { fields: Fields; etag?: string }

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json';
const ROUTES = '_gratis/routes.json';
const CONTENT = '_gratis/content/';

const readable = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
export const collectionLabel = (name: string, collection: Collection) => collection.label ?? readable(name);

/** Entry ids double as URL segments, so they are slugs. */
export const isEntryId = (id: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

export const entryKey = (collection: string, id?: string) => (id == null ? collection : `${collection}/${id}`);

function parseKey(key: string) {
  const slash = key.indexOf('/');
  return slash < 0 ? { collection: key, id: undefined } : { collection: key.slice(0, slash), id: key.slice(slash + 1) };
}

export const contentKey = (site: Site, key: string) => {
  const { collection: name, id } = parseKey(key);
  const collection = site.schema.collections[name];
  if (!collection) throw new Error(`there is no collection "${name}"`);
  if (collection.single !== (id == null)) throw new Error(`"${key}" is not an entry of ${name}`);
  return CONTENT + collection.storage.path + (id == null ? '' : `${id}.json`);
};

/** A new entry's fields: every field present, so the build's schema accepts it. */
export const emptyFields = ({ fields }: Collection): Fields =>
  Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.type === 'boolean' ? false : '']));

async function required(objects: Cache, key: string, options?: { fresh?: boolean }) {
  const object = await objects.get(key, options);
  if (!object) throw new Error(`${key} is missing`);
  return object;
}

/** Every entry key of the site: the singles, and each listed entry of the other collections. */
const entryKeys = (site: Site) => Object.entries(site.schema.collections).flatMap(([name, { single }]) =>
  single ? [name] : (site.entries[name] ?? []).map((id) => entryKey(name, id)));

export async function loadSite(objects: Cache): Promise<Site> {
  const schema: Schema = JSON.parse((await required(objects, '_gratis/schema.json')).text);
  const routes: Routes = JSON.parse((await required(objects, ROUTES)).text);
  const entries: Record<string, string[]> = {};
  await Promise.all(Object.entries(schema.collections).filter(([, { single }]) => !single).map(async ([name, { storage }]) => {
    const folder = CONTENT + storage.path;
    entries[name] = (await objects.list(folder))
      .map((key) => key.slice(folder.length))
      .filter((name) => /^[^/]+\.json$/.test(name))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
  }));
  const site = { objects, schema, routes, entries };
  await Promise.all(entryKeys(site).map((key) => objects.get(contentKey(site, key))));
  return site;
}

/** An entry's fields and the ETag a save of them is conditional on. `fresh` refetches it and routes.json. */
export async function readEntry(site: Site, key: string, { fresh = false } = {}): Promise<Entry> {
  if (fresh) site.routes = JSON.parse((await required(site.objects, ROUTES, { fresh })).text);
  const file = await site.objects.get(contentKey(site, key), { fresh });
  return { fields: file ? JSON.parse(file.text) : {}, etag: file?.etag };
}

async function readContent(site: Site): Promise<Content> {
  const keys = entryKeys(site);
  const entries = await Promise.all(keys.map((key) => readEntry(site, key)));
  return Object.fromEntries(keys.map((key, i) => [key, entries[i].fields]));
}

/** Renders and writes the given pages, recording their new dependencies in site.routes. */
export async function renderPages(site: Site, paths: string[], { DOMParser }: Dom, onPage: (path: string) => void = () => {}) {
  const content = await readContent(site);
  for (const path of paths) {
    const page = site.routes.pages[path];
    if (!page) continue; // deleted since it was queued
    const template = await required(site.objects, `_gratis/templates/${templateFile(page.template)}`);
    const { html, deps } = render(template.text, { content, entry: page.entry }, { DOMParser });
    await site.objects.put(page.file, html, { type: HTML });
    Object.assign(page, { deps, updated: new Date().toISOString() });
    onPage(path);
  }
}

async function writeRoutes(site: Site, pending: string[]) {
  site.routes._pending = pending;
  await site.objects.put(ROUTES, json(site.routes), { type: JSON_TYPE, ifMatch: site.objects.peek(ROUTES)?.etag });
}

/** Pages that read `key`, or that query its collection by one of `fields` (all fields: any query). */
function dependents(site: Site, key: string, fields?: string[]) {
  const { collection } = parseKey(key);
  return Object.keys(site.routes.pages).filter((path) => {
    const { deps } = site.routes.pages[path];
    const queried = deps.collections[collection];
    return deps.entries.includes(key) || (queried && (!fields || queried.some((field) => fields.includes(field))));
  });
}

/** What deleting an entry touches: its own pages, deleted, and the others, re-rendered. */
export function affectedBy(site: Site, key: string) {
  const own = Object.keys(site.routes.pages).filter((path) => site.routes.pages[path].entry === key);
  return { own, others: dependents(site, key).filter((path) => !own.includes(path)) };
}

/** Queues `paths` on top of any pending ones, writes the entry change, renders, clears the queue. */
async function apply(site: Site, paths: string[], write: () => Promise<void>, dom: Dom, onPage?: (path: string) => void) {
  const pending = [...new Set([...site.routes._pending, ...paths])];
  await writeRoutes(site, pending);
  await write();
  await renderPages(site, pending, dom, onPage);
  await writeRoutes(site, []);
  return pending;
}

/**
 * Saves an entry's fields, then re-renders every page that depends on it. Content before HTML.
 * `etag` is the version the edit started from; it defaults to the cached one.
 */
export async function saveEntry(site: Site, key: string, fields: Fields, { DOMParser, etag }: Dom & { etag?: string }, onPage?: (path: string) => void) {
  const file = contentKey(site, key);
  const before: Fields = JSON.parse(site.objects.peek(file)?.text ?? '{}');
  const changed = [...new Set([...Object.keys(before), ...Object.keys(fields)])].filter((field) => !equal(before[field], fields[field]));
  return apply(site, dependents(site, key, changed), async () => {
    await site.objects.put(file, json(fields), { type: JSON_TYPE, ifMatch: etag ?? site.objects.peek(file)?.etag });
  }, { DOMParser }, onPage);
}

/** Creates an entry with a page per route bound to its collection, and re-renders the pages that query it. */
export async function createEntry(site: Site, collection: string, id: string, fields: Fields, { DOMParser }: Dom, onPage?: (path: string) => void) {
  if (!isEntryId(id)) throw new Error(`"${id}" isn't a valid id: use lowercase letters, digits and dashes`);
  const key = entryKey(collection, id);
  const file = contentKey(site, key);
  const pages: string[] = [];
  for (const [template, { collection: bound, param, file: pattern }] of Object.entries(site.schema.routes ?? {})) {
    if (bound !== collection) continue;
    const path = template.replace(`[${param}]`, id);
    site.routes.pages[path] = { template, file: pattern.replace(`[${param}]`, id), entry: key, deps: { entries: [key], collections: {} }, updated: '' };
    pages.push(path);
  }
  try {
    const rendered = await apply(site, [...pages, ...dependents(site, key)], async () => {
      // An existing entry of the same id fails the write instead of being overwritten.
      await site.objects.put(file, json(fields), { type: JSON_TYPE, ifNoneMatch: '*' });
      site.entries[collection] = [...(site.entries[collection] ?? []), id].sort();
    }, { DOMParser }, onPage);
    return rendered;
  } catch (error) {
    // The entry wasn't written (an existing id, a routes.json conflict): take its pages back out.
    if (!site.entries[collection]?.includes(id)) {
      for (const path of pages) delete site.routes.pages[path];
      if (site.objects.peek(ROUTES)?.text.includes(JSON.stringify(key))) {
        await writeRoutes(site, site.routes._pending.filter((path) => !pages.includes(path))).catch(() => {});
      }
    }
    throw error;
  }
}

/** Deletes an entry and its pages, and re-renders the pages that read or query it. */
export async function deleteEntry(site: Site, key: string, { DOMParser }: Dom, onPage?: (path: string) => void) {
  const { collection, id } = parseKey(key);
  const file = contentKey(site, key);
  const own = Object.keys(site.routes.pages).filter((path) => site.routes.pages[path].entry === key);
  const files = own.map((path) => site.routes.pages[path].file);
  for (const path of own) delete site.routes.pages[path];
  return apply(site, dependents(site, key), async () => {
    await site.objects.delete(file);
    site.entries[collection] = site.entries[collection].filter((other) => other !== id);
    for (const page of files) await site.objects.delete(page);
  }, { DOMParser }, onPage);
}

/** Finishes an interrupted save, or regenerates every page when `all` is set. */
export async function renderPending(site: Site, { DOMParser, all = false }: Dom & { all?: boolean }, onPage?: (path: string) => void) {
  const paths = all ? Object.keys(site.routes.pages) : site.routes._pending;
  if (!paths.length) return [];
  await writeRoutes(site, paths);
  await renderPages(site, paths, { DOMParser }, onPage);
  await writeRoutes(site, []);
  return paths;
}
