import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { ViteDevServer } from 'vite'

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
const local = (html: string) =>
  html.replace('<head>', `<head>\n  ${LOCAL_META}`)

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
    bindings: {},
  })
  const isContent = (key: string) => parseContentKey(key) != null

  async function readAdmin(path: string) {
    if (path !== 'index.html') return orNull(readFile(new URL(path, adminDist)))
    const html = await orNull(readFile(new URL(path, adminDist), 'utf8'))
    return html == null ? null : encode(local(html))
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

/**
 * Whether to serve the admin from its source. Only the monorepo's `pnpm dev`
 * turns this on, and sites always get the built admin.
 */
export const ADMIN_FROM_SOURCE = process.env.GRATIS_ADMIN === 'source'

// Vite is imported only in source mode, because it's a dev dependency of Gratis
// and a site that installs Gratis won't have it. The import is at the top level
// because an import inside the hook would fail in the monorepo: there, Astro
// loads this file through a temporary Vite instance, which it closes before
// running the hooks.
const vite = ADMIN_FROM_SOURCE ? await import('vite') : undefined

/**
 * Serves the admin from its source with hot updates, for working on Gratis
 * itself. Astro's dev server already has a Vite instance that builds the demo
 * site, but the admin gets a separate one, so that the admin's React and
 * Tailwind plugins don't affect the demo site's pages. Then, because the
 * admin's instance runs as middleware on Astro's dev server, the admin and its
 * hot updates are served on Astro's port.
 */
export function adminFromSource(httpServer: ViteDevServer['httpServer']) {
  return vite!.createServer({
    configFile: fileURLToPath(
      new URL('../../vite.admin.config.ts', import.meta.url),
    ),
    server: {
      middlewareMode: true,
      hmr: httpServer ? { server: httpServer } : undefined,
    },
    plugins: [{ name: 'gratis-local', transformIndexHtml: local }],
  })
}
