// Loading the site and saving an entry, per docs/edit-flow.md. No DOM UI here: `DOMParser` is
// passed in so this runs in the browser and in Node alike. Every read and write goes through the
// object cache, which holds the ETags the writes are conditional on.

import { render, type Content, type Deps, type Dom } from '../renderer/index.ts';
import { templateFile } from '../renderer/paths.ts';
import type { Cache } from './storage.ts';

export type Fields = Record<string, unknown>;
export interface TextField { type: 'text'; label: string; localized?: boolean; multiline?: boolean }
export type Field = TextField;
export interface Collection { single: boolean; label?: string; storage: { path: string; source: string }; fields: Record<string, Field> }
export interface Schema { collections: Record<string, Collection> }
export interface Page { template: string; file: string; deps: Deps; updated: string }
export interface Routes { pages: Record<string, Page>; _pending: string[] }
export interface Site { objects: Cache; schema: Schema; routes: Routes }
export interface Entry { fields: Fields; etag?: string }

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json';
const ROUTES = '_gratis/routes.json';

const readable = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
export const collectionLabel = (name: string, collection: Collection) => collection.label ?? readable(name);

export const contentKey = (site: Site, name: string) => {
  const collection = site.schema.collections[name];
  if (!collection) throw new Error(`there is no collection "${name}"`);
  return `_gratis/content/${collection.storage.path}`;
};

async function required(objects: Cache, key: string, options?: { fresh?: boolean }) {
  const object = await objects.get(key, options);
  if (!object) throw new Error(`${key} is missing`);
  return object;
}

export async function loadSite(objects: Cache): Promise<Site> {
  const schema: Schema = JSON.parse((await required(objects, '_gratis/schema.json')).text);
  const routes: Routes = JSON.parse((await required(objects, ROUTES)).text);
  const site = { objects, schema, routes };
  await Promise.all(Object.keys(schema.collections).map((name) => objects.get(contentKey(site, name))));
  return site;
}

/** A single's fields and the ETag a save of them is conditional on. `fresh` refetches it and routes.json. */
export async function readEntry(site: Site, name: string, { fresh = false } = {}): Promise<Entry> {
  if (fresh) site.routes = JSON.parse((await required(site.objects, ROUTES, { fresh })).text);
  const file = await site.objects.get(contentKey(site, name), { fresh });
  return { fields: file ? JSON.parse(file.text) : {}, etag: file?.etag };
}

async function readContent(site: Site): Promise<Content> {
  const names = Object.keys(site.schema.collections);
  const entries = await Promise.all(names.map((name) => readEntry(site, name)));
  return Object.fromEntries(names.map((name, i) => [name, entries[i].fields]));
}

/** Renders and writes the given pages, recording their new dependencies in site.routes. */
export async function renderPages(site: Site, paths: string[], { DOMParser }: Dom, onPage: (path: string) => void = () => {}) {
  const content = await readContent(site);
  for (const path of paths) {
    const page = site.routes.pages[path];
    const template = await required(site.objects, `_gratis/templates/${templateFile(page.template)}`);
    const { html, deps } = render(template.text, { content }, { DOMParser });
    await site.objects.put(page.file, html, { type: HTML });
    Object.assign(page, { deps, updated: new Date().toISOString() });
    onPage(path);
  }
}

async function writeRoutes(site: Site, pending: string[]) {
  site.routes._pending = pending;
  await site.objects.put(ROUTES, json(site.routes), { type: JSON_TYPE, ifMatch: site.objects.peek(ROUTES)?.etag });
}

/**
 * Saves a single's fields, then re-renders every page that depends on it. Content before HTML.
 * `etag` is the version the edit started from; it defaults to the cached one.
 */
export async function saveEntry(site: Site, key: string, fields: Fields, { DOMParser, etag }: Dom & { etag?: string }, onPage?: (path: string) => void) {
  const affected = Object.keys(site.routes.pages).filter((path) => site.routes.pages[path].deps.entries.includes(key));
  const pending = [...new Set([...site.routes._pending, ...affected])];
  await writeRoutes(site, pending);

  const file = contentKey(site, key);
  await site.objects.put(file, json(fields), { type: JSON_TYPE, ifMatch: etag ?? site.objects.peek(file)?.etag });

  await renderPages(site, pending, { DOMParser }, onPage);
  await writeRoutes(site, []);
  return pending;
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
