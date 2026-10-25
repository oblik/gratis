// The getters pages read Gratis collections through (notes/rendering.md). In the real build and
// in dev they return the real entries; in the template pass, placeholders whose reads are sentinels.

// Imported statically on purpose: in `astro dev` the module runner must re-fetch astro:content
// while re-evaluating the page, ahead of Astro's CSS crawler re-transforming it, or it keeps its
// old data store and a save doesn't show until a later one wins the race.
import {
  getCollection as astroGetCollection,
  getEntry as astroGetEntry,
  type CollectionEntry,
  type CollectionKey,
} from 'astro:content'

import { runQuery, type Query } from '../core/query.ts'
import { isTemplateMode, MARKER, placeholderId, sentinel } from './template.ts'

type Entry<C extends CollectionKey> = {
  id: string
  collection: C
} & CollectionEntry<C>['data']

// Typed by the site's generated astro:content: `collection` is one of its collections and the
// entry has its fields.
export async function getEntry<C extends CollectionKey>(
  collection: C,
  id?: string,
): Promise<Entry<C>> {
  const entry = await astroGetEntry(collection, id ?? collection)
  if (!entry)
    throw new Error(`gratis: no entry ${id ?? collection} in ${collection}`)
  return { id: entry.id, collection, ...entry.data }
}

// The entries of a collection that match `query`, which is all the filtering a page may do: the
// admin re-runs it when it renders the page.
//
// In template mode it is one placeholder entry, which `Each` replaces with its item and which,
// read outside an `Each`, is the page's own entry. Its id lands in the params of a dynamic route.
export async function getCollection<C extends CollectionKey>(
  collection: C,
  query: Query = {},
): Promise<Entry<C>[]> {
  if (isTemplateMode()) {
    const id = placeholderId(String(collection))
    const entry = new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'id'
            ? id
            : key === 'collection'
              ? collection
              : typeof key === 'string'
                ? sentinel('route', key)
                : undefined,
      },
    )
    const json = Object.keys(query).length ? ` ${JSON.stringify(query)}` : ''
    return Object.assign([entry], {
      [MARKER]: `query:${collection}${json}`,
    }) as Entry<C>[]
  }
  const entries = (await astroGetCollection(collection)).map(
    (entry: { id: string; data: unknown }) => ({
      id: entry.id,
      fields: entry.data as Record<string, unknown>,
    }),
  )
  return runQuery(entries, query).map(
    ({ id, fields }) => ({ id, collection, ...fields }) as Entry<C>,
  )
}
