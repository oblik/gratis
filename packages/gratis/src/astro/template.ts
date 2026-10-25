// The template pass (notes/astro.md): a second build in which the getters hand out placeholders
// whose reads emit sentinels, and `Each` and `If` wrap their content in markers.
//
// The state is shared across the config's module graph and the content config's, which Vite may
// load as separate instances in the same process, so it lives on globalThis.

import type { Collection } from '../core/schema.ts'

interface State {
  /** What the loaders recorded, compiled into schema.json by the build and by the dev server. */
  collections: Record<string, Collection>
  /** The template pass's output, per route pattern. */
  templateRoutes?: Map<string, URL[]>
}

declare global {
  var __gratis: State | undefined
}

export const isTemplateMode = () => process.env.GRATIS_MODE === 'template'

export function state(): State {
  return (globalThis.__gratis ??= { collections: {} })
}

export const sentinel = (...path: string[]) => `{{gratis:${path.join(':')}}}`

// The id of a collection's one placeholder entry in template mode. It lands in route params, so the
// build can tell which collection a dynamic route is bound to from the path it was built at.
export const placeholderId = (collection: string) =>
  `gratis-placeholder-${collection}`
export const PLACEHOLDER_ID = /gratis-placeholder-([\w-]+)/

// A value that `Each` or `If` turns into a marker carries its ref: a sentinel string, or a template
// mode query, which holds it under this symbol (a registered one, for the same reason as the state).
export const MARKER = Symbol.for('gratis.marker')

export function markerOf(value: unknown): string | undefined {
  if (!isTemplateMode()) return undefined
  if (value != null && typeof value === 'object' && MARKER in value)
    return (value as Record<symbol, string>)[MARKER]
  return String(value).match(/^\{\{gratis:(.+)\}\}$/)?.[1]
}
