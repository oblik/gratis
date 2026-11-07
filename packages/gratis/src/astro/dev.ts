import { readFile } from 'node:fs/promises'

import { json, parseContentKey, ROUTES, SCHEMA } from '../core/bucket.ts'
import { routesJson, type Routes } from '../core/routes.ts'
import type { Schema } from '../core/schema.ts'
import { memoryBackend, orNull, type Backend } from '../emulator/index.ts'
import { repoContent } from './repo.ts'
import { state } from './state.ts'

const encode = (text: string) => new TextEncoder().encode(text)

/**
 * Tells the admin to skip the login and use this origin as its endpoint (see
 * admin/session.ts).
 */
const LOCAL_META = '<meta name="gratis-storage" content="local">'

const ADMIN = 'admin/'

/**
 * Other writes, like a page a save renders, are dropped: Astro re-renders on
 * its own.
 */
export function devBackend({
  root,
  adminDist,
}: {
  root: URL
  adminDist: URL
}): Backend {
  // No pages, so a save writes only the entry.
  const routes: Routes = { pages: {}, _pending: [] }
  const memory = memoryBackend({ [ROUTES]: routesJson(routes) })
  const content = repoContent(root, () => state().collections)
  const schema = (): Schema => ({
    collections: state().collections,
    routes: {},
  })
  const isContent = (key: string) => parseContentKey(key) != null

  async function readAdmin(path: string) {
    if (path !== 'index.html') return orNull(readFile(new URL(path, adminDist)))
    const html = await orNull(readFile(new URL(path, adminDist), 'utf8'))
    return html == null
      ? null
      : encode(html.replace('<head>', `<head>\n  ${LOCAL_META}`))
  }

  return {
    async read(key) {
      if (key === SCHEMA) return encode(json(schema()))
      if (key === ROUTES) return memory.read(key)
      if (isContent(key)) return content.read(key)
      if (key.startsWith(ADMIN)) return readAdmin(key.slice(ADMIN.length))
      return null
    },
    async write(key, body) {
      if (key === ROUTES) return memory.write(key, body)
      if (isContent(key)) return content.write(key, body)
    },
    async remove(key) {
      if (isContent(key)) return content.remove(key)
    },
    list: (prefix) => content.list(prefix),
  }
}
