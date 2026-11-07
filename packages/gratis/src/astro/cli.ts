#!/usr/bin/env node
// gratis deploy --bucket <name>   pull content, build, upload dist/
// gratis pull --bucket <name>     copy the bucket's content files into the repo
// gratis preview [--port 4321]    serve the local bucket as if it were S3
//
// Credentials and region come from the environment: AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional) and AWS_REGION.
//
// --local instead of --bucket uses the local bucket, a folder that
// `gratis preview` serves.
import { createServer } from 'node:http'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { encryptCredentials } from '../core/auth.ts'
import { AUTH } from '../core/bucket.ts'
import { createStorage, type Storage } from '../core/storage.ts'
import {
  createEmulator,
  emulatedStorage,
  folderBackend,
  type Backend,
} from '../emulator/index.ts'
import { upload } from './deploy.ts'
import { pull } from './pull.ts'

const {
  positionals: [command],
  values: args,
} = parseArgs({
  allowPositionals: true,
  options: {
    bucket: { type: 'string' },
    local: { type: 'boolean' },
    root: { type: 'string', default: process.cwd() },
    port: { type: 'string', default: '4321' },
  },
})
if (
  !(
    ['deploy', 'pull'].includes(command!) &&
    Boolean(args.bucket) !== Boolean(args.local)
  ) &&
  command !== 'preview'
) {
  console.error(
    'usage: gratis <deploy|pull> (--bucket <name> | --local) [--root <dir>]\n       gratis preview [--root <dir>] [--port <port>]',
  )
  process.exit(1)
}

const root = args.root!
const dist = join(root, 'dist')
/**
 * Outlives builds, like a real bucket: `deploy --local` seeds the content once
 * and editors' saves in the preview stay until it's deleted.
 */
const localBucket = join(root, '.gratis/bucket')
const show = (dir: string) => relative(process.cwd(), dir) || '.'

function bucketStorage(): Storage {
  if (args.local) return emulatedStorage(folderBackend(localBucket))
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
    endpoint: `https://s3.${region}.amazonaws.com/${args.bucket}`,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
  })
}

/**
 * The local bucket over HTTP on localhost (a secure context, so the admin's
 * WebCrypto works), with a login that needs no `_gratis/auth/` in it.
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
  const files = folderBackend(localBucket)
  if (!(await files.list('')).length)
    console.warn(
      `${show(localBucket)} is empty: run \`gratis deploy --local\` first`,
    )
  const backend: Backend = {
    ...files,
    read: async (key) =>
      key === `${AUTH}admin.json`
        ? new TextEncoder().encode(blob)
        : files.read(key),
  }
  const handle = createEmulator(backend, { website: true })
  createServer((req, res) => handle(req, res)).listen(port, 'localhost', () => {
    console.log(`serving ${show(localBucket)} at ${origin}/`)
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
    const uploaded = await upload(storage, dist)
    console.log(
      `uploaded ${uploaded} file(s) to ${args.bucket ?? show(localBucket)}`,
    )
  }
}
