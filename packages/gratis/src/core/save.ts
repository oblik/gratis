import { contentKey, ROUTES, templateKey } from './bucket.ts'
import {
  planCreate,
  planDelete,
  planRender,
  planSave,
  type Edit,
  type Write,
} from './plan.ts'
import { routesJson, type Routes } from './routes.ts'
import type { Fields } from './schema.ts'
import { readContent, required, type Site } from './site.ts'
import { render } from './template/render.ts'

export type OnPage = (path: string) => void

const HTML = 'text/html; charset=utf-8'
const JSON_TYPE = 'application/json'

/** Writes routes.json, conditional on the version last read or written. */
async function putRoutes(site: Site, routes: Routes) {
  await site.objects.put(ROUTES, routesJson(routes), {
    type: JSON_TYPE,
    ifMatch: site.objects.peek(ROUTES)?.etag,
  })
  site.routes = routes
}

async function write(site: Site, write: Write) {
  if ('delete' in write) return site.objects.delete(write.key)
  const { key, put, ifMatch, ifNoneMatch } = write
  await site.objects.put(key, put, { type: JSON_TYPE, ifMatch, ifNoneMatch })
}

/** Also records the pages' new dependencies in site.routes. */
async function renderPages(site: Site, paths: string[], onPage?: OnPage) {
  const content = await readContent(site)
  for (const path of paths) {
    const page = site.routes.pages[path]
    if (!page) continue // deleted since it was queued
    const template = await required(site.objects, templateKey(page.template))
    const { html, deps } = render(
      template.text,
      { content, entry: page.entry },
      site.dom,
    )
    await site.objects.put(page.file, html, { type: HTML })
    Object.assign(page, { deps, updated: new Date().toISOString() })
    onPage?.(path)
  }
}

/**
 * The pages to render are queued in routes.json before the content write and
 * unqueued only once they're rendered, so a tab that dies midway leaves a queue
 * for the next session's renderPending. Returns the pages rendered, including
 * any an earlier save left queued.
 */
export async function commit(site: Site, edit: Edit, onPage?: OnPage) {
  const before = site.routes
  const pending = [...new Set([...before._pending, ...edit.render])]
  await putRoutes(site, {
    pages: edit.pages ?? before.pages,
    _pending: pending,
  })
  try {
    if (edit.write) await write(site, edit.write)
  } catch (error) {
    // The write didn't happen, so neither did the pages it added or removed.
    // The queue stays: rendering a page again is harmless.
    if (edit.pages) {
      const restored = {
        pages: before.pages,
        _pending: pending.filter((path) => path in before.pages),
      }
      await putRoutes(site, restored).catch(() => (site.routes = restored))
    }
    throw error
  }
  if (edit.entries) site.entries = edit.entries
  for (const key of edit.remove) await site.objects.delete(key)
  await renderPages(site, pending, onPage)
  await putRoutes(site, { ...site.routes, _pending: [] })
  return pending
}

/** `etag` is the version the edit started from, by default the cached one. */
export function saveEntry(
  site: Site,
  key: string,
  fields: Fields,
  { etag }: { etag?: string } = {},
  onPage?: OnPage,
) {
  const file = site.objects.peek(contentKey(key))
  const before: Fields = file ? JSON.parse(file.text) : {}
  return commit(
    site,
    planSave(site, key, { before, after: fields, etag: etag ?? file?.etag }),
    onPage,
  )
}

export const createEntry = (
  site: Site,
  collection: string,
  id: string,
  fields: Fields,
  onPage?: OnPage,
) => commit(site, planCreate(site, collection, id, fields), onPage)

export const deleteEntry = (site: Site, key: string, onPage?: OnPage) =>
  commit(site, planDelete(site, key), onPage)

/** Finishes an interrupted save. */
export const renderPending = async (site: Site, onPage?: OnPage) =>
  site.routes._pending.length ? commit(site, planRender(site, []), onPage) : []

export const renderAll = (site: Site, onPage?: OnPage) =>
  commit(site, planRender(site), onPage)
