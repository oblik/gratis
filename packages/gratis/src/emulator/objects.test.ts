// The emulator's object layer: ETags and the conditional writes the save locks with.

import { expect, test } from 'vitest'

import { ConflictError } from '../core/storage.ts'
import { createObjects, memoryBackend } from './index.ts'

const bytes = (s: string) => new TextEncoder().encode(s)

test('an ETag is the quoted MD5 of the bytes, as S3 gives it', async () => {
  const objects = createObjects(memoryBackend({ a: 'hello' }))
  expect((await objects.get('a'))?.etag).toBe(
    '"5d41402abc4b2a76b9719d911017c592"',
  )
  expect(await objects.get('missing')).toBe(null)
})

test('If-Match writes only over the version it names', async () => {
  const objects = createObjects(memoryBackend({ a: 'v1' }))
  const { etag } = (await objects.get('a'))!
  const next = await objects.put('a', bytes('v2'), { ifMatch: etag })
  await expect(
    objects.put('a', bytes('v3'), { ifMatch: etag }),
  ).rejects.toThrow(ConflictError)
  await expect(
    objects.put('missing', bytes('x'), { ifMatch: etag }),
  ).rejects.toThrow(ConflictError)
  expect(await objects.get('a')).toStrictEqual({
    body: bytes('v2'),
    etag: next,
  })
})

test('If-None-Match: * writes only a new object', async () => {
  const objects = createObjects(memoryBackend({ a: 'v1' }))
  await expect(
    objects.put('a', bytes('v2'), { ifNoneMatch: '*' }),
  ).rejects.toThrow(ConflictError)
  await objects.put('b', bytes('new'), { ifNoneMatch: '*' })
  expect(await objects.list('')).toStrictEqual(['a', 'b'])
})
