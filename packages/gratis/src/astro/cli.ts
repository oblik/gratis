#!/usr/bin/env node
// gratis deploy --bucket <name>   pull content, build, upload dist/
// gratis pull --bucket <name>     copy the bucket's content files into the repo
// gratis preview [--port 4321]    serve dist/ as if it were the bucket
//
// Credentials and region come from the environment: AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional) and AWS_REGION.
//
// --endpoint <url> replaces --bucket with any path-style bucket URL, such as
// a running `gratis preview` at http://localhost:4321. Credentials then
// default to dummy ones, which only the emulator accepts.
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { encryptCredentials } from '../core/auth.ts'
import { AUTH, CONTENT } from '../core/bucket.ts'
import { createStorage, type Storage } from '../core/storage.ts'
import {
  contentType,
  createEmulator,
  folderBackend,
  type Backend,
} from '../emulator/index.ts'
import { pull } from './pull.ts'

const {
  positionals: [command],
  values: args,
} = parseArgs({
  allowPositionals: true,
  options: {
    bucket: { type: 'string' },
    endpoint: { type: 'string' },
    root: { type: 'string', default: process.cwd() },
    port: { type: 'string', default: '4321' },
  },
})
if (
  !(['deploy', 'pull'].includes(command!) && (args.bucket || args.endpoint)) &&
  command !== 'preview'
) {
  console.error(
    'usage: gratis <deploy|pull> (--bucket <name> | --endpoint <url>) [--root <dir>]\n       gratis preview [--root <dir>] [--port <port>]',
  )
  process.exit(1)
}

const root = args.root!
const dist = join(root, 'dist')

function bucketStorage(): Storage {
  const local = args.endpoint ? 'local' : undefined
  const {
    AWS_REGION: region = local,
    AWS_ACCESS_KEY_ID: accessKeyId = local,
    AWS_SECRET_ACCESS_KEY: secretAccessKey = local,
    AWS_SESSION_TOKEN: sessionToken,
  } = process.env
  if (!region || !accessKeyId || !secretAccessKey)
    throw new Error(
      'set AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
    )
  return createStorage({
    endpoint:
      args.endpoint?.replace(/\/+$/, '') ??
      `https://s3.${region}.amazonaws.com/${args.bucket}`,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
  })
}

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

/**
 * Seeded on the first deploy and never replaced after: editors own them once
 * the site is live.
 */
const SEEDED = [CONTENT]
/** Never uploaded: editors create them. */
const SKIPPED = [AUTH, 'uploads/']
/** Content-hashed, so cacheable forever. */
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
  console.log(`uploaded ${uploaded} file(s) to ${args.bucket ?? args.endpoint}`)
}

/**
 * The built site as the bucket, on localhost (a secure context, so the admin's
 * WebCrypto works). Saves write into dist/, so a rebuild starts over from the
 * repo's content.
 */
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
  const storage = bucketStorage()
  await pull(storage, pathToFileURL(join(root, '/')))
  if (command === 'deploy') {
    const { build } = await import('astro')
    await build({ root })
    await upload(storage)
  }
}
