// The emulator's backend in `astro dev`: entries are the loaders' files, the schema is compiled
// from the content config on each read, and the admin is served from the package's build. No page
// is listed in routes.json, so a save writes only the entry and Astro re-renders on its own.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'

import {
  collectionFolder,
  json,
  parseContentKey,
  parseKey,
  ROUTES,
  SCHEMA,
} from '../core/bucket.ts'
import { sourcePath, type Schema } from '../core/schema.ts'
import { memoryBackend, type Backend } from '../emulator/index.ts'
import { state } from './template.ts'

const encode = (text: string) => new TextEncoder().encode(text)

// Tells the admin to skip the login and use this origin as its endpoint (see admin/session.ts).
const LOCAL_META = '<meta name="gratis-storage" content="local">'

const orNull = <T>(promise: Promise<T>) =>
  promise.catch((error: NodeJS.ErrnoException) =>
    error.code === 'ENOENT' || error.code === 'EISDIR'
      ? null
      : Promise.reject(error),
  )

export function devBackend({
  root,
  adminDist,
}: {
  root: URL
  adminDist: URL
}): Backend {
  const memory = memoryBackend({ [ROUTES]: json({ pages: {}, _pending: [] }) })
  const schema = (): Schema => ({
    collections: state().collections,
    routes: {},
  })
  // The repo file behind a content key, if it is an entry of a known collection.
  const sourceOf = (key: string) => {
    const entry = parseContentKey(key)
    if (entry == null) return undefined
    const { collection: name, id } = parseKey(entry)
    const collection = schema().collections[name]
    if (!collection || collection.single !== (id == null)) return undefined
    return new URL(sourcePath(collection, id), root)
  }

  return {
    async read(key) {
      if (key === SCHEMA) return encode(json(schema()))
      if (key === ROUTES) return memory.read(key)
      const source = sourceOf(key)
      if (source) return orNull(readFile(source))
      if (key === 'admin/index.html') {
        const html = await orNull(
          readFile(new URL('index.html', adminDist), 'utf8'),
        )
        return html == null
          ? null
          : encode(html.replace('<head>', `<head>\n  ${LOCAL_META}`))
      }
      if (key.startsWith('admin/'))
        return orNull(readFile(new URL(key.slice('admin/'.length), adminDist)))
      return null
    },
    async write(key, body) {
      if (key === ROUTES) return memory.write(key, body)
      const source = sourceOf(key)
      if (source) {
        await mkdir(new URL('.', source), { recursive: true })
        return writeFile(source, body)
      }
      // Page writes: nothing to do, Astro renders the pages in dev.
    },
    async remove(key) {
      const source = sourceOf(key)
      if (source) return rm(source, { force: true })
      return memory.remove(key)
    },
    // Only collection folders are listed: the admin lists nothing else.
    async list(prefix) {
      const keys: string[] = []
      for (const [name, collection] of Object.entries(schema().collections)) {
        const folder = collectionFolder(name)
        if (
          collection.single ||
          !(folder.startsWith(prefix) || prefix.startsWith(folder))
        )
          continue
        const names =
          (await orNull(readdir(new URL(collection.source, root)))) ?? []
        keys.push(
          ...names
            .filter((name) => name.endsWith('.json'))
            .map((name) => folder + name)
            .filter((key) => key.startsWith(prefix)),
        )
      }
      return keys.sort()
    },
  }
}
