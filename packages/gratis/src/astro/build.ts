import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Static: a dynamic import() fails when the site's config is TypeScript, because
// Astro loads it through a Vite module runner that is closed by build time.
import { build, type AstroIntegrationLogger } from 'astro'
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
import { listPages, routesJson, type Routes } from '../core/routes.ts'
import type { RouteBinding, Schema } from '../core/schema.ts'
import { render, type Content, type Dom } from '../core/template/render.ts'
import { hasValues } from '../core/template/sentinels.ts'
import { folderBackend } from '../emulator/index.ts'
import { readContent, repoContent } from './repo.ts'
import { state } from './state.ts'
import {
  hasPlaceholder,
  inTemplateMode,
  routeBinding,
} from './template-mode.ts'

export const adminDist = new URL('../../dist/admin/', import.meta.url)
export const ADMIN_MISSING =
  'the admin SPA is not built; run `pnpm build` in packages/gratis'

async function write(url: URL, text: string | Uint8Array) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true })
  await writeFile(url, text)
}

const unixPath = (from: URL, to: URL) =>
  relative(fileURLToPath(from), fileURLToPath(to)).split('\\').join('/')

async function buildTemplates(root: URL, scratch: URL) {
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
 * Throws for an island Astro renders on the server with content in its props.
 * Its framework renders that HTML from the props, and an editor's save, which
 * only fills templates, can't run that renderer, so the HTML would keep the
 * build's content. A `client:only` island has no such HTML, and children are
 * HTML that Astro renders, which saves fill like any other.
 */
export function checkIslands(
  template: string,
  route: string,
  { DOMParser }: Dom,
) {
  const doc = new DOMParser().parseFromString(template, 'text/html')
  // Astro puts the children of an island it doesn't render on the server in a
  // <template>, whose content the DOM keeps apart.
  const islands = (root: ParentNode): Element[] => [
    ...root.querySelectorAll('astro-island'),
    ...[...root.querySelectorAll('template')].flatMap((template) =>
      islands(template.content),
    ),
  ]
  const invalidIsland = islands(doc).find((island) => {
    const props = island.getAttribute('props') ?? ''
    return (
      island.getAttribute('client') !== 'only' &&
      (hasValues(props) || hasPlaceholder(props))
    )
  })
  if (!invalidIsland) return
  // `value` is the directive's argument, like client:media's query, or `true`.
  const { name, value } = JSON.parse(invalidIsland.getAttribute('opts') ?? '{}')
  const client = `client:${invalidIsland.getAttribute('client')}${typeof value === 'string' && value ? `="${value}"` : ''}`
  throw new Error(
    `gratis: ${route}: <${name} ${client}> gets content through its props, which an editor's save can't render on the server. Either:
- make it client:only
- or pass the content as children instead of props: Astro renders that HTML, so saves fill it and it stays server-rendered`,
  )
}

/**
 * Returns the route bindings, read from the paths the dynamic routes were built
 * at.
 */
async function writeTemplates(
  scratch: URL,
  dir: URL,
  templateRoutes: Map<string, URL[]>,
) {
  await rm(new URL(TEMPLATES, dir), { recursive: true, force: true })
  const bindings: Record<string, RouteBinding> = {}
  const { DOMParser } = new JSDOM('').window
  for (const [pattern, [url]] of templateRoutes) {
    const id = templateId(pattern)
    const template = await readFile(url, 'utf8')
    checkIslands(template, pattern, { DOMParser })
    await write(new URL(templateKey(id), dir), template)
    const binding = routeBinding(id, unixPath(scratch, url))
    if (binding) bindings[id] = binding
  }
  return bindings
}

function entryIds(content: Content) {
  const ids: Record<string, string[]> = {}
  for (const key of Object.keys(content)) {
    const { collection, id } = parseKey(key)
    if (id != null) (ids[collection] ??= []).push(id)
  }
  return ids
}

/**
 * Renders every page to record its dependencies. A page that renders
 * differently from the real build derives something from a read that the editor
 * can't reproduce, so it gets a warning.
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
  const { pages, unbound } = listPages(built, schema.bindings, ids)
  for (const pattern of unbound)
    logger.warn(
      `${pattern}: only dynamic routes over a Gratis collection's ids are supported; it won't be editable`,
    )

  const { DOMParser } = new JSDOM('').window
  // An island's uid is a hash of its props and HTML, so it's stale once the
  // content changes. Only Astro's dev server reads it, though, so it's left out
  // of the comparison.
  const comparable = (html: string) =>
    html.replace(/(<astro-island\b[^>]*?) uid="[^"]*"/g, '$1')
  const normalize = (html: string) =>
    comparable(render(html, { content: {} }, { DOMParser }).html)
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
    else if (comparable(html) !== normalize(file))
      logger.warn(
        `${path}: rendering the template doesn't reproduce the built page; edits to it may differ from a build`,
      )
    Object.assign(page, { deps, updated })
  }
  const routes: Routes = { pages, _pending: [] }
  await write(new URL(ROUTES, dir), routesJson(routes))
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
  // A folder of its own, since Astro empties it and the local bucket is a
  // sibling. Nothing reads it once the templates are in dir, and its leftover
  // placeholder pages would pass for real output, so a successful build
  // removes it. A failed one keeps it to debug from.
  const scratch = new URL('.gratis/build/', root)
  const templateRoutes = await buildTemplates(root, scratch)
  const bindings = await writeTemplates(scratch, dir, templateRoutes)

  const schema: Schema = { collections: state().collections, bindings }
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

  // So dist/ is a complete bucket.
  const files = folderBackend(fileURLToPath(dir))
  for (const key of await repo.list(CONTENT))
    await files.write(key, (await repo.read(key))!)

  await rm(scratch, { recursive: true, force: true })
  logger.info(`${templateRoutes.size} template(s), ${pages} page(s)`)
}
