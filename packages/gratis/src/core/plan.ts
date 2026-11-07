// What an edit changes, decided before anything is written (notes/editing.md). Pure: a plan reads
// the loaded schema, routes and entry ids and returns the change as data, which save.ts then
// carries out. So "what does deleting this entry do" is answered without storage or a DOM.

import { contentKey, entryKey, isEntryId, json, parseKey } from './bucket.ts'
import {
  affectedBy,
  dependents,
  entryPages,
  type Page,
  type Routes,
} from './routes.ts'
import { changedFields, type Fields, type Schema } from './schema.ts'

/** The part of a loaded site a plan reads. */
export interface SiteState {
  schema: Schema
  routes: Routes
  /** The ids of every collection that isn't a single. */
  entries: Record<string, string[]>
}

/** The write an edit stands or falls on: an entry's content file. */
export type Write =
  | { key: string; put: string; ifMatch?: string; ifNoneMatch?: '*' }
  | { key: string; delete: true }

export interface Edit {
  /** The write, if the edit makes one. Nothing below happens unless it succeeds. */
  write?: Write
  /** routes.json's pages after the edit, when it adds or removes any. */
  pages?: Record<string, Page>
  /** The entry ids after the edit, when it adds or removes any. */
  entries?: Record<string, string[]>
  /** Objects deleted after the write: the pages of a deleted entry. */
  remove: string[]
  /** Pages rendered after the write, in this order. */
  render: string[]
}

/**
 * Saving an entry's fields re-renders the pages that read it, and the pages that query its
 * collection by a field that changed. The write is conditional on `etag`, the version the edit
 * started from.
 */
export function planSave(
  site: SiteState,
  key: string,
  { before, after, etag }: { before: Fields; after: Fields; etag?: string },
): Edit {
  return {
    write: { key: contentKey(key), put: json(after), ifMatch: etag },
    remove: [],
    render: dependents(site.routes, key, changedFields(before, after)),
  }
}

/**
 * Creating an entry adds a page per route bound to its collection, and re-renders those and every
 * page that queries the collection. The write fails if an entry with the id already exists.
 */
export function planCreate(
  site: SiteState,
  collection: string,
  id: string,
  fields: Fields,
): Edit {
  if (!isEntryId(id))
    throw new Error(
      `"${id}" isn't a valid id: use lowercase letters, digits and dashes`,
    )
  const key = entryKey(collection, id)
  const added = entryPages(site.schema.routes, collection, id)
  const pages = { ...site.routes.pages, ...added }
  return {
    write: { key: contentKey(key), put: json(fields), ifNoneMatch: '*' },
    pages,
    entries: {
      ...site.entries,
      [collection]: [...site.entries[collection], id].sort(),
    },
    remove: [],
    render: [
      ...new Set([
        ...Object.keys(added),
        ...dependents({ ...site.routes, pages }, key),
      ]),
    ],
  }
}

/** Deleting an entry deletes its own pages, and re-renders the pages that read or query it. */
export function planDelete(site: SiteState, key: string): Edit {
  const { collection, id } = parseKey(key)
  const { own, others } = affectedBy(site.routes, key)
  const pages = { ...site.routes.pages }
  for (const path of own) delete pages[path]
  return {
    write: { key: contentKey(key), delete: true },
    pages,
    entries: {
      ...site.entries,
      [collection]: site.entries[collection].filter((other) => other !== id),
    },
    remove: own.map((path) => site.routes.pages[path].file),
    render: others,
  }
}

/** Rendering pages without changing content: `paths`, or every page of the site. */
export const planRender = (
  site: SiteState,
  paths = Object.keys(site.routes.pages),
): Edit => ({ remove: [], render: paths })
