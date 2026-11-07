import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatMarker,
  formatValue,
  parseMarker,
  parseValue,
  replaceValues,
} from '../src/core/template/sentinels.ts'

const comment = (html) => html.match(/^<!--(.*)-->$/s)[1]

test('values format as the sentinels in notes/rendering.md and parse back', () => {
  const cases = [
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
  ]
  for (const [ref, text] of cases) {
    assert.equal(formatValue(ref), text)
    assert.deepEqual(parseValue(text), ref)
  }
})

test('parseValue takes only a string that is exactly one sentinel', () => {
  assert.equal(parseValue('Hello'), undefined)
  assert.equal(parseValue('{{gratis:route:title}} · Blog'), undefined)
})

test('malformed sentinels and unknown scopes throw', () => {
  for (const text of [
    '{{gratis:entry:site}}',
    '{{gratis:route:}}',
    '{{gratis:item:a:b}}',
    '{{gratis:locale:title}}',
  ])
    assert.throws(() => parseValue(text), /malformed sentinel/)
})

test('replaceValues fills every sentinel in one pass', () => {
  const filled = replaceValues(
    '{{gratis:route:title}} · {{gratis:entry:site:title}}',
    (ref) => (ref.scope === 'route' ? '{{gratis:entry:site:secret}}' : 'Blog'),
  )
  assert.equal(filled, '{{gratis:entry:site:secret}} · Blog')
})

test('markers format as comments and parse back', () => {
  const cases = [
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
  ]
  for (const [marker, html] of cases) {
    assert.equal(formatMarker(marker), html)
    assert.deepEqual(parseMarker(comment(html)), marker)
  }
})

test("a query can't end its comment early", () => {
  const marker = {
    kind: 'each',
    list: {
      collection: 'posts',
      query: { where: { title: 'a --> b --!> c' } },
    },
  }
  const html = formatMarker(marker)
  assert.doesNotMatch(html.slice(4, -3), />/)
  assert.deepEqual(parseMarker(comment(html)), marker)
})

test("other comments aren't markers; unknown and unsupported markers throw", () => {
  assert.equal(parseMarker(' a note '), null)
  assert.equal(parseMarker('[if IE]'), null)
  assert.throws(() => parseMarker('gratis:unless route:x'), /unknown marker/)
  assert.throws(() => parseMarker('/gratis:unless'), /unknown marker/)
  assert.throws(
    () => parseMarker('gratis:each entry:site:nav'),
    /not supported yet/,
  )
})
