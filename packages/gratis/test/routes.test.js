import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  affectedBy,
  dependents,
  entryPages,
  listPages,
  ownPages,
} from '../src/core/routes.ts'
import { changedFields } from '../src/core/schema.ts'

const bindings = {
  '/blog/[slug]': {
    collection: 'posts',
    param: 'slug',
    file: 'blog/[slug]/index.html',
  },
}

test('listPages gives a page per static route and per entry of a bound route', () => {
  const { pages, unbound } = listPages(
    {
      '/': 'index.html',
      '/blog/[slug]': 'blog/gratis-placeholder-posts/index.html',
      '/tags/[tag]': 'tags/x/index.html',
    },
    bindings,
    { posts: ['a', 'b'] },
  )
  assert.deepEqual(pages, {
    '/': {
      template: '/',
      file: 'index.html',
      deps: { entries: [], collections: {} },
      updated: '',
    },
    '/blog/a': {
      template: '/blog/[slug]',
      file: 'blog/a/index.html',
      entry: 'posts/a',
      deps: { entries: ['posts/a'], collections: {} },
      updated: '',
    },
    '/blog/b': {
      template: '/blog/[slug]',
      file: 'blog/b/index.html',
      entry: 'posts/b',
      deps: { entries: ['posts/b'], collections: {} },
      updated: '',
    },
  })
  assert.deepEqual(unbound, ['/tags/[tag]'])
})

test('entryPages gives a new entry one page per route bound to its collection', () => {
  assert.deepEqual(Object.keys(entryPages(bindings, 'posts', 'c')), ['/blog/c'])
  assert.equal(entryPages(bindings, 'posts', 'c')['/blog/c'].entry, 'posts/c')
  assert.deepEqual(entryPages(bindings, 'pages', 'c'), {})
})

const page = (entries, collections = {}, entry) => ({
  template: '/',
  file: 'x.html',
  ...(entry && { entry }),
  deps: { entries, collections },
  updated: '',
})
const routes = {
  pages: {
    '/': page(['site'], { posts: ['date', 'featured'] }),
    '/about': page(['site']),
    '/blog/a': page(['posts/a', 'site'], {}, 'posts/a'),
    '/blog/b': page(['posts/b', 'site'], {}, 'posts/b'),
    '/archive': page(['site'], { posts: [] }),
  },
  _pending: [],
}

test('dependents are the pages that read the entry or query a changed field', () => {
  assert.deepEqual(dependents(routes, 'site'), [
    '/',
    '/about',
    '/blog/a',
    '/blog/b',
    '/archive',
  ])
  assert.deepEqual(dependents(routes, 'posts/a', ['title']), ['/blog/a'])
  assert.deepEqual(dependents(routes, 'posts/a', ['date']), ['/', '/blog/a'])
  assert.deepEqual(dependents(routes, 'posts/a', []), ['/blog/a'])
})

test('without fields, every query of the collection counts', () => {
  assert.deepEqual(dependents(routes, 'posts/c'), ['/', '/archive'])
})

test("ownPages and affectedBy split an entry's pages from the ones that list it", () => {
  assert.deepEqual(ownPages(routes, 'posts/a'), ['/blog/a'])
  assert.deepEqual(affectedBy(routes, 'posts/a'), {
    own: ['/blog/a'],
    others: ['/', '/archive'],
  })
})

test('changedFields compares values structurally, including removed fields', () => {
  assert.deepEqual(
    changedFields(
      { title: 'A', tags: ['x'], featured: true },
      { title: 'A', tags: ['x'], date: '2026-01-01' },
    ),
    ['featured', 'date'],
  )
})
