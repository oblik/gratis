import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { expect, test } from 'vitest'

import { emulatedStorage, memoryBackend } from '../emulator/index.ts'
import { upload } from './deploy.ts'

test('a redeploy replaces the site but keeps the content editors saved', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'gratis-deploy-'))
  const build = async (files: Record<string, string>) => {
    for (const [key, body] of Object.entries(files)) {
      await mkdir(dirname(join(dist, key)), { recursive: true })
      await writeFile(join(dist, key), body)
    }
  }
  try {
    const bucket = memoryBackend()
    const storage = emulatedStorage(bucket)
    const text = (key: string) =>
      new TextDecoder().decode(bucket.objects.get(key))

    await build({
      'index.html': 'v1',
      '_gratis/content/site.json': '{"title":"Seed"}',
      '_gratis/auth/admin.json': '{}',
    })
    expect(await upload(storage, dist)).toBe(2)
    expect(bucket.objects.has('_gratis/auth/admin.json')).toBe(false)

    bucket.objects.set(
      '_gratis/content/site.json',
      new TextEncoder().encode('{"title":"Edited"}'),
    )
    await build({
      'index.html': 'v2',
      '_gratis/content/site.json': '{"title":"Repo"}',
    })
    expect(await upload(storage, dist)).toBe(1)
    expect(text('index.html')).toBe('v2')
    expect(text('_gratis/content/site.json')).toBe('{"title":"Edited"}')
  } finally {
    await rm(dist, { recursive: true, force: true })
  }
})
