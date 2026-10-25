// `defineCollection` and the loaders: Astro's own, except that they record where entries live, so
// the admin can write them back, and in the template pass they hand out placeholders.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { Loader } from 'astro/loaders'
import { z } from 'astro/zod'

import { sourcePath, type Collection } from '../core/schema.ts'
import { zodSchemas, type FieldConfig, type Shape } from './fields.ts'
import { isTemplateMode, sentinel, state } from './template.ts'

export const file = (path: string) => ({ kind: 'file' as const, path })

export function glob({ pattern, base }: { pattern: string; base: string }) {
  if (pattern !== '*.json')
    throw new Error('gratis: glob() supports only the pattern *.json so far')
  return { kind: 'glob' as const, base }
}

const readable = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

/** The ids of a collection's entries: the JSON files in its folder. */
export const sourceIds = async (root: URL, collection: Collection) =>
  (await readdir(new URL(collection.source, root)).catch(() => []))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()

export function defineCollection<F extends Record<string, FieldConfig>>({
  single = false,
  loader,
  schema: fields,
}: {
  single?: boolean
  loader: ReturnType<typeof file> | ReturnType<typeof glob>
  schema: F
}) {
  if (single && loader.kind !== 'file')
    throw new Error('gratis: a single needs file()')
  if (!single && loader.kind !== 'glob')
    throw new Error('gratis: a collection needs glob()')
  const source =
    loader.kind === 'file' ? loader.path : loader.base.replace(/\/?$/, '/')

  // In template mode the entry holds sentinels, so every field accepts anything. The type is the
  // real one either way: pages are written against real entries.
  const schema = (isTemplateMode()
    ? z.object(Object.fromEntries(Object.keys(fields).map((k) => [k, z.any()])))
    : z.object(
        Object.fromEntries(
          Object.entries(fields).map(([k, f]) => [k, zodSchemas[f.type]()]),
        ),
      )) as unknown as z.ZodObject<Shape<F>>

  return {
    // What Astro's own defineCollection sets for a collection with a loader.
    type: 'content_layer' as const,
    schema,
    loader: {
      name: 'gratis',
      async load({ collection: name, store, parseData, config, watcher }) {
        const collection: Collection = {
          single,
          label: readable(name),
          source,
          fields: Object.fromEntries(
            Object.entries(fields).map(([key, { label, ...field }]) => [
              key,
              JSON.parse(
                JSON.stringify({ ...field, label: label ?? readable(key) }),
              ),
            ]),
          ),
        }
        state().collections[name] = collection
        const root = config.root
        const path = fileURLToPath(new URL(source, root))
        const sync = async () => {
          store.clear()
          if (single) {
            const data = isTemplateMode()
              ? Object.fromEntries(
                  Object.keys(fields).map((k) => [
                    k,
                    sentinel('entry', name, k),
                  ]),
                )
              : JSON.parse(await readFile(path, 'utf8'))
            store.set({ id: name, data: await parseData({ id: name, data }) })
          } else if (!isTemplateMode()) {
            // In template mode a collection stores nothing: getCollection returns its placeholder.
            for (const id of await sourceIds(root, collection)) {
              const data = JSON.parse(
                await readFile(
                  new URL(sourcePath(collection, id), root),
                  'utf8',
                ),
              )
              store.set({ id, data: await parseData({ id, data }) })
            }
          }
        }
        await sync()
        // In dev, an admin save (or a hand edit) rewrites a file; reload it like Astro's loaders do.
        watcher?.add(path)
        const reload = (changed: string) =>
          (single
            ? changed === path
            : changed.startsWith(path) && changed.endsWith('.json')) && sync()
        for (const event of ['change', 'add', 'unlink'] as const)
          watcher?.on(event, reload)
      },
    } satisfies Loader,
  }
}
