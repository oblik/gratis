// The repo's content files under the bucket's content keys.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { readContent, repoContent } from '../src/astro/repo.ts'

const collections = {
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
}
const text = (bytes) => bytes && new TextDecoder().decode(bytes)
const bytes = (s) => new TextEncoder().encode(s)

let dir, repo
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gratis-repo-'))
  await mkdir(join(dir, 'src/data/posts'), { recursive: true })
  await writeFile(join(dir, 'src/data/site.json'), '{"title":"Blog"}')
  await writeFile(join(dir, 'src/data/posts/a.json'), '{"title":"A"}')
  await writeFile(join(dir, 'src/data/posts/notes.txt'), 'not an entry')
  repo = repoContent(pathToFileURL(dir + '/'), () => collections)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

test('content keys read the files their collection points at', async () => {
  assert.equal(
    text(await repo.read('_gratis/content/site.json')),
    '{"title":"Blog"}',
  )
  assert.equal(
    text(await repo.read('_gratis/content/posts/a.json')),
    '{"title":"A"}',
  )
  assert.equal(await repo.read('_gratis/content/posts/b.json'), null)
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
    assert.equal(await repo.read(key), null, key)
  await assert.rejects(
    repo.write('_gratis/content/posts/../../x.json', bytes('{}')),
    /isn't an entry's content file/,
  )
})

test('writes create the folder, and removes delete the file', async () => {
  await rm(join(dir, 'src/data/posts'), { recursive: true })
  await repo.write('_gratis/content/posts/b.json', bytes('{"title":"B"}'))
  assert.equal(
    await readFile(join(dir, 'src/data/posts/b.json'), 'utf8'),
    '{"title":"B"}',
  )
  await repo.remove('_gratis/content/posts/b.json')
  assert.equal(await repo.read('_gratis/content/posts/b.json'), null)
})

test("a listing has the singles and each collection's JSON files, by prefix", async () => {
  assert.deepEqual(await repo.list('_gratis/content/'), [
    '_gratis/content/posts/a.json',
    '_gratis/content/site.json',
  ])
  assert.deepEqual(await repo.list('_gratis/content/posts/'), [
    '_gratis/content/posts/a.json',
  ])
  assert.deepEqual(await repo.list('admin/'), [])
  await rm(join(dir, 'src/data'), { recursive: true })
  assert.deepEqual(await repo.list(''), [])
})

test('readContent parses every entry by its entry key', async () => {
  assert.deepEqual(await readContent(repo), {
    'posts/a': { title: 'A' },
    site: { title: 'Blog' },
  })
})
