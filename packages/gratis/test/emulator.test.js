// The emulator over HTTP: the S3 wire format and the website endpoint, and the S3 client talking
// to it as it talks to S3.

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { JSDOM } from 'jsdom'

import { saveEntry } from '../src/core/save.ts'
import { loadSite, readEntry } from '../src/core/site.ts'
import {
  ConflictError,
  createCache,
  createStorage,
} from '../src/core/storage.ts'
import { createEmulator } from '../src/emulator/index.ts'
import { blog, bucket } from './fixtures.js'

const { DOMParser } = new JSDOM('').window

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
    { DOMParser },
  )
const text = (key) => new TextDecoder().decode(backend.objects.get(key))

test('the S3 client saves through the emulator, and a stale write is a ConflictError', async () => {
  backend = bucket()
  const mine = await open()
  const theirs = await open()
  const { etag } = await readEntry(mine, 'site')
  assert.deepEqual(await saveEntry(theirs, 'site', { title: 'Theirs' }), ['/'])
  assert.match(text('index.html'), /<h1>Theirs<\/h1>/)
  await assert.rejects(
    saveEntry(mine, 'site', { title: 'Mine' }, { etag }),
    ConflictError,
  )
  assert.match(text('_gratis/content/site.json'), /Theirs/)
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
  const cached = await fetch(`${endpoint}/`, {
    headers: { 'If-None-Match': root.headers.get('etag') },
  })
  assert.equal(cached.status, 304)
  const dir = await fetch(`${endpoint}/about`, { redirect: 'manual' })
  assert.equal(dir.status, 301)
  assert.equal(dir.headers.get('location'), '/about/')
  assert.equal((await fetch(`${endpoint}/missing`)).status, 404)
})

test('ListObjectsV2 lists keys by prefix, and the S3 client reads the listing', async () => {
  backend = blog()
  const res = await fetch(
    `${endpoint}/?list-type=2&prefix=_gratis/content/posts/`,
  )
  assert.match(
    await res.text(),
    /<Key>_gratis\/content\/posts\/a\.json<\/Key><\/Contents><\/ListBucketResult>$/,
  )
  assert.deepEqual((await open()).entries, { posts: ['a'] })
})
