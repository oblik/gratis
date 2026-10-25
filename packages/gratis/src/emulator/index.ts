// The storage emulator (docs/astro-integration.md#preview-and-tests): the S3 subset the admin uses,
// over HTTP, so the admin runs its one code path locally and only the endpoint differs. Signatures
// aren't checked. A connect-style handler, so it mounts as Vite middleware or on a plain server.

import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Backend } from './backends.ts'
import { contentType } from './content-type.ts'

export * from './backends.ts'
export * from './content-type.ts'

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
  /** ListObjectsV2, in one page: Gratis lists folders of a few dozen entries. */
  async function list(res: ServerResponse, prefix: string) {
    const keys = await backend.list(prefix)
    send(
      res,
      200,
      { 'Content-Type': 'application/xml' },
      listResult(prefix, keys),
    )
  }

  /** GetObject and HeadObject, falling back to `next` or, under `website`, 404.html. */
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
    if (found) return serve(req, res, 200, found.key, found.body)
    if (next) return next()
    const page = website ? await backend.read('404.html') : null
    if (!page) return send(res, 404)
    serve(req, res, 404, '404.html', page)
  }

  /** The object a read serves, with the website endpoint's index.html and folder redirect. */
  async function lookup(
    key: string,
    pathname: string,
  ): Promise<{ key: string; body: Uint8Array } | { location: string } | null> {
    if (website && (key === '' || key.endsWith('/'))) key += 'index.html'
    const body = await backend.read(key)
    if (body) return { key, body }
    if (
      website &&
      !key.endsWith('.html') &&
      (await backend.read(`${key}/index.html`))
    )
      return { location: `${pathname}/` }
    return null
  }

  /** PutObject, with If-Match and If-None-Match: * for optimistic locking. */
  async function put(req: IncomingMessage, res: ServerResponse, key: string) {
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
    send(res, 200, { ETag: etagOf(body) })
  }

  /** DeleteObject. */
  async function remove(res: ServerResponse, key: string) {
    await backend.remove(key)
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
      // ListObjectsV2 is on the path-style endpoint, which is the origin's root.
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

/** An object's body, with its ETag; 304 when the client already has it. */
function serve(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  key: string,
  body: Uint8Array,
) {
  const etag = etagOf(body)
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

const etagOf = (body: Uint8Array) =>
  `"${createHash('md5').update(body).digest('hex')}"`

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
