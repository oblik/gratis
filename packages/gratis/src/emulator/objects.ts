import { createHash } from 'node:crypto'

import {
  ConflictError,
  type PutOptions,
  type Storage,
} from '../core/storage.ts'
import type { Backend } from './backends.ts'

export interface StoredBytes {
  body: Uint8Array
  etag: string
}

export interface Objects {
  get(key: string): Promise<StoredBytes | null>
  /**
   * Returns the new ETag. Throws ConflictError if a condition fails, and writes
   * nothing.
   */
  put(
    key: string,
    body: Uint8Array,
    conditions?: Pick<PutOptions, 'ifMatch' | 'ifNoneMatch'>,
  ): Promise<string>
  delete(key: string): Promise<void>
  /** Every key that starts with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>
}

/**
 * An object's ETag as S3 gives it for a single-part upload: the quoted MD5 of
 * its bytes.
 */
export const etagOf = (body: Uint8Array) =>
  `"${createHash('md5').update(body).digest('hex')}"`

export function createObjects(backend: Backend): Objects {
  return {
    async get(key) {
      const body = await backend.read(key)
      return body && { body, etag: etagOf(body) }
    },
    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      if (ifMatch || ifNoneMatch) {
        const current = await backend.read(key)
        if (ifMatch && (!current || etagOf(current) !== ifMatch))
          throw new ConflictError(`${key} changed since it was read`)
        if (ifNoneMatch === '*' && current)
          throw new ConflictError(`${key} already exists`)
      }
      await backend.write(key, body)
      return etagOf(body)
    },
    delete: (key) => backend.remove(key),
    list: (prefix) => backend.list(prefix),
  }
}

/** What the S3 client does, in process. */
export function emulatedStorage(backend: Backend): Storage {
  const objects = createObjects(backend)
  const bytes = (body: string | Uint8Array) =>
    typeof body === 'string' ? new TextEncoder().encode(body) : body
  return {
    async get(key) {
      const object = await objects.get(key)
      return (
        object && {
          text: new TextDecoder().decode(object.body),
          etag: object.etag,
        }
      )
    },
    put: (key, body, { ifMatch, ifNoneMatch } = {}) =>
      objects.put(key, bytes(body), { ifMatch, ifNoneMatch }),
    delete: (key) => objects.delete(key),
    list: (prefix) => objects.list(prefix),
  }
}
