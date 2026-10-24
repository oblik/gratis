// The SPA's one storage client: the S3 REST API signed with the editor's key. Locally the same
// requests will go to the emulator; only the endpoint and the auth differ.

import { AwsClient } from 'aws4fetch';

export class ConflictError extends Error {}

export interface Session { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string }
export interface StoredObject { text: string; etag: string }
export interface PutOptions { type?: string; ifMatch?: string }

export interface Storage {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, body: string, options?: PutOptions): Promise<string>;
}

export function createStorage({ endpoint, region, accessKeyId, secretAccessKey }: Session): Storage {
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region });
  const url = (key: string) => `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    async get(key) {
      const res = await aws.fetch(url(key), { cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GET ${key}: ${res.status}`);
      return { text: await res.text(), etag: res.headers.get('etag')! };
    },

    /** Writes with If-Match when given, so a stale ETag fails instead of overwriting. Returns the new ETag. */
    async put(key, body, { type, ifMatch } = {}) {
      const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
      if (type) headers['Content-Type'] = type;
      if (ifMatch) headers['If-Match'] = ifMatch;
      const res = await aws.fetch(url(key), { method: 'PUT', body, headers });
      if (res.status === 412) throw new ConflictError(`${key} changed since it was read`);
      if (!res.ok) throw new Error(`PUT ${key}: ${res.status}`);
      return res.headers.get('etag')!;
    },
  };
}

export interface Cache extends Storage {
  /** Reads through the cache; `fresh` refetches. A missing object is cached as null. */
  get(key: string, options?: { fresh?: boolean }): Promise<StoredObject | null>;
  /** The cached object, without a request. */
  peek(key: string): StoredObject | null | undefined;
}

/** S3 objects keyed by path, each with its body and ETag. A write replaces the cached object. */
export function createCache(storage: Storage): Cache {
  const objects = new Map<string, StoredObject | null>();
  return {
    async get(key, { fresh = false } = {}) {
      if (fresh || !objects.has(key)) objects.set(key, await storage.get(key));
      return objects.get(key)!;
    },
    peek: (key) => objects.get(key),
    async put(key, body, options) {
      const etag = await storage.put(key, body, options);
      objects.set(key, { text: body, etag });
      return etag;
    },
  };
}
