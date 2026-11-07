// The template language (notes/rendering.md): what the template pass writes into a page where
// content goes, and what the renderer reads back. This module is the whole grammar; the Astro side
// only formats and the renderer only parses.
//
// A value is a sentinel, anywhere a string goes (text, attributes, <title>):
//
//   {{gratis:entry:site:title}}    a field of a named entry: a single, or `posts/hello`
//   {{gratis:route:title}}         a field of the page's own entry
//   {{gratis:item:title}}          a field of the current item of an `each`
//
// Blocks are comment pairs around their content:
//
//   <!--gratis:if route:featured--> … <!--/gratis:if-->          kept when the value is truthy
//   <!--gratis:each query:posts {"sort":"-date"}--> … <!--/gratis:each-->
//                                                                once per entry the query matches

import type { Query } from './query.ts'

/** A value a template reads. */
export type ValueRef =
  | { scope: 'entry'; key: string; field: string }
  | { scope: 'route'; field: string }
  | { scope: 'item'; field: string }

/** What an `each` repeats over: the entries of a collection that match a query. */
export interface ListRef {
  collection: string
  query: Query
}

export type Marker =
  | { kind: 'if'; value: ValueRef }
  | { kind: 'each'; list: ListRef }
  | { kind: 'end'; of: 'if' | 'each' }

const SENTINEL = /\{\{gratis:([^}]+)\}\}/g
const PREFIX = '{{gratis:'

// Values

const formatRef = (ref: ValueRef) =>
  ref.scope === 'entry'
    ? `entry:${ref.key}:${ref.field}`
    : `${ref.scope}:${ref.field}`

function parseRef(text: string): ValueRef {
  const [scope, ...rest] = text.split(':')
  if (scope === 'entry' && rest.length === 2 && rest.every(Boolean))
    return { scope, key: rest[0], field: rest[1] }
  if ((scope === 'route' || scope === 'item') && rest.length === 1 && rest[0])
    return { scope, field: rest[0] }
  throw new Error(`gratis: malformed sentinel ${PREFIX}${text}}}`)
}

export const formatValue = (ref: ValueRef) => `${PREFIX}${formatRef(ref)}}}`

/** The value a string stands for when it is exactly one sentinel. */
export function parseValue(text: string): ValueRef | undefined {
  const match = text.match(/^\{\{gratis:([^}]+)\}\}$/)
  return match ? parseRef(match[1]) : undefined
}

export const hasValues = (text: string) => text.includes(PREFIX)

/** Replaces every sentinel in `text` with `fill(ref)`, in one pass so filled values are never re-read. */
export const replaceValues = (text: string, fill: (ref: ValueRef) => string) =>
  text.replace(SENTINEL, (_, ref: string) => fill(parseRef(ref)))

// Markers

// The query is JSON inside a comment, so `>` is escaped where it could end the comment early.
const formatList = ({ collection, query }: ListRef) => {
  const json = Object.keys(query).length
    ? ` ${JSON.stringify(query).replace(/>/g, '\\u003e')}`
    : ''
  return `query:${collection}${json}`
}

function parseList(text: string): ListRef {
  const match = text.match(/^query:([^ ]+)(?: (.*))?$/)
  if (!match)
    throw new Error(
      `gratis: <!--gratis:each ${text}--> lists other than queries are not supported yet`,
    )
  return { collection: match[1], query: match[2] ? JSON.parse(match[2]) : {} }
}

/** The comment that opens or closes a block. */
export function formatMarker(marker: Marker): string {
  if (marker.kind === 'end') return `<!--/gratis:${marker.of}-->`
  const body =
    marker.kind === 'if' ? formatRef(marker.value) : formatList(marker.list)
  return `<!--gratis:${marker.kind} ${body}-->`
}

/** The marker a comment's data is, or null for a comment that isn't Gratis's. */
export function parseMarker(data: string): Marker | null {
  if (data === '/gratis:if' || data === '/gratis:each')
    return { kind: 'end', of: data === '/gratis:if' ? 'if' : 'each' }
  if (data.startsWith('gratis:if '))
    return { kind: 'if', value: parseRef(data.slice('gratis:if '.length)) }
  if (data.startsWith('gratis:each '))
    return { kind: 'each', list: parseList(data.slice('gratis:each '.length)) }
  if (/^\/?gratis:/.test(data))
    throw new Error(`gratis: unknown marker <!--${data}-->`)
  return null
}
