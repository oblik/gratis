// The SPA's one storage client: the S3 REST API signed with the editor's key. Locally the same
// requests will go to the emulator; only the endpoint and the auth differ.

import { AwsClient } from 'aws4fetch';

export class ConflictError extends Error {}

export function createStorage({ endpoint, region, accessKeyId, secretAccessKey }) {
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region });
  const url = (key) => `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    /** @returns {Promise<{ text: string, etag: string } | null>} */
    async get(key) {
      const res = await aws.fetch(url(key), { cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GET ${key}: ${res.status}`);
      return { text: await res.text(), etag: res.headers.get('etag') };
    },

    /** Writes with If-Match when given, so a stale ETag fails instead of overwriting. Returns the new ETag. */
    async put(key, body, { type, ifMatch } = {}) {
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
      if (ifMatch) headers['If-Match'] = ifMatch;
      const res = await aws.fetch(url(key), { method: 'PUT', body, headers });
      if (res.status === 412) throw new ConflictError(`${key} changed since it was read`);
      if (!res.ok) throw new Error(`PUT ${key}: ${res.status}`);
      return res.headers.get('etag');
    },
  };
}
