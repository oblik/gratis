// The template pass: the same Astro build run a second time, in which every
// read of Gratis content gives a sentinel instead of a value, so each route's
// output is a template the renderer can fill. Everything that differs in that
// pass is here.

import { z } from 'astro/zod'

import type { RouteBinding } from '../core/schema.ts'
import type { Query } from '../core/template/query.ts'
import {
  formatMarker,
  formatValue,
  parseValue,
  type ListRef,
  type ValueRef,
} from '../core/template/sentinels.ts'

const MODE = 'GRATIS_MODE'

export const isTemplateMode = () => process.env[MODE] === 'template'

/**
 * Runs `build` with template mode on: the pass is a nested build in the same
 * process.
 */
export async function inTemplateMode<T>(build: () => Promise<T>) {
  process.env[MODE] = 'template'
  try {
    return await build()
  } finally {
    delete process.env[MODE]
  }
}

/** Every field accepts a sentinel. */
export const anyFields = (fields: string[]) =>
  z.object(Object.fromEntries(fields.map((field) => [field, z.any()])))

/** `site.title` is `{{gratis:entry:site:title}}`. */
export const singleEntry = (collection: string, fields: string[]) =>
  Object.fromEntries(
    fields.map((field) => [
      field,
      formatValue({ scope: 'entry', key: collection, field }),
    ]),
  )

const placeholderId = (collection: string) => `gratis-placeholder-${collection}`
const PLACEHOLDER_ID = /gratis-placeholder-([\w-]+)/

/**
 * A getCollection result carries the list it stands for under this symbol, for
 * `Each` to put in its marker. A registered symbol, since the getters and the
 * components may be loaded as separate module instances.
 */
const LIST = Symbol.for('gratis.list')

/**
 * `getCollection`'s result: one placeholder entry, standing for the list
 * `query` selects. Read outside an `Each`, it is the page's own entry
 * (`{{gratis:route:title}}`). A dynamic route's getStaticPaths puts its id in
 * the params, so the pass builds the route exactly once, at a path that names
 * the collection (routeBinding).
 */
export function placeholderList(
  collection: string,
  query: Query,
): Record<string, string>[] {
  const id = placeholderId(collection)
  const entry = new Proxy<Record<string, string>>(
    {},
    {
      get: (_, key) =>
        key === 'id'
          ? id
          : key === 'collection'
            ? collection
            : typeof key === 'string'
              ? formatValue({ scope: 'route', field: key })
              : undefined,
    },
  )
  const list: ListRef = { collection, query }
  return Object.assign([entry], { [LIST]: list })
}

const listOf = (value: unknown) =>
  value != null && typeof value === 'object'
    ? (value as Record<symbol, ListRef | undefined>)[LIST]
    : undefined

const valueOf = (value: unknown): ValueRef | undefined =>
  typeof value === 'string' ? parseValue(value) : undefined

const placeholderItem = new Proxy<Record<string, string>>(
  {},
  {
    get: (_, field) =>
      typeof field === 'string'
        ? formatValue({ scope: 'item', field })
        : undefined,
  },
)

/**
 * What an `Each` over `of` renders in the template pass: its item once, as a
 * placeholder, between markers. Undefined outside the pass, or when `of` isn't
 * Gratis content: then it renders as usual.
 */
export function eachBlock(of: unknown) {
  if (!isTemplateMode()) return undefined
  const list = listOf(of)
  if (!list) {
    if (valueOf(of))
      throw new Error(
        'gratis: <Each> over a field is not supported yet; list a collection with getCollection',
      )
    return undefined
  }
  return {
    start: formatMarker({ kind: 'each', list }),
    end: formatMarker({ kind: 'end', of: 'each' }),
    items: [placeholderItem],
  }
}

/**
 * The markers an `If` wraps its content in during the template pass. Undefined
 * outside the pass, or when `when` isn't Gratis content: then it renders as
 * usual.
 */
export function ifBlock(when: unknown) {
  if (!isTemplateMode()) return undefined
  if (listOf(when))
    throw new Error(
      'gratis: <If> over a list is not supported yet; use a field',
    )
  const value = valueOf(when)
  if (!value) return undefined
  return {
    start: formatMarker({ kind: 'if', value }),
    end: formatMarker({ kind: 'end', of: 'if' }),
  }
}

/**
 * The collection a dynamic route is bound to, from the placeholder id in its
 * built path.
 */
export function routeBinding(
  template: string,
  builtFile: string,
): RouteBinding | undefined {
  const collection = builtFile.match(PLACEHOLDER_ID)?.[1]
  const param = template.match(/\[(\w+)\]/)?.[1]
  if (!collection || !param) return undefined
  return {
    collection,
    param,
    file: builtFile.replace(PLACEHOLDER_ID, `[${param}]`),
  }
}
