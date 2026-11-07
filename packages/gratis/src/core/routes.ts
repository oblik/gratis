// routes.json (notes/content.md): every page of the site, the template it renders from, and the
// entries and queries it read the last time it was rendered. Pure functions over that data, so
// "which pages does this edit touch" is answered without storage or a DOM.
//
// A page is named by its path (`/`, `/blog/hello`). A dynamic route's pages come from a binding
// in schema.json: one page per entry of the bound collection.

import { entryKey, parseKey, templateId } from './bucket.ts'
import type { RouteBinding } from './schema.ts'
import type { Deps } from './template/render.ts'

export interface Page {
  /** The template id, see templateId(). */
  template: string
  /** The object key of the page's HTML. */
  file: string
  /** The entry key of a dynamic route's page: the entry its `route` sentinels read. */
  entry?: string
  deps: Deps
  /** When the page was last rendered, or `''` if it hasn't been yet. */
  updated: string
}
export interface Routes {
  pages: Record<string, Page>
  /** Pages queued for rendering by a save in progress, or interrupted (notes/editing.md). */
  _pending: string[]
}

/** A page that hasn't been rendered yet: all it is known to read is its own entry. */
const unrendered = (template: string, file: string, entry?: string): Page => ({
  template,
  file,
  ...(entry && { entry }),
  deps: { entries: entry ? [entry] : [], collections: {} },
  updated: '',
})

/** The path and file of an entry's page on a bound route: the route with the id as its param. */
function bindRoute(template: string, binding: RouteBinding, id: string) {
  const at = (s: string) => s.replace(`[${binding.param}]`, id)
  return { path: at(template), file: at(binding.file) }
}

/** The pages an entry gets: one per route bound to its collection. */
export function entryPages(
  bindings: Record<string, RouteBinding>,
  collection: string,
  id: string,
): Record<string, Page> {
  const pages: Record<string, Page> = {}
  for (const [template, binding] of Object.entries(bindings)) {
    if (binding.collection !== collection) continue
    const { path, file } = bindRoute(template, binding, id)
    pages[path] = unrendered(template, file, entryKey(collection, id))
  }
  return pages
}

/**
 * Every page of a built site, none rendered yet. `built` maps each route pattern to the file the
 * build wrote for it; a bound route instead gets a page per id in `ids`. A dynamic route that isn't
 * bound to a collection can't be rendered by the editor, so it's returned in `unbound` instead.
 */
export function listPages(
  built: Record<string, string>,
  bindings: Record<string, RouteBinding>,
  ids: Record<string, string[]>,
): { pages: Record<string, Page>; unbound: string[] } {
  const pages: Record<string, Page> = {}
  const unbound: string[] = []
  for (const [pattern, file] of Object.entries(built)) {
    const template = templateId(pattern)
    const binding = bindings[template]
    if (binding)
      for (const id of ids[binding.collection] ?? []) {
        const page = bindRoute(template, binding, id)
        pages[page.path] = unrendered(
          template,
          page.file,
          entryKey(binding.collection, id),
        )
      }
    else if (pattern.includes('[')) unbound.push(pattern)
    else pages[pattern] = unrendered(template, file)
  }
  return { pages, unbound }
}

/** The pages of an entry's own: the ones its `route` sentinels fill. */
export const ownPages = (routes: Routes, key: string) =>
  Object.keys(routes.pages).filter((path) => routes.pages[path].entry === key)

/**
 * The pages a change to an entry has to re-render: the ones that read it, and the ones that query
 * its collection by one of `fields`. Without `fields`, any query of the collection counts: a new
 * or deleted entry can change every query's result.
 */
export function dependents(routes: Routes, key: string, fields?: string[]) {
  const { collection } = parseKey(key)
  return Object.keys(routes.pages).filter((path) => {
    const { deps } = routes.pages[path]
    const queried = deps.collections[collection]
    return (
      deps.entries.includes(key) ||
      (queried != null &&
        (!fields || queried.some((field) => fields.includes(field))))
    )
  })
}

/** What deleting an entry touches: its own pages, deleted, and the others, re-rendered. */
export function affectedBy(routes: Routes, key: string) {
  const own = ownPages(routes, key)
  return {
    own,
    others: dependents(routes, key).filter((path) => !own.includes(path)),
  }
}
