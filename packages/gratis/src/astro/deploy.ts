import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { AUTH, CONTENT } from '../core/bucket.ts'
import { ConflictError, type Storage } from '../core/storage.ts'
import { contentType } from '../emulator/index.ts'

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

/** Returns how many files were written. */
export async function upload(storage: Storage, dist: string) {
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
          if (!(seeded && error instanceof ConflictError)) throw error
        },
      )
  }
  return uploaded
}
