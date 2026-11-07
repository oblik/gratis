// A collection's folder is mirrored: entries deleted in the bucket are deleted
// in the repo too, or the next deploy would seed them again. A single missing
// from the bucket is left alone.

import {
  collectionFolder,
  contentKey,
  entryIds,
  entryKey,
  SCHEMA,
} from '../core/bucket.ts'
import type { Schema } from '../core/schema.ts'
import type { Storage } from '../core/storage.ts'
import { repoContent } from './repo.ts'

export async function pull(
  storage: Storage,
  root: URL,
  log: (message: string) => void = console.log,
) {
  const schema = await storage.get(SCHEMA)
  if (!schema) return log('nothing to pull: the bucket has no schema.json yet')
  const { collections } = JSON.parse(schema.text) as Schema
  const repo = repoContent(root, () => collections)
  const copy = async (key: string) => {
    const file = await storage.get(key)
    if (file) await repo.write(key, new TextEncoder().encode(file.text))
    return file != null
  }

  for (const [name, collection] of Object.entries(collections)) {
    if (collection.single) {
      if (await copy(contentKey(name)))
        log(`pulled ${name} -> ${collection.source}`)
      continue
    }
    const folder = collectionFolder(name)
    const keys = entryIds(folder, await storage.list(folder)).map((id) =>
      contentKey(entryKey(name, id)),
    )
    for (const key of keys) await copy(key)
    for (const key of await repo.list(folder))
      if (!keys.includes(key)) await repo.remove(key)
    log(`pulled ${name} (${keys.length} entries) -> ${collection.source}`)
  }
}
