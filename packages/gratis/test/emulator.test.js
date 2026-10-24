// The admin's save flow over HTTP against the in-memory emulator: the same requests it sends to S3.

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { JSDOM } from 'jsdom'

import {
  createEntry,
  deleteEntry,
  loadSite,
  readEntry,
  saveEntry,
} from '../src/admin/site.ts'
import {
  ConflictError,
  createCache,
  createStorage,
} from '../src/admin/storage.ts'
import { createEmulator, memoryBackend } from '../src/emulator/index.ts'

const { DOMParser } = new JSDOM('').window
const json = (value) => JSON.stringify(value, null, 2) + '\n'

const bucket = () =>
  memoryBackend({
    '_gratis/schema.json': json({
      collections: {
        site: {
          single: true,
          storage: { path: 'site.json', source: 'src/data/site.json' },
          fields: { title: { type: 'text', label: 'Title' } },
        },
      },
    }),
    '_gratis/routes.json': json({
      pages: {
        '/': {
          template: '/',
          file: 'index.html',
          deps: { entries: ['site'], collections: {} },
          updated: '',
        },
      },
      _pending: [],
    }),
    '_gratis/templates/index.html':
      '<!DOCTYPE html><html><head><title>{{gratis:entry:site:title}}</title></head><body><h1>{{gratis:entry:site:title}}</h1></body></html>',
    '_gratis/content/site.json': json({ title: 'Before' }),
    'index.html':
      '<!DOCTYPE html><html><head><title>Before</title></head><body><h1>Before</h1></body></html>',
    'about/index.html': 'about',
  })

