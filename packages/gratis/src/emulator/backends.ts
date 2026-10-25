// Where the emulator keeps objects: a key-value store with no S3 or HTTP in it.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

export interface Backend {
  read(key: string): Promise<Uint8Array | null>
  write(key: string, body: Uint8Array): Promise<void>
  remove(key: string): Promise<void>
  /** Every key that starts with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>
}

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
