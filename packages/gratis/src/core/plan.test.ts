import { expect, test } from 'vitest'

import {
  planCreate,
  planDelete,
  planRender,
  planSave,
  type SiteState,
} from './plan.ts'
import type { Page } from './routes.ts'

const page = (
  file: string,
  entries: string[],
  collections: Record<string, string[]> = {},
  entry?: string,
): Page => ({
  template: entry ? '/blog/[slug]' : '/',
  file,
  ...(entry && { entry }),
  deps: { entries, collections },
  updated: '',
})
const site: SiteState = {
  schema: {
    collections: {},
    routes: {
      '/blog/[slug]': {
        collection: 'posts',
        param: 'slug',
        file: 'blog/[slug]/index.html',
      },
    },
  },
  routes: {
    pages: {
      '/': page('index.html', ['posts/a', 'site'], { posts: ['date'] }),
      '/about': page('about/index.html', ['site']),
      '/blog/a': page('blog/a/index.html', ['posts/a', 'site'], {}, 'posts/a'),
    },
    _pending: [],
  },
  entries: { posts: ['a'] },
}

test('a save writes the entry conditionally and renders the pages that depend on what changed', () => {
  const edit = planSave(site, 'posts/a', {
    before: { title: 'A', date: '1' },
    after: { title: 'B', date: '1' },
    etag: '"v1"',
  })
  expect(edit).toStrictEqual({
    write: {
      key: '_gratis/content/posts/a.json',
      put: '{\n  "title": "B",\n  "date": "1"\n}\n',
      ifMatch: '"v1"',
    },
    remove: [],
    render: ['/', '/blog/a'],
  })
  expect(
    planSave(site, 'site', { before: { t: 1 }, after: { t: 2 } }).render,
  ).toStrictEqual(['/', '/about', '/blog/a'])
})

test('a save renders nothing when no page reads the entry or queries a changed field', () => {
  const edit = planSave(site, 'posts/b', {
    before: { title: 'B' },
    after: { title: 'C' },
  })
  expect(edit.render).toStrictEqual([])
})

test('creating an entry adds its page, its id and renders its page and the queries', () => {
  const edit = planCreate(site, 'posts', 'b', { title: 'B' })
  expect(edit.write).toStrictEqual({
    key: '_gratis/content/posts/b.json',
    put: '{\n  "title": "B"\n}\n',
    ifNoneMatch: '*',
  })
  expect(Object.keys(edit.pages!)).toStrictEqual([
    '/',
    '/about',
    '/blog/a',
    '/blog/b',
  ])
  expect(edit.pages!['/blog/b'].file).toBe('blog/b/index.html')
  expect(edit.entries).toStrictEqual({ posts: ['a', 'b'] })
  expect(edit.render).toStrictEqual(['/blog/b', '/'])
})

test("a plan doesn't change the site it reads", () => {
  const before = structuredClone(site)
  planCreate(site, 'posts', 'b', {})
  planDelete(site, 'posts/a')
  expect(site).toStrictEqual(before)
})

test('creating an entry with an id that is not a slug fails before anything is written', () => {
  expect(() => planCreate(site, 'posts', 'Hello World', {})).toThrow(/valid id/)
})

test('deleting an entry removes its page and id and renders the pages that listed it', () => {
  expect(planDelete(site, 'posts/a')).toStrictEqual({
    write: { key: '_gratis/content/posts/a.json', delete: true },
    pages: {
      '/': site.routes.pages['/'],
      '/about': site.routes.pages['/about'],
    },
    entries: { posts: [] },
    remove: ['blog/a/index.html'],
    render: ['/'],
  })
})

test('rendering writes nothing and renders every page by default', () => {
  expect(planRender(site)).toStrictEqual({
    remove: [],
    render: ['/', '/about', '/blog/a'],
  })
  expect(planRender(site, []).render).toStrictEqual([])
})
