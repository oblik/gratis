// The repo's content files under the bucket's content keys: with `posts` at
// `src/data/posts/`, `_gratis/content/posts/hello.json` is
// `src/data/posts/hello.json`.

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'

import {
  collectionFolder,
  CONTENT,
  contentKey,
  entryKey,
  parseContentKey,
  parseKey,
} from '../core/bucket.ts'
import type { Collection } from '../core/schema.ts'
import type { Content } from '../core/template/render.ts'
import { orNull, type Backend } from '../emulator/index.ts'

const sourcePath = ({ single, source }: Collection, id?: string) =>
  single ? source : `${source}${id}.json`

/**
 * `collections` is a getter because in dev the loaders record collections as
 * they run. Keys that aren't an entry of a known collection read as missing and
 * can't be written.
 */
export function repoContent(
  root: URL,
  collections: () => Record<string, Collection>,
): Backend {
  const fileOf = (key: string) => {
    const entry = parseContentKey(key)
    if (entry == null) return undefined
    const { collection: name, id } = parseKey(entry)
    const collection = collections()[name]
    if (!collection || collection.single !== (id == null)) return undefined
    // An id is one file name: never a path out of the collection's folder.
    if (id != null && /[/\\]/.test(id)) return undefined
    return new URL(sourcePath(collection, id), root)
  }
  const required = (key: string) => {
    const file = fileOf(key)
    if (!file) throw new Error(`gratis: ${key} isn't an entry's content file`)
    return file
  }

  return {
    read: async (key) => {
      const file = fileOf(key)
      return file ? orNull(readFile(file)) : null
    },
    async write(key, body) {
      const file = required(key)
      await mkdir(new URL('.', file), { recursive: true })
      await writeFile(file, body)
    },
    remove: (key) => rm(required(key), { force: true }),
    async list(prefix) {
      const keys: string[] = []
      for (const [name, collection] of Object.entries(collections())) {
        if (collection.single) {
          const key = contentKey(name)
          if (
            key.startsWith(prefix) &&
            (await orNull(stat(new URL(collection.source, root))))?.isFile()
          )
            keys.push(key)
          continue
        }
        const folder = collectionFolder(name)
        if (!(folder.startsWith(prefix) || prefix.startsWith(folder))) continue
        const names =
          (await orNull(readdir(new URL(collection.source, root)))) ?? []
        for (const file of names) {
          const id = file.slice(0, -'.json'.length)
          const key = contentKey(entryKey(name, id))
          if (file.endsWith('.json') && key.startsWith(prefix)) keys.push(key)
        }
      }
      return keys.sort()
    },
  }
}

export async function readContent(content: Backend): Promise<Content> {
  const result: Content = {}
  for (const key of await content.list(CONTENT))
    result[parseContentKey(key)!] = JSON.parse(
      new TextDecoder().decode((await content.read(key))!),
    )
  return result
}
