// The repo's content files under the bucket's content keys: with `posts` at
// `src/data/posts/`, `_gratis/content/posts/hello.json` is
// `src/data/posts/hello.json`. With `tags` at `src/data/tags.json`,
// `_gratis/content/tags/travel.json` is that file's `travel` property: the
// bucket keeps one object per entry either way.

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'

import {
  collectionFolder,
  CONTENT,
  contentKey,
  entryKey,
  isEntryId,
  json,
  parseContentKey,
  parseKey,
} from '../core/bucket.ts'
import type { Collection } from '../core/schema.ts'
import type { Content } from '../core/template/render.ts'
import { orNull, type Backend } from '../emulator/index.ts'

/** An entry's file, and its property when the file holds a whole collection. */
interface Location {
  file: URL
  property?: string
}

const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

const isSharedFile = ({ single, source }: Collection) =>
  !single && !source.endsWith('/')

/**
 * A shared file's text, its entries sorted by id like an unsorted query lists
 * them. Written by hand because JSON.stringify follows the object's key order,
 * which puts integer keys like `2024` first.
 */
function sharedJson(entries: Record<string, unknown>) {
  const ids = Object.keys(entries).sort((a, b) => (a < b ? -1 : 1))
  if (!ids.length) return '{}\n'
  const lines = ids.map(
    (id) =>
      `  ${JSON.stringify(id)}: ${JSON.stringify(entries[id], null, 2).replaceAll('\n', '\n  ')}`,
  )
  return `{\n${lines.join(',\n')}\n}\n`
}

/** A shared file's entries by id. */
async function readShared(file: URL): Promise<Record<string, unknown>> {
  const text = await orNull(readFile(file, 'utf8'))
  if (text == null) return {}
  const entries: unknown = JSON.parse(text)
  if (typeof entries !== 'object' || entries == null || Array.isArray(entries))
    throw new Error(`gratis: ${file.pathname} must be an object keyed by id`)
  for (const id of Object.keys(entries))
    if (!isEntryId(id))
      throw new Error(
        `gratis: "${id}" in ${file.pathname} isn't a valid id: use lowercase letters, digits and dashes`,
      )
  return entries as Record<string, unknown>
}

async function writeFileIn(file: URL, body: Uint8Array | string) {
  await mkdir(new URL('.', file), { recursive: true })
  await writeFile(file, body)
}

/**
 * `collections` is a getter because in dev the loaders record collections as
 * they run. Keys that aren't an entry of a known collection read as missing and
 * can't be written.
 */
export function repoContent(
  root: URL,
  collections: () => Record<string, Collection>,
): Backend {
  const locate = (key: string): Location | undefined => {
    const entry = parseContentKey(key)
    if (entry == null) return undefined
    const { collection: name, id } = parseKey(entry)
    const collection = collections()[name]
    if (!collection || collection.single !== (id == null)) return undefined
    const source = new URL(collection.source, root)
    if (id == null) return { file: source }
    // An id is one file name: never a path out of the collection's folder.
    if (/[/\\]/.test(id)) return undefined
    return isSharedFile(collection)
      ? { file: source, property: id }
      : { file: new URL(`${id}.json`, source) }
  }
  const required = (key: string) => {
    const location = locate(key)
    if (!location)
      throw new Error(`gratis: ${key} isn't an entry's content file`)
    return location
  }

  return {
    async read(key) {
      const location = locate(key)
      if (!location) return null
      const { file, property } = location
      if (property == null) return orNull(readFile(file))
      const entries = await readShared(file)
      return Object.hasOwn(entries, property)
        ? encode(json(entries[property]))
        : null
    },
    async write(key, body) {
      const { file, property } = required(key)
      if (property == null) return writeFileIn(file, body)
      const entries = await readShared(file)
      entries[property] = JSON.parse(decode(body))
      await writeFileIn(file, sharedJson(entries))
    },
    async remove(key) {
      const { file, property } = required(key)
      if (property == null) return rm(file, { force: true })
      const entries = await readShared(file)
      if (!Object.hasOwn(entries, property)) return
      delete entries[property]
      await writeFile(file, sharedJson(entries))
    },
    async list(prefix) {
      const keys: string[] = []
      for (const [name, collection] of Object.entries(collections())) {
        const source = new URL(collection.source, root)
        if (collection.single) {
          const key = contentKey(name)
          if (key.startsWith(prefix) && (await orNull(stat(source)))?.isFile())
            keys.push(key)
          continue
        }
        const folder = collectionFolder(name)
        if (!(folder.startsWith(prefix) || prefix.startsWith(folder))) continue
        const ids = isSharedFile(collection)
          ? Object.keys(await readShared(source))
          : ((await orNull(readdir(source))) ?? [])
              .filter((file) => file.endsWith('.json'))
              .map((file) => file.slice(0, -'.json'.length))
        for (const id of ids) {
          const key = contentKey(entryKey(name, id))
          if (key.startsWith(prefix)) keys.push(key)
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
      decode((await content.read(key))!),
    )
  return result
}
