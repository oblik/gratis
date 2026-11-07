// Imported statically on purpose: in `astro dev` the module runner must
// re-fetch astro:content while re-evaluating the page, ahead of Astro's CSS
// crawler re-transforming it, or it keeps its old data store and a save doesn't
// show until a later one wins the race.
import {
  getCollection as astroGetCollection,
  getEntry as astroGetEntry,
  type CollectionEntry,
  type CollectionKey,
} from 'astro:content'

import { runQuery, type Query } from '../core/template/query.ts'
import { isTemplateMode, placeholderList } from './template-mode.ts'

type Entry<C extends CollectionKey> = {
  id: string
  collection: C
} & CollectionEntry<C>['data']

export async function getEntry<C extends CollectionKey>(
  collection: C,
  id?: string,
): Promise<Entry<C>> {
  const entry = await astroGetEntry(collection, id ?? collection)
  if (!entry)
    throw new Error(`gratis: no entry ${id ?? collection} in ${collection}`)
  return { id: entry.id, collection, ...entry.data }
}

/**
 * `query` is all the filtering a page may do: the admin re-runs it when it
 * renders the page.
 */
export async function getCollection<C extends CollectionKey>(
  collection: C,
  query: Query = {},
): Promise<Entry<C>[]> {
  if (isTemplateMode())
    return placeholderList(String(collection), query) as Entry<C>[]
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
