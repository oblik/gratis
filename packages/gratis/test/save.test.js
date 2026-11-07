// The save flow of notes/editing.md, against the emulator's objects in process: the same ETags
// and conditional writes as S3, without HTTP.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

import {
  createEntry,
  deleteEntry,
  renderPending,
  saveEntry,
} from '../src/core/save.ts'
import { loadSite, readEntry } from '../src/core/site.ts'
import { ConflictError, createCache } from '../src/core/storage.ts'
import { emulatedStorage } from '../src/emulator/index.ts'
import { blog, bucket } from './fixtures.js'

const { DOMParser } = new JSDOM('').window

/** Opens the site in `backend`, optionally through storage with some calls made to fail. */
const open = (backend, fail = {}) => {
  const storage = emulatedStorage(backend)
  for (const [method, when] of Object.entries(fail)) {
    const original = storage[method]
    storage[method] = (key, ...rest) =>
      when(key)
        ? Promise.reject(new Error(`${method} ${key}: network error`))
        : original(key, ...rest)
  }
  return loadSite(createCache(storage), { DOMParser })
}
const text = (backend, key) =>
  new TextDecoder().decode(backend.objects.get(key))
const routes = (backend) => JSON.parse(text(backend, '_gratis/routes.json'))

test('a save writes the entry, re-renders its pages and clears the pending list', async () => {
  const backend = bucket()
  const site = await open(backend)
  const pages = await saveEntry(site, 'site', { title: 'A & B' })
  assert.deepEqual(pages, ['/'])
  assert.deepEqual(JSON.parse(text(backend, '_gratis/content/site.json')), {
    title: 'A & B',
  })
  assert.match(text(backend, 'index.html'), /<h1>A &amp; B<\/h1>/)
  assert.deepEqual(routes(backend)._pending, [])
})

test('a save from a stale version conflicts and leaves the entry alone', async () => {
  const backend = bucket()
  const mine = await open(backend)
  const theirs = await open(backend)
  const { etag } = await readEntry(mine, 'site')
  await saveEntry(theirs, 'site', { title: 'Theirs' })
  // Mine is stale twice over: routes.json and the entry both changed.
  await assert.rejects(
    saveEntry(mine, 'site', { title: 'Mine' }, { etag }),
    ConflictError,
  )
  assert.deepEqual(JSON.parse(text(backend, '_gratis/content/site.json')), {
    title: 'Theirs',
  })
  const fresh = await readEntry(mine, 'site', { fresh: true })
  assert.deepEqual(fresh.fields, { title: 'Theirs' })
})

test('an interrupted save leaves its pages queued, and the next session renders them', async () => {
  const backend = bucket()
  const site = await open(backend, { put: (key) => key === 'index.html' })
  await assert.rejects(saveEntry(site, 'site', { title: 'New' }), /network/)
  // Content before HTML: the entry is saved, its page is still the old one, and queued.
  assert.match(text(backend, '_gratis/content/site.json'), /New/)
  assert.match(text(backend, 'index.html'), /Before/)
  assert.deepEqual(routes(backend)._pending, ['/'])

  const next = await open(backend)
  assert.deepEqual(await renderPending(next), ['/'])
  assert.match(text(backend, 'index.html'), /<h1>New<\/h1>/)
  assert.deepEqual(routes(backend)._pending, [])
})

test('the site lists each collection from the bucket', async () => {
  assert.deepEqual((await open(blog())).entries, { posts: ['a'] })
})

