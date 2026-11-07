import { expect, test } from 'vitest'

import {
  formatMarker,
  formatValue,
  parseMarker,
  parseValue,
  replaceValues,
  type Marker,
  type ValueRef,
} from './sentinels.ts'

const comment = (html: string) => html.match(/^<!--(.*)-->$/s)![1]

test.each<[ValueRef, string]>([
  [
    { scope: 'entry', key: 'site', field: 'title' },
    '{{gratis:entry:site:title}}',
  ],
  [
    { scope: 'entry', key: 'posts/hello', field: 'title' },
    '{{gratis:entry:posts/hello:title}}',
  ],
  [{ scope: 'route', field: 'title' }, '{{gratis:route:title}}'],
  [{ scope: 'item', field: 'id' }, '{{gratis:item:id}}'],
])('%o formats as %s and parses back', (ref, text) => {
  expect(formatValue(ref)).toBe(text)
  expect(parseValue(text)).toStrictEqual(ref)
})

test('parseValue takes only a string that is exactly one sentinel', () => {
  expect(parseValue('Hello')).toBe(undefined)
  expect(parseValue('{{gratis:route:title}} · Blog')).toBe(undefined)
})

test.each([
  '{{gratis:entry:site}}',
  '{{gratis:route:}}',
  '{{gratis:item:a:b}}',
  '{{gratis:locale:title}}',
])('%s is malformed', (text) => {
  expect(() => parseValue(text)).toThrow(/malformed sentinel/)
})

test('replaceValues fills every sentinel in one pass', () => {
  const filled = replaceValues(
    '{{gratis:route:title}} · {{gratis:entry:site:title}}',
    (ref) => (ref.scope === 'route' ? '{{gratis:entry:site:secret}}' : 'Blog'),
  )
  expect(filled).toBe('{{gratis:entry:site:secret}} · Blog')
})

test.each<[Marker, string]>([
  [
    { kind: 'if', value: { scope: 'item', field: 'featured' } },
    '<!--gratis:if item:featured-->',
  ],
  [
    { kind: 'each', list: { collection: 'posts', query: {} } },
    '<!--gratis:each query:posts-->',
  ],
  [
    {
      kind: 'each',
      list: { collection: 'posts', query: { sort: '-date', limit: 2 } },
    },
    '<!--gratis:each query:posts {"sort":"-date","limit":2}-->',
  ],
  [{ kind: 'end', of: 'if' }, '<!--/gratis:if-->'],
  [{ kind: 'end', of: 'each' }, '<!--/gratis:each-->'],
])('%o formats as %s and parses back', (marker, html) => {
  expect(formatMarker(marker)).toBe(html)
  expect(parseMarker(comment(html))).toStrictEqual(marker)
})

test("a query can't end its comment early", () => {
  const marker: Marker = {
    kind: 'each',
    list: {
      collection: 'posts',
      query: { where: { title: 'a --> b --!> c' } },
    },
  }
  const html = formatMarker(marker)
  expect(html.slice(4, -3)).not.toMatch(/>/)
  expect(parseMarker(comment(html))).toStrictEqual(marker)
})

test("other comments aren't markers; unknown and unsupported markers throw", () => {
  expect(parseMarker(' a note ')).toBe(null)
  expect(parseMarker('[if IE]')).toBe(null)
  expect(() => parseMarker('gratis:unless route:x')).toThrow(/unknown marker/)
  expect(() => parseMarker('/gratis:unless')).toThrow(/unknown marker/)
  expect(() => parseMarker('gratis:each entry:site:nav')).toThrow(
    /not supported yet/,
  )
})