let backend, server, endpoint
before(async () => {
  server = createServer((req, res) =>
    createEmulator(backend, { website: true })(req, res),
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  endpoint = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const open = () =>
  loadSite(
    createCache(
      createStorage({
        endpoint,
        region: 'local',
        accessKeyId: 'local',
        secretAccessKey: 'local',
      }),
    ),
  )
const text = (key) => new TextDecoder().decode(backend.objects.get(key))

test('a save writes the entry, re-renders its pages and clears the pending list', async () => {
  backend = bucket()
  const site = await open()
  const pages = await saveEntry(site, 'site', { title: 'A & B' }, { DOMParser })
  assert.deepEqual(pages, ['/'])
  assert.deepEqual(JSON.parse(text('_gratis/content/site.json')), {
    title: 'A & B',
  })
  assert.match(text('index.html'), /<h1>A &amp; B<\/h1>/)
  assert.deepEqual(JSON.parse(text('_gratis/routes.json'))._pending, [])
})

test('a save from a stale version conflicts and leaves the entry alone', async () => {
  backend = bucket()
  const mine = await open()
  const theirs = await open()
  const { etag } = await readEntry(mine, 'site')
  await saveEntry(theirs, 'site', { title: 'Theirs' }, { DOMParser })
  // Mine is stale twice over: routes.json and the entry both changed.
  await assert.rejects(
    saveEntry(mine, 'site', { title: 'Mine' }, { DOMParser, etag }),
    ConflictError,
  )
  assert.deepEqual(JSON.parse(text('_gratis/content/site.json')), {
    title: 'Theirs',
  })
  const fresh = await readEntry(mine, 'site', { fresh: true })
  assert.deepEqual(fresh.fields, { title: 'Theirs' })
})

test('PUT honours If-None-Match: *, as deploy uses it', async () => {
  backend = bucket()
  const put = (key) =>
    fetch(`${endpoint}/${key}`, {
      method: 'PUT',
      body: '{}',
      headers: { 'If-None-Match': '*' },
    })
  assert.equal((await put('_gratis/content/site.json')).status, 412)
  assert.equal((await put('_gratis/content/new.json')).status, 200)
})

test('reads act like the website endpoint', async () => {
  backend = bucket()
  const root = await fetch(`${endpoint}/`)
  assert.equal(root.status, 200)
  assert.match(root.headers.get('content-type'), /text\/html/)
  assert.match(root.headers.get('etag'), /^"[0-9a-f]{32}"$/)
  const dir = await fetch(`${endpoint}/about`, { redirect: 'manual' })
  assert.equal(dir.status, 301)
  assert.equal(dir.headers.get('location'), '/about/')
  assert.equal((await fetch(`${endpoint}/missing`)).status, 404)
})

// A blog: a home page listing posts by date, and a page per post.
const blog = () =>
  memoryBackend({
    '_gratis/schema.json': json({
      collections: {
        site: {
          single: true,
          storage: { path: 'site.json', source: 'src/data/site.json' },
          fields: { title: { type: 'text', label: 'Title' } },
        },
        posts: {
          single: false,
          storage: { path: 'posts/', source: 'src/data/posts/' },
          fields: {
            title: { type: 'text', label: 'Title' },
            date: { type: 'text', label: 'Date' },
            featured: { type: 'boolean', label: 'Featured' },
          },
        },
      },
      routes: {
        '/blog/[slug]': {
          collection: 'posts',
          param: 'slug',
          file: 'blog/[slug]/index.html',
        },
      },
    }),
    '_gratis/routes.json': json({
      pages: {
        '/': {
          template: '/',
          file: 'index.html',
          deps: {
            entries: ['posts/a', 'site'],
            collections: { posts: ['date'] },
          },
          updated: '',
        },
        '/blog/a': {
          template: '/blog/[slug]',
          file: 'blog/a/index.html',
          entry: 'posts/a',
          deps: { entries: ['posts/a', 'site'], collections: {} },
          updated: '',
        },
      },
      _pending: [],
    }),
    '_gratis/templates/index.html':
      '<!DOCTYPE html><html><head></head><body><ul><!--gratis:each query:posts {"sort":"-date"}--><li><a href="/blog/{{gratis:item:id}}/">{{gratis:item:title}}</a></li><!--/gratis:each--></ul></body></html>',
    '_gratis/templates/blog/[slug].html':
      '<!DOCTYPE html><html><head><title>{{gratis:route:title}} · {{gratis:entry:site:title}}</title></head><body><!--gratis:if route:featured--><p>Featured</p><!--/gratis:if--></body></html>',
    '_gratis/content/site.json': json({ title: 'Blog' }),
    '_gratis/content/posts/a.json': json({
      title: 'A',
      date: '2026-01-01',
      featured: false,
    }),
    'index.html': 'old',
    'blog/a/index.html': 'old',
  })

test('ListObjectsV2 lists keys by prefix, and the site lists each collection from it', async () => {
  backend = blog()
  const res = await fetch(
    `${endpoint}/?list-type=2&prefix=_gratis/content/posts/`,
  )
  assert.match(
    await res.text(),
    /<Key>_gratis\/content\/posts\/a\.json<\/Key><\/Contents><\/ListBucketResult>$/,
  )
  const site = await open()
  assert.deepEqual(site.entries, { posts: ['a'] })
})

test('creating an entry writes it, adds and renders its page and re-renders the pages that query it', async () => {
  backend = blog()
  const site = await open()
  const pages = await createEntry(
    site,
    'posts',
    'b',
    { title: 'B', date: '2026-02-01', featured: true },
    { DOMParser },
  )
  assert.deepEqual(pages.sort(), ['/', '/blog/b'])
  assert.deepEqual(JSON.parse(text('_gratis/content/posts/b.json')).title, 'B')
  assert.equal(
    text('blog/b/index.html'),
    '<!DOCTYPE html><html><head><title>B · Blog</title></head><body><p>Featured</p></body></html>',
  )
  assert.match(
    text('index.html'),
    /<ul><li><a href="\/blog\/b\/">B<\/a><\/li><li><a href="\/blog\/a\/">A<\/a><\/li><\/ul>/,
  )
  const routes = JSON.parse(text('_gratis/routes.json'))
  assert.equal(routes.pages['/blog/b'].entry, 'posts/b')
  assert.deepEqual(routes.pages['/'].deps.entries, ['posts/a', 'posts/b'])
  assert.deepEqual(site.entries.posts, ['a', 'b'])
  // An existing id fails instead of overwriting, and leaves no page behind.
  await assert.rejects(
    createEntry(
      site,
      'posts',
      'a',
      { title: 'X', date: '', featured: false },
      { DOMParser },
    ),
    ConflictError,
  )
  assert.equal(JSON.parse(text('_gratis/content/posts/a.json')).title, 'A')
  assert.equal(
    Object.keys(JSON.parse(text('_gratis/routes.json')).pages).length,
    3,
  )
})

test('a save re-renders a listing when it shows the entry or queries a field that changed', async () => {
  backend = blog()
  backend.objects.set(
    '_gratis/templates/index.html',
    new TextEncoder().encode(
      text('_gratis/templates/index.html').replace(
        '"-date"',
        '"-date","limit":1',
      ),
    ),
  )
  const site = await open()
  await createEntry(
    site,
    'posts',
    'b',
    { title: 'B', date: '2026-02-01', featured: false },
    { DOMParser },
  )
  // The home page now shows only b, so a's featured flag matters to a's page alone...
  assert.deepEqual(
    await saveEntry(
      site,
      'posts/a',
      { title: 'A', date: '2026-01-01', featured: true },
      { DOMParser },
    ),
    ['/blog/a'],
  )
  // ...but its date can put it on the home page.
  assert.deepEqual(
    (
      await saveEntry(
        site,
        'posts/a',
        { title: 'A', date: '2026-12-01', featured: true },
        { DOMParser },
      )
    ).sort(),
    ['/', '/blog/a'],
  )
  assert.match(
    text('index.html'),
    /<ul><li><a href="\/blog\/a\/">A<\/a><\/li><\/ul>/,
  )
})

test('deleting an entry deletes its file and page and re-renders the pages that listed it', async () => {
  backend = blog()
  const site = await open()
  await createEntry(
    site,
    'posts',
    'b',
    { title: 'B', date: '2026-02-01', featured: false },
    { DOMParser },
  )
  assert.deepEqual(await deleteEntry(site, 'posts/a', { DOMParser }), ['/'])
  assert.equal(backend.objects.has('_gratis/content/posts/a.json'), false)
  assert.equal(backend.objects.has('blog/a/index.html'), false)
  assert.match(
    text('index.html'),
    /<ul><li><a href="\/blog\/b\/">B<\/a><\/li><\/ul>/,
  )
  const routes = JSON.parse(text('_gratis/routes.json'))
  assert.deepEqual(Object.keys(routes.pages).sort(), ['/', '/blog/b'])
  assert.deepEqual(site.entries.posts, ['b'])
  assert.deepEqual((await open()).entries.posts, ['b'])
})
