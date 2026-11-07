// What `astro build` leaves in dist/ besides the site (notes/astro.md): the templates from a second
// build in template mode, schema.json, routes.json, the admin SPA and the content files, so dist/
// is a complete bucket.

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AstroIntegrationLogger } from 'astro'
import { JSDOM } from 'jsdom'

import {
  CONTENT,
  json,
  parseKey,
  ROUTES,
  SCHEMA,
  templateId,
  templateKey,
  TEMPLATES,
} from '../core/bucket.ts'
import { listPages, type Routes } from '../core/routes.ts'
import type { RouteBinding, Schema } from '../core/schema.ts'
import { render, type Content } from '../core/template/render.ts'
import { folderBackend } from '../emulator/index.ts'
import { readContent, repoContent } from './repo.ts'
import { state } from './state.ts'
import { inTemplateMode, routeBinding } from './template-mode.ts'

export const adminDist = new URL('../../dist/admin/', import.meta.url)
export const ADMIN_MISSING =
  'the admin SPA is not built; run `pnpm build` in packages/gratis'

async function write(url: URL, text: string | Uint8Array) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true })
  await writeFile(url, text)
}

const unixPath = (from: URL, to: URL) =>
  relative(fileURLToPath(from), fileURLToPath(to)).split('\\').join('/')

/** The template pass (template-mode.ts): the same build again, into `scratch`. */
async function buildTemplates(root: URL, scratch: URL) {
  const { build } = await import('astro')
  await inTemplateMode(() =>
    build({
      root: fileURLToPath(root),
      outDir: fileURLToPath(scratch),
      cacheDir: fileURLToPath(new URL('node_modules/.astro/gratis/', root)),
      logLevel: 'warn',
    }),
  )
  return state().templateRoutes!
}

/**
 * Copies the templates into dist/ by template id. A dynamic route was built once, at its
 * collection's placeholder id, which binds the route to that collection.
 */
async function writeTemplates(
  scratch: URL,
  dir: URL,
  templateRoutes: Map<string, URL[]>,
) {
  await rm(new URL(TEMPLATES, dir), { recursive: true, force: true })
  const bindings: Record<string, RouteBinding> = {}
  for (const [pattern, [url]] of templateRoutes) {
    const id = templateId(pattern)
    await write(new URL(templateKey(id), dir), await readFile(url))
    const binding = routeBinding(id, unixPath(scratch, url))
    if (binding) bindings[id] = binding
  }
  return bindings
}

/** The ids of each collection's entries in `content`. */
function entryIds(content: Content) {
  const ids: Record<string, string[]> = {}
  for (const key of Object.keys(content)) {
    const { collection, id } = parseKey(key)
    if (id != null) (ids[collection] ??= []).push(id)
  }
  return ids
}

/**
 * routes.json, from rendering every page with the Node renderer. A page that renders differently
 * from the real build derives something from a read the editor can't reproduce.
 */
async function writeRoutes(
  dir: URL,
  assets: Map<string, URL[]>,
  schema: Schema,
  content: Content,
  ids: Record<string, string[]>,
  logger: AstroIntegrationLogger,
) {
  const built = Object.fromEntries(
    [...assets].map(([pattern, [url]]) => [pattern, unixPath(dir, url)]),
  )
  const { pages, unbound } = listPages(built, schema.routes, ids)
  for (const pattern of unbound)
    logger.warn(
      `${pattern}: only dynamic routes over a Gratis collection's ids are supported; it won't be editable`,
    )

  const { DOMParser } = new JSDOM('').window
  const normalize = (html: string) =>
    render(html, { content: {} }, { DOMParser }).html
  const updated = new Date().toISOString()
  for (const [path, page] of Object.entries(pages)) {
    const { html, deps } = render(
      await readFile(new URL(templateKey(page.template), dir), 'utf8'),
      { content, entry: page.entry },
      { DOMParser },
    )
    const file = await readFile(new URL(page.file, dir), 'utf8').catch(
      () => null,
    )
    if (file == null) logger.warn(`${path}: the build has no ${page.file}`)
    else if (html !== normalize(file))
      logger.warn(
        `${path}: rendering the template doesn't reproduce the built page; edits to it may differ from a build`,
      )
    Object.assign(page, { deps, updated })
  }
  const routes: Routes = { pages, _pending: [] }
  await write(new URL(ROUTES, dir), json(routes))
  return Object.keys(pages).length
}

export async function finishBuild({
  root,
  dir,
  assets,
  logger,
}: {
  root: URL
  dir: URL
  assets: Map<string, URL[]>
  logger: AstroIntegrationLogger
}) {
  const scratch = new URL('.gratis/', root)
  const templateRoutes = await buildTemplates(root, scratch)
  const routes = await writeTemplates(scratch, dir, templateRoutes)

  const schema: Schema = { collections: state().collections, routes }
  await write(new URL(SCHEMA, dir), json(schema))

  const repo = repoContent(root, () => schema.collections)
  const content = await readContent(repo)
  const pages = await writeRoutes(
    dir,
    assets,
    schema,
    content,
    entryIds(content),
    logger,
  )

  await access(adminDist).then(
    () => cp(adminDist, new URL('admin/', dir), { recursive: true }),
    () => logger.warn(ADMIN_MISSING),
  )

  // The content files in the bucket layout, so dist/ is a complete site.
  const files = folderBackend(fileURLToPath(dir))
  for (const key of await repo.list(CONTENT))
    await files.write(key, (await repo.read(key))!)

  logger.info(`${templateRoutes.size} template(s), ${pages} page(s)`)
}
