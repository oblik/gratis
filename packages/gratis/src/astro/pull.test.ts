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
import { pathToFileURL } from 'node:url'

import { expect, test } from 'vitest'

import { blog, json } from '../emulator/fixtures.ts'
import { emulatedStorage, memoryBackend } from '../emulator/index.ts'
import { pull } from './pull.ts'

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
    const log: string[] = []
    await pull(emulatedStorage(bucket), pathToFileURL(dir + '/'), (m) =>
      log.push(m),
    )
    expect((await readdir(join(dir, 'src/data/posts'))).sort()).toStrictEqual([
      'a.json',
      'b.json',
      'notes.txt',
    ])
    expect(
      JSON.parse(await readFile(join(dir, 'src/data/site.json'), 'utf8')),
    ).toStrictEqual({ title: 'Blog' })
    expect(log).toStrictEqual([
      'pulled site -> src/data/site.json',
      'pulled posts (2 entries) -> src/data/posts/',
    ])

    bucket.objects.delete('_gratis/content/site.json')
    await pull(emulatedStorage(bucket), pathToFileURL(dir + '/'), () => {})
    expect(await readFile(join(dir, 'src/data/site.json'), 'utf8')).toMatch(
      /Blog/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("pull mirrors a shared file's entries into it, sorted by id", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gratis-pull-'))
  try {
    await mkdir(join(dir, 'src/data'), { recursive: true })
    const file = join(dir, 'src/data/tags.json')
    await writeFile(
      file,
      json({ travel: { title: 'Old' }, cooking: { title: 'Cooking' } }),
    )
    const bucket = memoryBackend({
      '_gratis/schema.json': json({
        collections: {
          tags: {
            single: false,
            label: 'Tags',
            source: 'src/data/tags.json',
            fields: { title: { type: 'text', label: 'Title' } },
          },
        },
        bindings: {},
      }),
      '_gratis/content/tags/art.json': json({ title: 'Art' }),
      '_gratis/content/tags/travel.json': json({ title: 'Travel' }),
    })
    const log: string[] = []
    await pull(emulatedStorage(bucket), pathToFileURL(dir + '/'), (m) =>
      log.push(m),
    )
    expect(await readFile(file, 'utf8')).toBe(
      json({ art: { title: 'Art' }, travel: { title: 'Travel' } }),
    )
    expect(log).toStrictEqual(['pulled tags (2 entries) -> src/data/tags.json'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pull does nothing for a bucket that was never deployed', async () => {
  const log: string[] = []
  await pull(
    emulatedStorage(memoryBackend()),
    new URL('file:///nowhere/'),
    (m) => log.push(m),
  )
  expect(log).toStrictEqual([
    'nothing to pull: the bucket has no schema.json yet',
  ])
})
