// The bucket layout under _gratis/ (notes/README.md), and the names things go by.
//
// An entry is named by its key: `site` for a single, `posts/hello` for entry `hello` of `posts`.
// Its file in the bucket is the key under `_gratis/content/` plus `.json`.

import type { Deps } from './render.ts'

export const SCHEMA = '_gratis/schema.json'
export const ROUTES = '_gratis/routes.json'
export const CONTENT = '_gratis/content/'
export const TEMPLATES = '_gratis/templates/'
export const AUTH = '_gratis/auth/'

export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

export const entryKey = (collection: string, id?: string) =>
  id == null ? collection : `${collection}/${id}`

export function parseKey(key: string): { collection: string; id?: string } {
  const slash = key.indexOf('/')
  return slash < 0
    ? { collection: key }
    : { collection: key.slice(0, slash), id: key.slice(slash + 1) }
}

/** Entry ids double as URL segments, so they are slugs. */
export const isEntryId = (id: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)

/** The content file of an entry. */
export const contentKey = (key: string) => `${CONTENT}${key}.json`

/** The entry key of a content file, or undefined for any other object. */
export const parseContentKey = (key: string) =>
  key.startsWith(CONTENT) && key.endsWith('.json')
    ? key.slice(CONTENT.length, -'.json'.length)
    : undefined

/** The folder a collection's entries are listed from. */
export const collectionFolder = (collection: string) =>
  `${CONTENT}${collection}/`

/** The ids in a listing of a collection's folder: its own JSON files, sorted. */
export const entryIds = (folder: string, keys: string[]) =>
  keys
    .map((key) => key.slice(folder.length))
    .filter((name) => /^[^/]+\.json$/.test(name))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()

/** The template id is the route pattern with the locale segment removed; `/` for the root. */
export const templateId = (pattern: string) =>
  pattern.replace(/\/\[(\.\.\.)?lang\]/, '') || '/'

/** Where a template lives: `/` is index.html, `/blog/[slug]` is blog/[slug].html. */
export const templateKey = (id: string) =>
  `${TEMPLATES}${id === '/' ? 'index' : id.slice(1)}.html`

/** The shape of _gratis/routes.json (notes/content.md): every page and what it depends on. */
export interface Page {
  template: string
  file: string
  entry?: string
  deps: Deps
  updated: string
}
export interface Routes {
  pages: Record<string, Page>
  /** Pages queued for rendering by a save in progress, or interrupted (notes/editing.md). */
  _pending: string[]
}