test('creating an entry writes it, adds and renders its page and re-renders the pages that query it', async () => {
  const backend = blog()
  const site = await open(backend)
  const pages = await createEntry(site, 'posts', 'b', {
    title: 'B',
    date: '2026-02-01',
    featured: true,
  })
  assert.deepEqual(pages.sort(), ['/', '/blog/b'])
  assert.equal(
    JSON.parse(text(backend, '_gratis/content/posts/b.json')).title,
    'B',
  )
  assert.equal(
    text(backend, 'blog/b/index.html'),
    '<!DOCTYPE html><html><head><title>B · Blog</title></head><body><p>Featured</p></body></html>',
  )
  assert.match(
    text(backend, 'index.html'),
    /<ul><li><a href="\/blog\/b\/">B<\/a><\/li><li><a href="\/blog\/a\/">A<\/a><\/li><\/ul>/,
  )
  assert.equal(routes(backend).pages['/blog/b'].entry, 'posts/b')
  assert.deepEqual(routes(backend).pages['/'].deps.entries, [
    'posts/a',
    'posts/b',
  ])
  assert.deepEqual(site.entries.posts, ['a', 'b'])
})

test('creating an entry with an existing id conflicts and leaves no page behind', async () => {
  const backend = blog()
  const site = await open(backend)
  await assert.rejects(
    createEntry(site, 'posts', 'a', {
      title: 'X',
      date: '',
      featured: false,
    }),
    ConflictError,
  )
  assert.equal(
    JSON.parse(text(backend, '_gratis/content/posts/a.json')).title,
    'A',
  )
  assert.deepEqual(Object.keys(routes(backend).pages), ['/', '/blog/a'])
  assert.deepEqual(Object.keys(site.routes.pages), ['/', '/blog/a'])
  assert.deepEqual(site.entries.posts, ['a'])
})

test('a save re-renders a listing when it shows the entry or queries a field that changed', async () => {
  const backend = blog()
  backend.objects.set(
    '_gratis/templates/index.html',
    new TextEncoder().encode(
      text(backend, '_gratis/templates/index.html').replace(
        '"-date"',
        '"-date","limit":1',
      ),
    ),
  )
  const site = await open(backend)
  await createEntry(site, 'posts', 'b', {
    title: 'B',
    date: '2026-02-01',
    featured: false,
  })
  // The home page now shows only b, so a's featured flag matters to a's page alone...
  assert.deepEqual(
    await saveEntry(site, 'posts/a', {
      title: 'A',
      date: '2026-01-01',
      featured: true,
    }),
    ['/blog/a'],
  )
  // ...but its date can put it on the home page.
  assert.deepEqual(
    (
      await saveEntry(site, 'posts/a', {
        title: 'A',
        date: '2026-12-01',
        featured: true,
      })
    ).sort(),
    ['/', '/blog/a'],
  )
  assert.match(
    text(backend, 'index.html'),
    /<ul><li><a href="\/blog\/a\/">A<\/a><\/li><\/ul>/,
  )
})

test('deleting an entry deletes its file and page and re-renders the pages that listed it', async () => {
  const backend = blog()
  const site = await open(backend)
  await createEntry(site, 'posts', 'b', {
    title: 'B',
    date: '2026-02-01',
    featured: false,
  })
  assert.deepEqual(await deleteEntry(site, 'posts/a'), ['/'])
  assert.equal(backend.objects.has('_gratis/content/posts/a.json'), false)
  assert.equal(backend.objects.has('blog/a/index.html'), false)
  assert.match(
    text(backend, 'index.html'),
    /<ul><li><a href="\/blog\/b\/">B<\/a><\/li><\/ul>/,
  )
  assert.deepEqual(Object.keys(routes(backend).pages).sort(), ['/', '/blog/b'])
  assert.deepEqual(site.entries.posts, ['b'])
  assert.deepEqual((await open(backend)).entries.posts, ['b'])
})

test('a delete that fails keeps the entry and its pages', async () => {
  const backend = blog()
  const site = await open(backend, {
    delete: (key) => key === '_gratis/content/posts/a.json',
  })
  await assert.rejects(deleteEntry(site, 'posts/a'), /network/)
  assert.equal(backend.objects.has('_gratis/content/posts/a.json'), true)
  assert.equal(backend.objects.has('blog/a/index.html'), true)
  assert.deepEqual(Object.keys(routes(backend).pages), ['/', '/blog/a'])
  assert.deepEqual(Object.keys(site.routes.pages), ['/', '/blog/a'])
  assert.deepEqual(site.entries.posts, ['a'])
})
