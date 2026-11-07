// The emulator's object layer: ETags and the conditional writes the save locks with.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ConflictError } from '../src/core/storage.ts'
import { createObjects, memoryBackend } from '../src/emulator/index.ts'

const bytes = (s) => new TextEncoder().encode(s)

test('an ETag is the quoted MD5 of the bytes, as S3 gives it', async () => {
  const objects = createObjects(memoryBackend({ a: 'hello' }))
  assert.equal(
    (await objects.get('a')).etag,
    '"5d41402abc4b2a76b9719d911017c592"',
  )
  assert.equal(await objects.get('missing'), null)
})

test('If-Match writes only over the version it names', async () => {
  const objects = createObjects(memoryBackend({ a: 'v1' }))
  const { etag } = await objects.get('a')
  const next = await objects.put('a', bytes('v2'), { ifMatch: etag })
  await assert.rejects(
    objects.put('a', bytes('v3'), { ifMatch: etag }),
    ConflictError,
  )
  await assert.rejects(
    objects.put('missing', bytes('x'), { ifMatch: etag }),
    ConflictError,
  )
  assert.deepEqual(await objects.get('a'), { body: bytes('v2'), etag: next })
})

test('If-None-Match: * writes only a new object', async () => {
  const objects = createObjects(memoryBackend({ a: 'v1' }))
  await assert.rejects(
    objects.put('a', bytes('v2'), { ifNoneMatch: '*' }),
    ConflictError,
  )
  await objects.put('b', bytes('new'), { ifNoneMatch: '*' })
  assert.deepEqual(await objects.list(''), ['a', 'b'])
})
