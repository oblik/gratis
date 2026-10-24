// The storage emulator (docs/astro-integration.md#preview-and-tests): the S3 subset the admin uses,
// over HTTP, so the admin runs its one code path locally and only the endpoint differs. Signatures
// aren't checked. A connect-style handler, so it mounts as Vite middleware or on a plain server.

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

export interface Backend {
  read(key: string): Promise<Uint8Array | null>
  write(key: string, body: Uint8Array): Promise<void>
  remove(key: string): Promise<void>
  /** Every key that starts with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>
}

export const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

export const contentType = (key: string) =>
  TYPES[extname(key)] ?? 'application/octet-stream'

const etagOf = (body: Uint8Array) =>
  `"${createHash('md5').update(body).digest('hex')}"`

/** Objects in memory, for tests. Strings are stored as UTF-8. */
export function memoryBackend(
  initial: Record<string, string | Uint8Array> = {},
): Backend & { objects: Map<string, Uint8Array> } {
  const encode = (body: string | Uint8Array) =>
    typeof body === 'string' ? new TextEncoder().encode(body) : body
  const objects = new Map(
    Object.entries(initial).map(([key, body]) => [key, encode(body)]),
  )
  return {
    objects,
    read: async (key) => objects.get(key) ?? null,
    write: async (key, body) => void objects.set(key, body),
    remove: async (key) => void objects.delete(key),
    list: async (prefix) =>
      [...objects.keys()].filter((key) => key.startsWith(prefix)).sort(),
  }
}

/** Objects as files under `dir`, the bucket layout of dist/. */
export function folderBackend(dir: string): Backend {
  const root = resolve(dir)
  const path = (key: string) => {
    const file = resolve(root, key)
    if (!file.startsWith(root + sep))
      throw new Error(`key outside the bucket: ${key}`)
    return file
  }
  return {
    read: (key) =>
      readFile(path(key)).catch((error) =>
        error.code === 'ENOENT' || error.code === 'EISDIR'
          ? null
          : Promise.reject(error),
      ),
    async write(key, body) {
      await mkdir(dirname(path(key)), { recursive: true })
      await writeFile(path(key), body)
    },
    remove: (key) => rm(path(key), { force: true }),
    async list(prefix) {
      // Walks only the folder the prefix is in.
      const dir = resolve(root, prefix.slice(0, prefix.lastIndexOf('/') + 1))
      if (dir !== root && !dir.startsWith(root + sep)) return []
      const keys: string[] = []
      for (const file of await readdir(dir, {
        recursive: true,
        withFileTypes: true,
      }).catch(() => [])) {
        if (!file.isFile()) continue
        const key = relative(root, join(file.parentPath, file.name))
          .split(sep)
          .join('/')
        if (key.startsWith(prefix)) keys.push(key)
      }
      return keys.sort()
    },
  }
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** ListObjectsV2's response, in one page: Gratis lists folders of a few dozen entries. */
export const listResult = (prefix: string, keys: string[]) =>
  new TextEncoder().encode(
    '<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
      `<Prefix>${xml(prefix)}</Prefix><KeyCount>${keys.length}</KeyCount><IsTruncated>false</IsTruncated>` +
      keys
        .map((key) => `<Contents><Key>${xml(key)}</Key></Contents>`)
        .join('') +
      '</ListBucketResult>',
  )

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return new Uint8Array(Buffer.concat(chunks))
}

function send(
  res: ServerResponse,
  status: number,
  headers: Record<string, string | number> = {},
  body?: Uint8Array,
) {
  res.writeHead(status, headers)
  res.end(body)
}

export interface EmulatorOptions {
  /**
   * Also act as the S3 website endpoint for reads: `/` and `/dir/` serve index.html, `/dir`
   * redirects to `/dir/`, and a missing object serves 404.html.
   */
  website?: boolean
}

/** Without `next`, a missing object is a 404; with it, the request passes on, as in dev. */
export function createEmulator(
  backend: Backend,
  { website = false }: EmulatorOptions = {},
) {
  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    next?: () => void,
  ) {
    const { pathname, searchParams } = new URL(req.url!, 'http://localhost')
    let key = decodeURIComponent(pathname).slice(1)
    try {
      // ListObjectsV2 on the path-style endpoint, which is the origin's root.
      if (
        req.method === 'GET' &&
        key === '' &&
        searchParams.get('list-type') === '2'
      ) {
        const prefix = searchParams.get('prefix') ?? ''
        return send(
          res,
          200,
          { 'Content-Type': 'application/xml' },
          listResult(prefix, await backend.list(prefix)),
        )
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (website && (key === '' || key.endsWith('/'))) key += 'index.html'
        let body = await backend.read(key)
        if (
          !body &&
          website &&
          !key.endsWith('.html') &&
          (await backend.read(`${key}/index.html`))
        ) {
          return send(res, 301, { Location: `${pathname}/` })
        }
        let status = 200
        if (!body) {
          if (next) return next()
          body = website ? await backend.read('404.html') : null
          if (!body) return send(res, 404)
          ;[status, key] = [404, '404.html']
        }
        const etag = etagOf(body)
        if (status === 200 && req.headers['if-none-match'] === etag)
          return send(res, 304, { ETag: etag })
        const headers = {
          ETag: etag,
          'Content-Type': contentType(key),
          'Content-Length': body.length,
          'Cache-Control': 'no-cache',
        }
        return send(
          res,
          status,
          headers,
          req.method === 'HEAD' ? undefined : body,
        )
      }
      if (req.method === 'PUT') {
        const body = await readBody(req)
        const current = await backend.read(key)
        const ifMatch = req.headers['if-match']
        const ifNoneMatch = req.headers['if-none-match']
        if (
          (ifMatch && (!current || etagOf(current) !== ifMatch)) ||
          (ifNoneMatch === '*' && current)
        )
          return send(res, 412)
        await backend.write(key, body)
        return send(res, 200, { ETag: etagOf(body) })
      }
      if (req.method === 'DELETE') {
        await backend.remove(key)
        return send(res, 204)
      }
      return send(res, 405)
    } catch (error) {
      return send(
        res,
        500,
        { 'Content-Type': 'text/plain' },
        new TextEncoder().encode(String(error)),
      )
    }
  }
}
