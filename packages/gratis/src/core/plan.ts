import {
  contentKey,
  entryKey,
  isEntryId,
  json,
  parseKey,
  type ObjectKey,
  type PagePath,
} from './bucket.ts'
import { affectedBy, dependents, entryPages, type Routes } from './routes.ts'
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
  | { key: ObjectKey; put: string; ifMatch?: string; ifNoneMatch?: '*' }
  | { key: ObjectKey; delete: true }

export interface Edit {
  /** Nothing below happens unless it succeeds. */
  write?: Write
  /** Routes.json's pages after the edit, when it adds or removes any. */
  pages?: Routes['pages']
  /** The entry ids after the edit, when it adds or removes any. */
  entries?: Record<string, string[]>
  /** Objects deleted after the write: the pages of a deleted entry. */
  remove: ObjectKey[]
  /** Pages rendered after the write, in this order. */
  render: PagePath[]
}

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

export const planRender = (
  site: SiteState,
  paths = Object.keys(site.routes.pages),
): Edit => ({ remove: [], render: paths })
