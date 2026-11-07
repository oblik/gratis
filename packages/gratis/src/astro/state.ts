// What the integration's hooks and the content config's loaders share. Vite may load the config's
// module graph and the content config's as separate instances in the same process, so it lives on
// globalThis.

import type { Collection } from '../core/schema.ts'

interface State {
  /** What the loaders recorded, compiled into schema.json by the build and by the dev server. */
  collections: Record<string, Collection>
  /** The template pass's output, per route pattern, reported back by its nested build. */
  templateRoutes?: Map<string, URL[]>
}

declare global {
  var __gratis: State | undefined
}

export function state(): State {
  return (globalThis.__gratis ??= { collections: {} })
}
