// The one storage client: the S3 REST API signed with the editor's key, over fetch, so it runs in
// the browser and in Node alike. Locally the same requests go to the emulator; only the endpoint
// and the credentials differ.

import { AwsClient } from 'aws4fetch'

export class ConflictError extends Error {}

export interface Credentials {
  /** The path-style endpoint of the bucket, `https://s3.<region>.amazonaws.com/<bucket>`. */
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}
export interface StoredObject {
  text: string
  etag: string
}
export interface PutOptions {
  type?: string
  cacheControl?: string
  /** Fails with ConflictError unless the object still has this ETag. */
  ifMatch?: string
  /** Fails with ConflictError if the object exists. */
  ifNoneMatch?: '*'
}

export interface Storage {
  get(key: string): Promise<StoredObject | null>
  /** Returns the new ETag. */
  put(
    key: string,
    body: string | Uint8Array<ArrayBuffer>,
    options?: PutOptions,
  ): Promise<string>
  delete(key: string): Promise<void>
  /** Every key that starts with `prefix`, through ListObjectsV2. */
  list(prefix: string): Promise<string[]>
}

const unescapeXml = (s: string) =>
  s.replace(
    /&(lt|gt|quot|apos|amp);/g,
    (_, name: string) =>
      ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[name]!,
  )

export function createStorage({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  sessionToken,
}: Credentials): Storage {
  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    sessionToken,
    service: 's3',
    region,
  })
  const url = (key: string) =>
    `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`

  return {
    async get(key) {
      const res = await aws.fetch(url(key), { cache: 'no-store' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`GET ${key}: ${res.status}`)
      return { text: await res.text(), etag: res.headers.get('etag')! }
    },

    async put(key, body, { type, cacheControl, ifMatch, ifNoneMatch } = {}) {
      const headers: Record<string, string> = {
        'Cache-Control': cacheControl ?? 'no-cache',
      }
      if (type) headers['Content-Type'] = type
      if (ifMatch) headers['If-Match'] = ifMatch
      if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch
      const res = await aws.fetch(url(key), { method: 'PUT', body, headers })
      if (res.status === 412)
        throw new ConflictError(`${key} changed since it was read`)
      if (!res.ok) throw new Error(`PUT ${key}: ${res.status}`)
      return res.headers.get('etag')!
    },

    async delete(key) {
      const res = await aws.fetch(url(key), { method: 'DELETE' })
      if (!res.ok) throw new Error(`DELETE ${key}: ${res.status}`)
    },

    async list(prefix) {
      const keys: string[] = []
      let token: string | undefined
      do {
        const params = new URLSearchParams({ 'list-type': '2', prefix })
        if (token) params.set('continuation-token', token)
        const res = await aws.fetch(`${endpoint}/?${params}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`LIST ${prefix}: ${res.status}`)
        const xml = await res.text()
        for (const [, key] of xml.matchAll(/<Key>([^<]*)<\/Key>/g))
          keys.push(unescapeXml(key))
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? unescapeXml(xml.match(/<NextContinuationToken>([^<]*)</)![1])
          : undefined
      } while (token)
      return keys
    },
  }
}

/** Text objects keyed by path, each with the ETag its next write is conditional on. */
export interface Cache {
  /** Reads through the cache; `fresh` refetches. A missing object is cached as null. */
  get(key: string, options?: { fresh?: boolean }): Promise<StoredObject | null>
  /** The cached object, without a request. */
  peek(key: string): StoredObject | null | undefined
  put(key: string, body: string, options?: PutOptions): Promise<string>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

export function createCache(storage: Storage): Cache {
  const objects = new Map<string, StoredObject | null>()
  return {
    async get(key, { fresh = false } = {}) {
      if (fresh || !objects.has(key)) objects.set(key, await storage.get(key))
      return objects.get(key)!
    },
    peek: (key) => objects.get(key),
    async put(key, body, options) {
      const etag = await storage.put(key, body, options)
      objects.set(key, { text: body, etag })
      return etag
    },
    async delete(key) {
      await storage.delete(key)
      objects.set(key, null)
    },
    list: (prefix) => storage.list(prefix),
  }
}
