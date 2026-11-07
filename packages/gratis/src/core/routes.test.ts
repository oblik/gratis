import { expect, test } from 'vitest'

import {
  affectedBy,
  dependents,
  entryPages,
  listPages,
  ownPages,
  routesJson,
  type Page,
  type Routes,
} from './routes.ts'

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
  expect(pages).toStrictEqual({
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
  expect(unbound).toStrictEqual(['/tags/[tag]'])
})

test('entryPages gives a new entry one page per route bound to its collection', () => {
  expect(Object.keys(entryPages(bindings, 'posts', 'c'))).toStrictEqual([
    '/blog/c',
  ])
  expect(entryPages(bindings, 'posts', 'c')['/blog/c'].entry).toBe('posts/c')
  expect(entryPages(bindings, 'pages', 'c')).toStrictEqual({})
})

const page = (
  entries: string[],
  collections: Record<string, string[]> = {},
  entry?: string,
): Page => ({
  template: '/',
  file: 'x.html',
  ...(entry && { entry }),
  deps: { entries, collections },
  updated: '',
})
const routes: Routes = {
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
  expect(dependents(routes, 'site')).toStrictEqual([
    '/',
    '/about',
    '/blog/a',
    '/blog/b',
    '/archive',
  ])
  expect(dependents(routes, 'posts/a', ['title'])).toStrictEqual(['/blog/a'])
  expect(dependents(routes, 'posts/a', ['date'])).toStrictEqual([
    '/',
    '/blog/a',
  ])
  expect(dependents(routes, 'posts/a', [])).toStrictEqual(['/blog/a'])
})

test('without fields, every query of the collection counts', () => {
  expect(dependents(routes, 'posts/c')).toStrictEqual(['/', '/archive'])
})

test("ownPages and affectedBy split an entry's pages from the ones that list it", () => {
  expect(ownPages(routes, 'posts/a')).toStrictEqual(['/blog/a'])
  expect(affectedBy(routes, 'posts/a')).toStrictEqual({
    own: ['/blog/a'],
    others: ['/', '/archive'],
  })
})

test('routesJson sorts the pages by path', () => {
  const page = (template: string): Page => ({
    template,
    file: 'x.html',
    deps: { entries: [], collections: {} },
    updated: '',
  })
  const json = routesJson({
    pages: {
      '/blog/b': page('/blog/[slug]'),
      '/': page('/'),
      '/blog/a': page('/blog/[slug]'),
    },
    _pending: ['/blog/b'],
  })
  const parsed: Routes = JSON.parse(json)
  expect(Object.keys(parsed.pages)).toStrictEqual(['/', '/blog/a', '/blog/b'])
  expect(parsed._pending).toStrictEqual(['/blog/b'])
})
