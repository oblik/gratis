import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  planCreate,
  planDelete,
  planRender,
  planSave,
} from '../src/core/plan.ts'

const page = (file, entries, collections = {}, entry) => ({
  template: entry ? '/blog/[slug]' : '/',
  file,
  ...(entry && { entry }),
  deps: { entries, collections },
  updated: '',
})
const site = {
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
  assert.deepEqual(edit, {
    write: {
      key: '_gratis/content/posts/a.json',
      put: '{\n  "title": "B",\n  "date": "1"\n}\n',
      ifMatch: '"v1"',
    },
    remove: [],
    render: ['/', '/blog/a'],
  })
  assert.deepEqual(
    planSave(site, 'site', { before: { t: 1 }, after: { t: 2 } }).render,
    ['/', '/about', '/blog/a'],
  )
})

test('a save renders nothing when no page reads the entry or queries a changed field', () => {
  const edit = planSave(site, 'posts/b', {
    before: { title: 'B' },
    after: { title: 'C' },
  })
  assert.deepEqual(edit.render, [])
})

test('creating an entry adds its page, its id and renders its page and the queries', () => {
  const edit = planCreate(site, 'posts', 'b', { title: 'B' })
  assert.deepEqual(edit.write, {
    key: '_gratis/content/posts/b.json',
    put: '{\n  "title": "B"\n}\n',
    ifNoneMatch: '*',
  })
  assert.deepEqual(Object.keys(edit.pages), [
    '/',
    '/about',
    '/blog/a',
    '/blog/b',
  ])
  assert.equal(edit.pages['/blog/b'].file, 'blog/b/index.html')
  assert.deepEqual(edit.entries, { posts: ['a', 'b'] })
  assert.deepEqual(edit.render, ['/blog/b', '/'])
})

test("a plan doesn't change the site it reads", () => {
  const before = structuredClone(site)
  planCreate(site, 'posts', 'b', {})
  planDelete(site, 'posts/a')
  assert.deepEqual(site, before)
})

test('creating an entry with an id that is not a slug fails before anything is written', () => {
  assert.throws(() => planCreate(site, 'posts', 'Hello World', {}), /valid id/)
})

test('deleting an entry removes its page and id and renders the pages that listed it', () => {
  assert.deepEqual(planDelete(site, 'posts/a'), {
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
  assert.deepEqual(planRender(site), {
    remove: [],
    render: ['/', '/about', '/blog/a'],
  })
  assert.deepEqual(planRender(site, []).render, [])
})
