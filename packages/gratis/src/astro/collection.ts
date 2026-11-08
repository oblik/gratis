import { fileURLToPath } from 'node:url'

import type { Loader } from 'astro/loaders'
import { z } from 'astro/zod'

import { parseKey } from '../core/bucket.ts'
import type { Collection } from '../core/schema.ts'
import { zodSchemas, type FieldConfig, type Shape } from './fields.ts'
import { readContent, repoContent } from './repo.ts'
import { register } from './state.ts'
import { anyFields, isTemplateMode, singleEntry } from './template-mode.ts'

export const file = (path: string) => ({ kind: 'file' as const, path })

export function glob({ pattern, base }: { pattern: string; base: string }) {
  if (pattern !== '*.json')
    throw new Error('gratis: glob() supports only the pattern *.json so far')
  return { kind: 'glob' as const, base }
}

/**
 * Counts defineCollection calls, which the content config makes in its own
 * order.
 */
let defineCalls = 0

const readable = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

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
  const position = defineCalls++
  const source =
    loader.kind === 'file' ? loader.path : loader.base.replace(/\/?$/, '/')

  // The type is the real one either way: pages are written against real
  // entries.
  const schema = (isTemplateMode()
    ? anyFields(Object.keys(fields))
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
        register(name, position, collection)
        const root = config.root
        const path = fileURLToPath(new URL(source, root))
        const repo = repoContent(root, () => ({ [name]: collection }))
        const sync = async () => {
          store.clear()
          if (isTemplateMode()) {
            // A collection stores nothing: getCollection returns its
            // placeholder.
            if (single) {
              const data = singleEntry(name, Object.keys(fields))
              store.set({ id: name, data: await parseData({ id: name, data }) })
            }
            return
          }
          const content = await readContent(repo)
          if (single && !content[name])
            throw new Error(
              `gratis: ${source}, the content of ${name}, is missing`,
            )
          for (const [key, data] of Object.entries(content)) {
            const id = parseKey(key).id ?? name
            store.set({ id, data: await parseData({ id, data }) })
          }
        }
        await sync()
        // In dev, an admin save (or a hand edit) rewrites a file; reload it
        // like Astro's loaders do.
        watcher?.add(path)
        const reload = (changed: string) =>
          (loader.kind === 'file'
            ? changed === path
            : changed.startsWith(path) && changed.endsWith('.json')) && sync()
        for (const event of ['change', 'add', 'unlink'] as const)
          watcher?.on(event, reload)
      },
    } satisfies Loader,
  }
}
