import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { Loader } from 'astro/loaders'
import { z } from 'astro/zod'

import { runQuery, type Query } from '../renderer/index.ts'
import {
  isTemplateMode,
  MARKER,
  placeholderId,
  sentinel,
  state,
} from './mode.ts'
import type { FieldConfig } from './schema.ts'

export { default as Each } from './Each.astro'
export { default as If } from './If.astro'

const fieldSchemas = {
  text: () => z.string(),
  boolean: () => z.boolean(),
}

export const text = ({
  label,
  localized,
  multiline,
}: {
  label?: string
  localized?: boolean
  multiline?: boolean
} = {}): FieldConfig => ({ type: 'text', label, localized, multiline })

export const boolean = ({ label }: { label?: string } = {}): FieldConfig => ({
  type: 'boolean',
  label,
})

export const file = (path: string) => ({ kind: 'file' as const, path })

export function glob({ pattern, base }: { pattern: string; base: string }) {
  if (pattern !== '*.json')
    throw new Error('gratis: glob() supports only the pattern *.json so far')
  return { kind: 'glob' as const, pattern, base }
}

// The zod schema of each field, so entries are typed per field rather than as a record.
type Shape<F extends Record<string, FieldConfig>> = {
  [K in keyof F]: ReturnType<(typeof fieldSchemas)[F[K]['type']]>
}

const orEmpty = <T>(promise: Promise<T[]>) =>
  promise.catch((error: NodeJS.ErrnoException) =>
    error.code === 'ENOENT' ? [] : Promise.reject(error),
  )

export function defineCollection<F extends Record<string, FieldConfig>>({
  single = false,
  loader,
  schema: fields,
}: {
  single?: boolean
  loader: ReturnType<typeof file> | ReturnType<typeof glob>
  schema: F
}) {
  if (single && loader?.kind !== 'file')
    throw new Error('gratis: a single needs file()')
  if (!single && loader?.kind !== 'glob')
    throw new Error('gratis: a collection needs glob()')

  // In template mode the entry holds sentinels, so every field accepts anything. The type is the
  // real one either way: pages are written against real entries.
  const schema = (isTemplateMode()
    ? z.object(Object.fromEntries(Object.keys(fields).map((k) => [k, z.any()])))
    : z.object(
        Object.fromEntries(
          Object.entries(fields).map(([k, f]) => [k, fieldSchemas[f.type]()]),
        ),
      )) as unknown as z.ZodObject<Shape<F>>

  return {
    // What Astro's own defineCollection sets for a collection with a loader.
    type: 'content_layer' as const,
    schema,
    loader: {
      name: 'gratis',
      async load({ collection, store, parseData, config, watcher }) {
        const folder =
          loader.kind === 'glob' ? loader.base.replace(/\/?$/, '/') : undefined
        state().collections[collection] = {
          single,
          fields,
          storage:
            loader.kind === 'file'
              ? { file: loader.path }
              : { folder: folder! },
        }
        const path = fileURLToPath(
          new URL(loader.kind === 'file' ? loader.path : folder!, config.root),
        )
        const sync = async () => {
          store.clear()
          if (!folder) {
            const data = isTemplateMode()
              ? Object.fromEntries(
                  Object.keys(fields).map((k) => [
                    k,
                    sentinel('entry', collection, k),
                  ]),
                )
              : JSON.parse(await readFile(path, 'utf8'))
            store.set({
              id: collection,
              data: await parseData({ id: collection, data }),
            })
          } else if (!isTemplateMode()) {
            // In template mode a collection stores nothing: getCollection returns its placeholder.
            const names = (await orEmpty(readdir(path)))
              .filter((name) => name.endsWith('.json'))
              .sort()
            for (const name of names) {
              const id = name.slice(0, -'.json'.length)
              const data = JSON.parse(await readFile(path + name, 'utf8'))
              store.set({ id, data: await parseData({ id, data }) })
            }
          }
        }
        await sync()
        // In dev, an admin save (or a hand edit) rewrites a file; reload it like Astro's loaders do.
        watcher?.add(path)
        const reload = (changed: string) =>
          (folder
            ? changed.startsWith(path) && changed.endsWith('.json')
            : changed === path) && sync()
        for (const event of ['change', 'add', 'unlink'] as const)
          watcher?.on(event, reload)
      },
    } satisfies Loader,
  }
}

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
  const { getEntry } = await import('astro:content')
  const entry = await getEntry(collection, id ?? collection)
  if (!entry)
    throw new Error(`gratis: no entry ${id ?? collection} in ${collection}`)
  return { id: entry.id, collection, ...entry.data }
}

// The entries of a collection that match `query`, which is all the filtering a page may do: the
// admin re-runs it when it renders the page (see docs/rendering.md#helpers).
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
  const { getCollection } = await import('astro:content')
  const entries = (await getCollection(collection)).map(
    (entry: { id: string; data: unknown }) => ({
      id: entry.id,
      fields: entry.data as Record<string, unknown>,
    }),
  )
  return runQuery(entries, query).map(
    ({ id, fields }) => ({ id, collection, ...fields }) as Entry<C>,
  )
}
