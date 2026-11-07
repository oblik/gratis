// Pulling the bucket's content into the repo, against a bucket in memory.

import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { pull } from '../src/astro/pull.ts'
import { emulatedStorage } from '../src/emulator/index.ts'
import { blog, json } from './fixtures.js'

test('pull mirrors each collection, copies singles, and leaves a single missing from the bucket alone', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gratis-pull-'))
  try {
    await mkdir(join(dir, 'src/data/posts'), { recursive: true })
    await writeFile(join(dir, 'src/data/site.json'), '{"title":"Old"}')
    await writeFile(join(dir, 'src/data/posts/gone.json'), '{}')
    await writeFile(join(dir, 'src/data/posts/notes.txt'), 'kept')
    const bucket = blog()
    bucket.objects.set(
      '_gratis/content/posts/b.json',
      new TextEncoder().encode(json({ title: 'B' })),
    )
    const log = []
    await pull(emulatedStorage(bucket), pathToFileURL(dir + '/'), (m) =>
      log.push(m),
    )
    assert.deepEqual((await readdir(join(dir, 'src/data/posts'))).sort(), [
      'a.json',
      'b.json',
      'notes.txt',
    ])
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'src/data/site.json'), 'utf8')),
      { title: 'Blog' },
    )
    assert.deepEqual(log, [
      'pulled site -> src/data/site.json',
      'pulled posts (2 entries) -> src/data/posts/',
    ])

    bucket.objects.delete('_gratis/content/site.json')
    await pull(emulatedStorage(bucket), pathToFileURL(dir + '/'), () => {})
    assert.match(
      await readFile(join(dir, 'src/data/site.json'), 'utf8'),
      /Blog/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pull does nothing for a bucket that was never deployed', async () => {
  const log = []
  const { memoryBackend } = await import('../src/emulator/index.ts')
  await pull(
    emulatedStorage(memoryBackend()),
    new URL('file:///nowhere/'),
    (m) => log.push(m),
  )
  assert.deepEqual(log, ['nothing to pull: the bucket has no schema.json yet'])
})
