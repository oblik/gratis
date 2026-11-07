// The emulator over HTTP: the S3 wire format and the website endpoint, and the S3 client talking
// to it as it talks to S3.

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { saveEntry } from '../core/save.ts'
import { loadSite, readEntry } from '../core/site.ts'
import { ConflictError, createCache, createStorage } from '../core/storage.ts'
import { blog, bucket } from './fixtures.ts'
import { createEmulator, type memoryBackend } from './index.ts'

const { DOMParser } = new JSDOM('').window

let backend: ReturnType<typeof memoryBackend>
let server: Server
let endpoint: string
beforeAll(async () => {
  server = createServer((req, res) =>
    createEmulator(backend, { website: true })(req, res),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

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
const text = (key: string) => new TextDecoder().decode(backend.objects.get(key))

test('the S3 client saves through the emulator, and a stale write is a ConflictError', async () => {
  backend = bucket()
  const mine = await open()
  const theirs = await open()
  const { etag } = await readEntry(mine, 'site')
  expect(await saveEntry(theirs, 'site', { title: 'Theirs' })).toStrictEqual([
    '/',
  ])
  expect(text('index.html')).toMatch(/<h1>Theirs<\/h1>/)
  await expect(
    saveEntry(mine, 'site', { title: 'Mine' }, { etag }),
  ).rejects.toThrow(ConflictError)
  expect(text('_gratis/content/site.json')).toMatch(/Theirs/)
})

test('PUT honours If-None-Match: *, as deploy uses it', async () => {
  backend = bucket()
  const put = (key: string) =>
    fetch(`${endpoint}/${key}`, {
      method: 'PUT',
      body: '{}',
      headers: { 'If-None-Match': '*' },
    })
  expect((await put('_gratis/content/site.json')).status).toBe(412)
  expect((await put('_gratis/content/new.json')).status).toBe(200)
})

test('reads act like the website endpoint', async () => {
  backend = bucket()
  const root = await fetch(`${endpoint}/`)
  expect(root.status).toBe(200)
  expect(root.headers.get('content-type')).toMatch(/text\/html/)
  expect(root.headers.get('etag')).toMatch(/^"[0-9a-f]{32}"$/)
  const cached = await fetch(`${endpoint}/`, {
    headers: { 'If-None-Match': root.headers.get('etag')! },
  })
  expect(cached.status).toBe(304)
  const dir = await fetch(`${endpoint}/about`, { redirect: 'manual' })
  expect(dir.status).toBe(301)
  expect(dir.headers.get('location')).toBe('/about/')
  expect((await fetch(`${endpoint}/missing`)).status).toBe(404)
})

test('ListObjectsV2 lists keys by prefix, and the S3 client reads the listing', async () => {
  backend = blog()
  const res = await fetch(
    `${endpoint}/?list-type=2&prefix=_gratis/content/posts/`,
  )
  expect(await res.text()).toMatch(
    /<Key>_gratis\/content\/posts\/a\.json<\/Key><\/Contents><\/ListBucketResult>$/,
  )
  expect((await open()).entries).toStrictEqual({ posts: ['a'] })
})
