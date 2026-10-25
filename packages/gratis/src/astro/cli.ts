#!/usr/bin/env node
// gratis deploy --bucket <name>   pull content, build, upload dist/
// gratis pull --bucket <name>     copy the bucket's content files into the repo
// gratis preview [--port 4321]    serve dist/ with the storage emulator, as if it were the bucket
//
// Credentials and region come from the environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// AWS_SESSION_TOKEN (optional) and AWS_REGION.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, relative } from 'node:path'
import { parseArgs } from 'node:util'

import { encryptCredentials } from '../core/auth.ts'
import {
  AUTH,
  collectionFolder,
  CONTENT,
  contentKey,
  entryIds,
  SCHEMA,
} from '../core/bucket.ts'
import { sourcePath, type Schema } from '../core/schema.ts'
import { createStorage, type Storage } from '../core/storage.ts'
import {
  contentType,
  createEmulator,
  folderBackend,
  type Backend,
} from '../emulator/index.ts'

const {
  positionals: [command],
  values: args,
} = parseArgs({
  allowPositionals: true,
  options: {
    bucket: { type: 'string' },
    root: { type: 'string', default: process.cwd() },
    port: { type: 'string', default: '4321' },
  },
})
if (
  !(['deploy', 'pull'].includes(command!) && args.bucket) &&
  command !== 'preview'
) {
  console.error(
    'usage: gratis <deploy|pull> --bucket <name> [--root <dir>]\n       gratis preview [--root <dir>] [--port <port>]',
  )
  process.exit(1)
}

const root = args.root!
const dist = join(root, 'dist')

function bucketStorage(bucket: string): Storage {
  const {
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_SESSION_TOKEN: sessionToken,
  } = process.env
  if (!region || !accessKeyId || !secretAccessKey)
    throw new Error(
      'set AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
    )
  return createStorage({
    endpoint: `https://s3.${region}.amazonaws.com/${bucket}`,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
  })
}

// A collection's folder is mirrored: entries deleted in the bucket are deleted in the repo too, or
// the next deploy would seed them again.
async function pull(storage: Storage) {
  const schema = await storage.get(SCHEMA)
  if (!schema)
    return console.log('nothing to pull: the bucket has no schema.json yet')
  for (const [name, collection] of Object.entries(
    (JSON.parse(schema.text) as Schema).collections,
  )) {
    if (collection.single) {
      const file = await storage.get(contentKey(name))
      if (!file) continue
      await mkdir(dirname(join(root, collection.source)), { recursive: true })
      await writeFile(join(root, collection.source), file.text)
      console.log(`pulled ${name} -> ${collection.source}`)
      continue
    }
    const folder = collectionFolder(name)
    const ids = entryIds(folder, await storage.list(folder))
    const dir = join(root, collection.source)
    await mkdir(dir, { recursive: true })
    for (const id of ids) {
      const file = await storage.get(contentKey(`${name}/${id}`))
      await writeFile(join(root, sourcePath(collection, id)), file!.text)
    }
    for (const file of await readdir(dir))
      if (
        file.endsWith('.json') &&
        !ids.includes(file.slice(0, -'.json'.length))
      )
        await rm(join(dir, file))
    console.log(
      `pulled ${name} (${ids.length} entries) -> ${collection.source}`,
    )
  }
}

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

// Seeded on the first deploy and never replaced after: editors own them once the site is live.
const SEEDED = [CONTENT]
// Never uploaded: editors create them.
const SKIPPED = [AUTH, 'uploads/']
// Content-hashed, so cacheable forever.
const IMMUTABLE = ['_astro/', 'admin/assets/']
const under = (key: string, prefixes: string[]) =>
  prefixes.some((prefix) => key.startsWith(prefix))

async function upload(storage: Storage) {
  let uploaded = 0
  for await (const path of files(dist)) {
    const key = relative(dist, path).split('\\').join('/')
    if (under(key, SKIPPED)) continue
    const seeded = under(key, SEEDED)
    await storage
      .put(key, await readFile(path), {
        type: contentType(key),
        cacheControl: under(key, IMMUTABLE)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
        ifNoneMatch: seeded ? '*' : undefined,
      })
      .then(
        () => uploaded++,
        (error) => {
          if (!(seeded && error.name === 'ConflictError')) throw error
        },
      )
  }
  console.log(`uploaded ${uploaded} file(s) to ${args.bucket}`)
}

// The built site as the bucket, on localhost (a secure context, so the admin's WebCrypto works).
// Saves write into dist/, so a rebuild starts over from the repo's content.
async function preview() {
  const port = Number(args.port)
  const origin = `http://localhost:${port}`
  const password = process.env.GRATIS_PREVIEW_PASSWORD ?? 'gratis-preview'
  // A login like the real one, for keys the emulator doesn't check.
  const blob = JSON.stringify(
    await encryptCredentials(
      { accessKeyId: 'local', secretAccessKey: 'local' },
      password,
      { endpoint: origin, region: 'local' },
    ),
  )
  const files = folderBackend(dist)
  const backend: Backend = {
    ...files,
    read: async (key) =>
      key === `${AUTH}admin.json`
        ? new TextEncoder().encode(blob)
        : files.read(key),
  }
  const handle = createEmulator(backend, { website: true })
  createServer((req, res) => handle(req, res)).listen(port, 'localhost', () => {
    console.log(`serving ${relative(process.cwd(), dist) || '.'} at ${origin}/`)
    console.log(`admin: ${origin}/admin/, log in as admin / ${password}`)
  })
}

if (command === 'preview') {
  await preview()
} else {
  const storage = bucketStorage(args.bucket!)
  await pull(storage)
  if (command === 'deploy') {
    const { build } = await import('astro')
    await build({ root })
    await upload(storage)
  }
}
