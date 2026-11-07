import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'

import { blog, bucket } from '../emulator/fixtures.ts'
import { emulatedStorage, memoryBackend } from '../emulator/index.ts'
import type { Routes } from './routes.ts'
import { createEntry, deleteEntry, renderPending, saveEntry } from './save.ts'
import { loadSite, readEntry } from './site.ts'
import { ConflictError, createCache } from './storage.ts'

const { DOMParser } = new JSDOM('').window

type Bucket = ReturnType<typeof memoryBackend>
type Failing = (key: string) => boolean

/**
 * Opens the site in `bucket`, through storage whose puts or deletes fail for
 * the keys `fail` picks.
 */
function open(bucket: Bucket, fail: { put?: Failing; delete?: Failing } = {}) {
  const storage = emulatedStorage(bucket)
  const { put, delete: remove } = storage
  const error = (method: string, key: string) =>
    Promise.reject(new Error(`${method} ${key}: network error`))
  storage.put = (key, ...rest) =>
    fail.put?.(key) ? error('put', key) : put(key, ...rest)
  storage.delete = (key) =>
    fail.delete?.(key) ? error('delete', key) : remove(key)
  return loadSite(createCache(storage), { DOMParser })
}
const text = (bucket: Bucket, key: string) =>
  new TextDecoder().decode(bucket.objects.get(key))
const routes = (bucket: Bucket): Routes =>
  JSON.parse(text(bucket, '_gratis/routes.json'))

test('a save writes the entry, re-renders its pages and clears the pending list', async () => {
  const backend = bucket()
  const site = await open(backend)
  const pages = await saveEntry(site, 'site', { title: 'A & B' })
  expect(pages).toStrictEqual(['/'])
  expect(JSON.parse(text(backend, '_gratis/content/site.json'))).toStrictEqual({
    title: 'A & B',
  })
  expect(text(backend, 'index.html')).toMatch(/<h1>A &amp; B<\/h1>/)
  expect(routes(backend)._pending).toStrictEqual([])
})

test('a save from a stale version conflicts and leaves the entry alone', async () => {
  const backend = bucket()
  const mine = await open(backend)
  const theirs = await open(backend)
  const { etag } = await readEntry(mine, 'site')
  await saveEntry(theirs, 'site', { title: 'Theirs' })
  // Mine is stale twice over: routes.json and the entry both changed.
  await expect(
    saveEntry(mine, 'site', { title: 'Mine' }, { etag }),
  ).rejects.toThrow(ConflictError)
  expect(JSON.parse(text(backend, '_gratis/content/site.json'))).toStrictEqual({
    title: 'Theirs',
  })
  const fresh = await readEntry(mine, 'site', { fresh: true })
  expect(fresh.fields).toStrictEqual({ title: 'Theirs' })
})

test('an interrupted save leaves its pages queued, and the next session renders them', async () => {
  const backend = bucket()
  const site = await open(backend, { put: (key) => key === 'index.html' })
  await expect(saveEntry(site, 'site', { title: 'New' })).rejects.toThrow(
    /network/,
  )
  // Content before HTML: the entry is saved, its page is still the old one, and
  // queued.
  expect(text(backend, '_gratis/content/site.json')).toMatch(/New/)
  expect(text(backend, 'index.html')).toMatch(/Before/)
  expect(routes(backend)._pending).toStrictEqual(['/'])

  const next = await open(backend)
  expect(await renderPending(next)).toStrictEqual(['/'])
  expect(text(backend, 'index.html')).toMatch(/<h1>New<\/h1>/)
  expect(routes(backend)._pending).toStrictEqual([])
})

test('the site lists each collection from the bucket', async () => {
  expect((await open(blog())).entries).toStrictEqual({ posts: ['a'] })
})

test('creating an entry writes it, adds and renders its page and re-renders the pages that query it', async () => {
  const backend = blog()
  const site = await open(backend)
  const pages = await createEntry(site, 'posts', 'b', {
    title: 'B',
    date: '2026-02-01',
    featured: true,
  })
  expect(pages.sort()).toStrictEqual(['/', '/blog/b'])
  expect(JSON.parse(text(backend, '_gratis/content/posts/b.json')).title).toBe(
    'B',
  )
  expect(text(backend, 'blog/b/index.html')).toBe(
    '<!DOCTYPE html><html><head><title>B · Blog</title></head><body><p>Featured</p></body></html>',
  )
  expect(text(backend, 'index.html')).toMatch(
    /<ul><li><a href="\/blog\/b\/">B<\/a><\/li><li><a href="\/blog\/a\/">A<\/a><\/li><\/ul>/,
  )
  expect(routes(backend).pages['/blog/b'].entry).toBe('posts/b')
  expect(routes(backend).pages['/'].deps.entries).toStrictEqual([
    'posts/a',
    'posts/b',
  ])
  expect(site.entries.posts).toStrictEqual(['a', 'b'])
})

test('creating an entry with an existing id conflicts and leaves no page behind', async () => {
  const backend = blog()
  const site = await open(backend)
  await expect(
    createEntry(site, 'posts', 'a', {
      title: 'X',
      date: '',
      featured: false,
    }),
  ).rejects.toThrow(ConflictError)
  expect(JSON.parse(text(backend, '_gratis/content/posts/a.json')).title).toBe(
    'A',
  )
  expect(Object.keys(routes(backend).pages)).toStrictEqual(['/', '/blog/a'])
  expect(Object.keys(site.routes.pages)).toStrictEqual(['/', '/blog/a'])
  expect(site.entries.posts).toStrictEqual(['a'])
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
  // The home page now shows only b, so a's featured flag matters to a's page
  // alone...
  expect(
    await saveEntry(site, 'posts/a', {
      title: 'A',
      date: '2026-01-01',
      featured: true,
    }),
  ).toStrictEqual(['/blog/a'])
  // ...but its date can put it on the home page.
  expect(
    (
      await saveEntry(site, 'posts/a', {
        title: 'A',
        date: '2026-12-01',
        featured: true,
      })
    ).sort(),
  ).toStrictEqual(['/', '/blog/a'])
  expect(text(backend, 'index.html')).toMatch(
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
  expect(await deleteEntry(site, 'posts/a')).toStrictEqual(['/'])
  expect(backend.objects.has('_gratis/content/posts/a.json')).toBe(false)
  expect(backend.objects.has('blog/a/index.html')).toBe(false)
  expect(text(backend, 'index.html')).toMatch(
    /<ul><li><a href="\/blog\/b\/">B<\/a><\/li><\/ul>/,
  )
  expect(Object.keys(routes(backend).pages).sort()).toStrictEqual([
    '/',
    '/blog/b',
  ])
  expect(site.entries.posts).toStrictEqual(['b'])
  expect((await open(backend)).entries.posts).toStrictEqual(['b'])
})

test('a delete that fails keeps the entry and its pages', async () => {
  const backend = blog()
  const site = await open(backend, {
    delete: (key) => key === '_gratis/content/posts/a.json',
  })
  await expect(deleteEntry(site, 'posts/a')).rejects.toThrow(/network/)
  expect(backend.objects.has('_gratis/content/posts/a.json')).toBe(true)
  expect(backend.objects.has('blog/a/index.html')).toBe(true)
  expect(Object.keys(routes(backend).pages)).toStrictEqual(['/', '/blog/a'])
  expect(Object.keys(site.routes.pages)).toStrictEqual(['/', '/blog/a'])
  expect(site.entries.posts).toStrictEqual(['a'])
})
