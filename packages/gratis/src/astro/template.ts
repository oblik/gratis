// The template pass (notes/astro.md): a second build in which the getters hand out placeholders
// whose reads emit sentinels, and `Each` and `If` wrap their content in markers. The sentinels
// and markers themselves are core/template/sentinels.ts.
//
// The state is shared across the config's module graph and the content config's, which Vite may
// load as separate instances in the same process, so it lives on globalThis.

import type { Collection } from '../core/schema.ts'
import {
  parseValue,
  type ListRef,
  type ValueRef,
} from '../core/template/sentinels.ts'

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

// The id of a collection's one placeholder entry in template mode. It lands in route params, so the
// build can tell which collection a dynamic route is bound to from the path it was built at.
export const placeholderId = (collection: string) =>
  `gratis-placeholder-${collection}`
export const PLACEHOLDER_ID = /gratis-placeholder-([\w-]+)/

// A template-mode `getCollection` result carries the list it stands for under this symbol, for
// `Each` to put in its marker (a registered symbol, for the same reason as the state).
export const LIST = Symbol.for('gratis.list')

/** In template mode, the list a `getCollection` result stands for. */
export function listOf(value: unknown): ListRef | undefined {
  if (!isTemplateMode() || value == null || typeof value !== 'object')
    return undefined
  return (value as Record<symbol, ListRef | undefined>)[LIST]
}

/** In template mode, the value a field read stands for: its sentinel, parsed. */
export const valueOf = (value: unknown): ValueRef | undefined =>
  isTemplateMode() && typeof value === 'string' ? parseValue(value) : undefined
