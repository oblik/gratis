import type { IncomingMessage, ServerResponse } from 'node:http'

import { ConflictError } from '../core/storage.ts'
import type { Backend } from './backends.ts'
import { contentType } from './content-type.ts'
import { createObjects, type StoredBytes } from './objects.ts'

export interface EmulatorOptions {
  /**
   * Also act as the S3 website endpoint for reads: `/` and `/dir/` serve
   * index.html, `/dir` redirects to `/dir/`, and a missing object serves
   * 404.html.
   */
  website?: boolean
}

/**
 * Signatures aren't checked. Without `next`, a missing object is a 404; with
 * it, the request passes on, as in dev.
 */
export function createEmulator(
  backend: Backend,
  { website = false }: EmulatorOptions = {},
) {
  const objects = createObjects(backend)

  /** In one page: Gratis lists folders of a few dozen entries. */
  async function list(res: ServerResponse, prefix: string) {
    const keys = await objects.list(prefix)
    send(
      res,
      200,
      { 'Content-Type': 'application/xml' },
      listResult(prefix, keys),
    )
  }

  async function get(
    req: IncomingMessage,
    res: ServerResponse,
    key: string,
    pathname: string,
    next?: () => void,
  ) {
    const found = await lookup(key, pathname)
    if (found && 'location' in found)
      return send(res, 301, { Location: found.location })
    if (found) return serve(req, res, 200, found.key, found.object)
    if (next) return next()
    const page = website ? await objects.get('404.html') : null
    if (!page) return send(res, 404)
    serve(req, res, 404, '404.html', page)
  }

  async function lookup(
    key: string,
    pathname: string,
  ): Promise<
    { key: string; object: StoredBytes } | { location: string } | null
  > {
    if (website && (key === '' || key.endsWith('/'))) key += 'index.html'
    const object = await objects.get(key)
    if (object) return { key, object }
    if (
      website &&
      !key.endsWith('.html') &&
      (await objects.get(`${key}/index.html`))
    )
      return { location: `${pathname}/` }
    return null
  }

  async function put(req: IncomingMessage, res: ServerResponse, key: string) {
    const ifMatch = req.headers['if-match']
    const ifNoneMatch = req.headers['if-none-match'] === '*' ? '*' : undefined
    try {
      const etag = await objects.put(key, await readBody(req), {
        ifMatch,
        ifNoneMatch,
      })
      send(res, 200, { ETag: etag })
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error
      send(res, 412)
    }
  }

  async function remove(res: ServerResponse, key: string) {
    await objects.delete(key)
    send(res, 204)
  }

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next?: () => void,
  ) => {
    const { pathname, searchParams } = new URL(req.url!, 'http://localhost')
    const key = decodeURIComponent(pathname).slice(1)
    try {
      // ListObjectsV2 is on the path-style endpoint, which is the origin's
      // root.
      if (
        req.method === 'GET' &&
        key === '' &&
        searchParams.get('list-type') === '2'
      )
        return await list(res, searchParams.get('prefix') ?? '')
      if (req.method === 'GET' || req.method === 'HEAD')
        return await get(req, res, key, pathname, next)
      if (req.method === 'PUT') return await put(req, res, key)
      if (req.method === 'DELETE') return await remove(res, key)
      send(res, 405)
    } catch (error) {
      send(
        res,
        500,
        { 'Content-Type': 'text/plain' },
        new TextEncoder().encode(String(error)),
      )
    }
  }
}

function serve(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  key: string,
  { body, etag }: StoredBytes,
) {
  if (status === 200 && req.headers['if-none-match'] === etag)
    return send(res, 304, { ETag: etag })
  const headers = {
    ETag: etag,
    'Content-Type': contentType(key),
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  }
  send(res, status, headers, req.method === 'HEAD' ? undefined : body)
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const listResult = (prefix: string, keys: string[]) =>
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
