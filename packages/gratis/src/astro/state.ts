// Vite may load the Astro config's module graph and the content config's as
// separate instances in the same process, so what the integration's hooks and
// the loaders share lives on globalThis.

import type { Collection } from '../core/schema.ts'

interface State {
  /**
   * What the loaders recorded, compiled into schema.json by the build and by
   * the dev server.
   */
  collections: Record<string, Collection>
  /** Each collection's place among the content config's defineCollection calls. */
  order: Record<string, number>
  /**
   * The template pass's output, per route pattern, reported back by its nested
   * build.
   */
  templateRoutes?: Map<string, URL[]>
}

declare global {
  var __gratis: State | undefined
}

export function state(): State {
  return (globalThis.__gratis ??= { collections: {}, order: {} })
}

/**
 * Records a loaded collection, in the content config's order rather than the
 * order the loaders run in. Astro starts every loader at once and awaits some
 * setup before each one's load(), so they can arrive in a different order:
 * about 1 build in 6 of the example site put posts before site.
 */
export function register(
  name: string,
  position: number,
  collection: Collection,
) {
  const { collections, order } = state()
  order[name] = position
  state().collections = Object.fromEntries(
    Object.entries({ ...collections, [name]: collection }).sort(
      ([a], [b]) => order[a] - order[b] || a.localeCompare(b),
    ),
  )
}
