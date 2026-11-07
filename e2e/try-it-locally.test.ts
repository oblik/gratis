// The README's "Try it locally", done the way a person would: its commands in
// a terminal, and the admin in a real browser.
//
// The unit tests cover each piece on its own. This covers how they fit
// together, which is where bugs have hidden so far:
// - a redeploy failing, or replacing what editors saved, once the bucket has
//   content in it
// - a build writing into the local bucket's folder and wiping it
// - files left behind in `.gratis/` that look like real output
// - `pull` not bringing the bucket's content back into the repo
// - the preview not serving the site or the admin, or the login not working
//
// It runs on a copy of `examples/basic`, so the repo's own example, its
// content and its local bucket are never touched.

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'

const repo = fileURLToPath(new URL('..', import.meta.url))
const example = join(repo, 'examples/basic')

const pnpm = (cwd: string, ...args: string[]) =>
  promisify(execFile)('pnpm', args, { cwd })

async function freePort() {
  const server = createServer().listen(0, 'localhost')
  await once(server, 'listening')
  const { port } = server.address() as { port: number }
  server.close()
  return port
}

let site: string
let preview: ChildProcess | undefined
let browser: Browser | undefined
beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), 'gratis-e2e-'))
  // The example's sources only: what a fresh clone has, before any build.
  await cp(example, site, {
    recursive: true,
    filter: (path) =>
      !['node_modules', 'dist', '.gratis', '.astro'].includes(basename(path)),
  })
  await symlink(join(example, 'node_modules'), join(site, 'node_modules'))
})
afterAll(async () => {
  await browser?.close()
  // pnpm starts the server as a child of its own, so stop the whole group.
  if (preview?.pid) process.kill(-preview.pid)
  await rm(site, { recursive: true, force: true })
})

test('try it locally', { timeout: 120_000 }, async () => {
  const read = (path: string) => readFile(join(site, path), 'utf8')
  const title = async (path: string) => JSON.parse(await read(path)).title

  // 1. Build. Only Gratis: `pnpm build` would also build the repo's example in
  // place, and this test must not touch it.
  await pnpm(repo, '--filter', 'gratis', 'build')

  // 2. The first deploy fills the empty local bucket. The template pass's
  // scratch folder is gone after the build, so only the bucket is left.
  await pnpm(site, 'run', 'deploy')
  expect(await readdir(join(site, '.gratis'))).toStrictEqual(['bucket'])

  // 3. Preview, log in to the admin and edit the site's title, as an editor.
  const port = await freePort()
  const origin = `http://localhost:${port}`
  preview = spawn('pnpm', ['run', 'preview', '--port', String(port)], {
    cwd: site,
    detached: true,
  })
  // It prints the admin's URL once it's listening.
  for await (const chunk of preview.stdout!)
    if (String(chunk).includes('admin:')) break

  browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`${origin}/admin/`)
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('gratis-preview')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Site', exact: true }).click()
  await page.getByLabel('Title').fill('Saved by an editor')
  await page.getByRole('button', { name: 'Save' }).click()
  // The admin re-renders the pages and writes them to the bucket before it
  // says so, so the live page already has the new title.
  await page.getByText(/^Saved\./).waitFor()
  await page.goto(`${origin}/`)
  expect(await page.locator('h1').textContent()).toBe('Saved by an editor')

  // An editor's upload exists only in the bucket: no deploy can put it back
  // if one wipes the bucket, so it's the canary for that.
  // @todo Upload it through the admin once it has uploads (see TODO.md).
  const upload = await fetch(`${origin}/uploads/photo.jpg`, {
    method: 'PUT',
    body: 'jpeg',
  })
  expect(upload.ok).toBe(true)

  // 4. Pull brings the editor's title into the repo's content file.
  await pnpm(site, 'run', 'pull')
  expect(await title('src/data/site.json')).toBe('Saved by an editor')

  // 5. Change the template and the content in the repo, and deploy again,
  // with the preview still running.
  await writeFile(
    join(site, 'src/pages/index.astro'),
    (await read('src/pages/index.astro')).replace(
      '<h1>{site.title}</h1>',
      '<h1>{site.title}</h1><p>New in the template</p>',
    ),
  )
  await writeFile(
    join(site, 'src/data/site.json'),
    JSON.stringify({ title: 'Changed in the repo' }),
  )
  await pnpm(site, 'run', 'deploy')

  await page.goto(`${origin}/`)

  // Content belongs to editors once the site is live, so the page still has
  // the editor's title, not the repo's.
  expect(await page.locator('h1').textContent()).toBe('Saved by an editor')

  // Templates belong to the developer, so the new one is live.
  expect(await page.getByText('New in the template').count()).toBe(1)

  // The deploy pulled the bucket's title over the repo's before building.
  expect(await title('src/data/site.json')).toBe('Saved by an editor')

  // The bucket survived the build.
  expect(await (await fetch(`${origin}/uploads/photo.jpg`)).text()).toBe('jpeg')

  // The scratch folder is gone again.
  expect(await readdir(join(site, '.gratis'))).toStrictEqual(['bucket'])
})
