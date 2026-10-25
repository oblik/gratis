// What `astro build` leaves in dist/ besides the site (notes/astro.md): the templates from a second
// build in template mode, schema.json, routes.json, the admin SPA and the content files, so dist/
// is a complete bucket.

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AstroIntegrationLogger } from 'astro'
import { JSDOM } from 'jsdom'

import {
  contentKey,
  entryKey,
  json,
  ROUTES,
  SCHEMA,
  templateId,
  templateKey,
  TEMPLATES,
  type Page,
} from '../core/bucket.ts'
import { render, type Content } from '../core/render.ts'
import {
  sourcePath,
  type Collection,
  type RouteBinding,
  type Schema,
} from '../core/schema.ts'
import { sourceIds } from './collection.ts'
import { PLACEHOLDER_ID, state } from './template.ts'

export const adminDist = new URL('../../dist/admin/', import.meta.url)
export const ADMIN_MISSING =
  'the admin SPA is not built; run `pnpm build` in packages/gratis'

async function write(url: URL, text: string | Uint8Array) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true })
  await writeFile(url, text)
}

const unixPath = (from: URL, to: URL) =>
  relative(fileURLToPath(from), fileURLToPath(to)).split('\\').join('/')

/** The template pass: the same build again with GRATIS_MODE=template, into `scratch`. */
async function buildTemplates(root: URL, scratch: URL) {
  process.env.GRATIS_MODE = 'template'
  try {
    const { build } = await import('astro')
    await build({
      root: fileURLToPath(root),
      outDir: fileURLToPath(scratch),
      cacheDir: fileURLToPath(new URL('node_modules/.astro/gratis/', root)),
      logLevel: 'warn',
    })
  } finally {
    delete process.env.GRATIS_MODE
  }
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
    const file = unixPath(scratch, url)
    const collection = file.match(PLACEHOLDER_ID)?.[1]
    const param = id.match(/\[(\w+)\]/)?.[1]
    if (collection && param)
      bindings[id] = {
        collection,
        param,
        file: file.replace(PLACEHOLDER_ID, `[${param}]`),
      }
  }
  return bindings
}

/** Every entry's fields, and the repo file each came from. */
async function readContent(root: URL, collections: Record<string, Collection>) {
  const content: Content = {}
  const sources: Record<string, URL> = {}
  const ids: Record<string, string[]> = {}
  for (const [name, collection] of Object.entries(collections)) {
    ids[name] = collection.single ? [] : await sourceIds(root, collection)
    for (const id of collection.single ? [undefined] : ids[name]) {
      const key = entryKey(name, id)
      sources[key] = new URL(sourcePath(collection, id), root)
      content[key] = JSON.parse(await readFile(sources[key], 'utf8'))
    }
  }
  return { content, sources, ids }
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
  const { DOMParser } = new JSDOM('').window
  const normalize = (html: string) =>
    render(html, { content: {} }, { DOMParser }).html
  const pages: Record<string, Page> = {}
  const updated = new Date().toISOString()
  const add = async (
    path: string,
    template: string,
    file: string,
    entry?: string,
  ) => {
    const { html, deps } = render(
      await readFile(new URL(templateKey(template), dir), 'utf8'),
      { content, entry },
      { DOMParser },
    )
    const built = await readFile(new URL(file, dir), 'utf8').catch(() => null)
    if (built == null) logger.warn(`${path}: the build has no ${file}`)
    else if (html !== normalize(built))
      logger.warn(
        `${path}: rendering the template doesn't reproduce the built page; edits to it may differ from a build`,
      )
    pages[path] = { template, file, ...(entry && { entry }), deps, updated }
  }
  for (const [pattern, urls] of assets) {
    const id = templateId(pattern)
    const binding = schema.routes[id]
    if (binding) {
      for (const entry of ids[binding.collection]) {
        const at = (s: string) => s.replace(`[${binding.param}]`, entry)
        await add(
          at(id),
          id,
          at(binding.file),
          entryKey(binding.collection, entry),
        )
      }
    } else if (pattern.includes('[')) {
      logger.warn(
        `${pattern}: only dynamic routes over a Gratis collection's ids are supported; it won't be editable`,
      )
    } else {
      await add(pattern, id, unixPath(dir, urls[0]))
    }
  }
  await write(new URL(ROUTES, dir), json({ pages, _pending: [] }))
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

  const { content, sources, ids } = await readContent(root, schema.collections)
  const pages = await writeRoutes(dir, assets, schema, content, ids, logger)

  await access(adminDist).then(
    () => cp(adminDist, new URL('admin/', dir), { recursive: true }),
    () => logger.warn(ADMIN_MISSING),
  )

  // The content files in the bucket layout, so dist/ is a complete site.
  for (const [key, source] of Object.entries(sources))
    await write(new URL(contentKey(key), dir), await readFile(source))

  logger.info(`${templateRoutes.size} template(s), ${pages} page(s)`)
}
