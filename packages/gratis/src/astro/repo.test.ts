import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, expect, test } from 'vitest'

import type { Collection } from '../core/schema.ts'
import type { Backend } from '../emulator/index.ts'
import { readContent, repoContent } from './repo.ts'

const collections: Record<string, Collection> = {
  site: {
    single: true,
    label: 'Site',
    source: 'src/data/site.json',
    fields: {},
  },
  posts: {
    single: false,
    label: 'Posts',
    source: 'src/data/posts/',
    fields: {},
  },
  tags: {
    single: false,
    label: 'Tags',
    source: 'src/data/tags.json',
    fields: {},
  },
}
const text = (bytes: Uint8Array | null) =>
  bytes && new TextDecoder().decode(bytes)
const bytes = (s: string) => new TextEncoder().encode(s)

let dir: string, repo: Backend
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gratis-repo-'))
  await mkdir(join(dir, 'src/data/posts'), { recursive: true })
  await writeFile(join(dir, 'src/data/site.json'), '{"title":"Blog"}')
  await writeFile(join(dir, 'src/data/posts/a.json'), '{"title":"A"}')
  await writeFile(join(dir, 'src/data/posts/notes.txt'), 'not an entry')
  await writeFile(
    join(dir, 'src/data/tags.json'),
    '{"travel":{"title":"Travel"},"cooking":{"title":"Cooking"}}',
  )
  repo = repoContent(pathToFileURL(dir + '/'), () => collections)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

test('content keys read the files their collection points at', async () => {
  expect(text(await repo.read('_gratis/content/site.json'))).toBe(
    '{"title":"Blog"}',
  )
  expect(text(await repo.read('_gratis/content/posts/a.json'))).toBe(
    '{"title":"A"}',
  )
  expect(await repo.read('_gratis/content/posts/b.json')).toBe(null)
})

test('anything that is not an entry of a known collection reads as missing', async () => {
  for (const key of [
    'index.html',
    '_gratis/schema.json',
    '_gratis/content/pages/a.json',
    '_gratis/content/posts.json',
    '_gratis/content/site/a.json',
    '_gratis/content/posts/../../../secret.json',
  ])
    expect(await repo.read(key), key).toBe(null)
  await expect(
    repo.write('_gratis/content/posts/../../x.json', bytes('{}')),
  ).rejects.toThrow(/isn't an entry's content file/)
})

test('writes create the folder, and removes delete the file', async () => {
  await rm(join(dir, 'src/data/posts'), { recursive: true })
  await repo.write('_gratis/content/posts/b.json', bytes('{"title":"B"}'))
  expect(await readFile(join(dir, 'src/data/posts/b.json'), 'utf8')).toBe(
    '{"title":"B"}',
  )
  await repo.remove('_gratis/content/posts/b.json')
  expect(await repo.read('_gratis/content/posts/b.json')).toBe(null)
})

test("a listing has the singles and each collection's JSON files, by prefix", async () => {
  expect(await repo.list('_gratis/content/')).toStrictEqual([
    '_gratis/content/posts/a.json',
    '_gratis/content/site.json',
    '_gratis/content/tags/cooking.json',
    '_gratis/content/tags/travel.json',
  ])
  expect(await repo.list('_gratis/content/posts/')).toStrictEqual([
    '_gratis/content/posts/a.json',
  ])
  expect(await repo.list('admin/')).toStrictEqual([])
  await rm(join(dir, 'src/data'), { recursive: true })
  expect(await repo.list('')).toStrictEqual([])
})

test('readContent parses every entry by its entry key', async () => {
  expect(await readContent(repo)).toStrictEqual({
    'posts/a': { title: 'A' },
    site: { title: 'Blog' },
    'tags/cooking': { title: 'Cooking' },
    'tags/travel': { title: 'Travel' },
  })
})

test("a shared file's entries read as its properties", async () => {
  expect(text(await repo.read('_gratis/content/tags/travel.json'))).toBe(
    '{\n  "title": "Travel"\n}\n',
  )
  // Not a key in the file.
  expect(await repo.read('_gratis/content/tags/hiking.json')).toBe(null)
  // Inherited by every object, but not a key in the file either.
  expect(await repo.read('_gratis/content/tags/constructor.json')).toBe(null)
  // The whole file isn't an entry: only the collection's entries are.
  expect(await repo.read('_gratis/content/tags.json')).toBe(null)
})

test("writes sort a shared file by id, and removes delete the entry's property", async () => {
  // Read from the text because JSON.parse would hide the file's order: an
  // object lists integer keys like 9 and 10 first, in numeric order.
  const ids = async () => {
    const text = await readFile(join(dir, 'src/data/tags.json'), 'utf8')
    return [...text.matchAll(/^ {2}"([^"]+)":/gm)].map(([, id]) => id)
  }
  await repo.write(
    '_gratis/content/tags/travel.json',
    bytes('{"title":"Trips"}'),
  )
  await repo.write('_gratis/content/tags/art.json', bytes('{"title":"Art"}'))
  // Ids sort as text, so 10 comes before 9, where an object would put 9 first.
  await repo.write('_gratis/content/tags/9.json', bytes('{}'))
  await repo.write('_gratis/content/tags/10.json', bytes('{}'))
  expect(await ids()).toStrictEqual(['10', '9', 'art', 'cooking', 'travel'])
  expect(text(await repo.read('_gratis/content/tags/travel.json'))).toMatch(
    /Trips/,
  )
  await repo.remove('_gratis/content/tags/cooking.json')
  await repo.remove('_gratis/content/tags/cooking.json')
  expect(await ids()).toStrictEqual(['10', '9', 'art', 'travel'])
})

test('a missing shared file has no entries, and the first write creates it', async () => {
  await rm(join(dir, 'src/data'), { recursive: true })
  expect(await repo.list('_gratis/content/tags/')).toStrictEqual([])
  await repo.write('_gratis/content/tags/art.json', bytes('{"title":"Art"}'))
  expect(
    JSON.parse(await readFile(join(dir, 'src/data/tags.json'), 'utf8')),
  ).toStrictEqual({ art: { title: 'Art' } })
})

test('a shared file must be an object keyed by valid ids', async () => {
  const file = join(dir, 'src/data/tags.json')
  await writeFile(file, '[{"id":"travel"}]')
  await expect(repo.list('_gratis/content/')).rejects.toThrow(
    /must be an object keyed by id/,
  )
  await writeFile(file, '{"Road Trips":{}}')
  await expect(repo.list('_gratis/content/')).rejects.toThrow(
    /"Road Trips" in .* isn't a valid id/,
  )
})
