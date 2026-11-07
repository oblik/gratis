# Gratis

A CMS for tiny static sites with no servers: the site, the admin SPA and all content live in one S3 bucket behind Cloudflare. The editor's browser re-renders affected pages from DOM-marked templates and writes them back to the bucket. The only runtime is the browser, plus the same renderer in Node at build and deploy time. No application server, functions, database or identity provider, ever.

[README.md](README.md) has the pitch, audience and non-goals. The notes in `notes/` explain the approach; the code is the truth, and [TODO.md](TODO.md) says what's missing. Read a note only when the task touches its topic.

## Where things are

A pnpm workspace: `pnpm build`, `pnpm test`, `pnpm run deploy`.

- `packages/gratis/src/`, in reading order; each file opens with what it's for, and its tests are next to it as `<name>.test.ts` (Vitest; `pnpm --filter gratis exec vitest` watches):
  1. `core/`: framework-free, runs in the browser and in Node; `astro/`, `emulator/` and `admin/` import it and it imports none of them (its tests use the emulator)
     - `bucket.ts`: every name things go by (entry key, content key, template id, page path…) and the bucket's layout
     - `schema.ts`: `schema.json`, the collections and their fields
     - `template/`: `sentinels.ts` (the template language: every sentinel and marker), `query.ts`, `render.ts` (`render()`, pure and DOM-based)
     - `routes.ts`: `routes.json` and the pure questions about it: which pages a site or an entry has, which pages an edit re-renders
     - `site.ts` (loading the site), `plan.ts` (what an edit changes, as data, pure), `save.ts` (carrying out a plan: the save flow of notes/editing.md)
     - `storage.ts` (the S3 client and the object cache), `auth.ts`
  2. `emulator/`: the S3 subset in three layers: `backends.ts` (bytes in memory or a folder), `objects.ts` (ETags and conditional writes, and `emulatedStorage` for core in process), `http.ts` (the wire format and the website endpoint); `fixtures.ts` has the built buckets tests run against
  3. `astro/`
     - what a site imports from `gratis/astro`: `fields.ts`, `collection.ts` (`defineCollection`, the loaders), `getters.ts`, `Each`, `If`
     - `template-mode.ts`: everything that differs in the template pass, in the order the pass happens
     - `repo.ts`: the repo's content files under the bucket's content keys, the one mapping between the two layouts
     - the integration (`gratis`): `integration.ts` (hooks), `build.ts` (the template pass and `_gratis/`), `dev.ts` (the emulator's backend in dev), `state.ts` (what the hooks and the loaders share)
     - the CLI (`cli.ts`): `deploy`, `pull` (`pull.ts`), `preview`
  4. `admin/`: the React SPA; `session.ts` holds the login, everything else is views
- `examples/basic/`: the demo site
- `scripts/`: setup-aws, create-editor, setup-cloudflare, teardown, e2e-edit, the prototype of `gratis init`; they read credentials from the gitignored `.env`

To try the admin without a bucket: `pnpm --filter example-basic dev` (no login, writes `src/data/`), or build and `pnpm --filter example-basic preview` (`dist/` as the bucket, `admin` / `gratis-preview`). `scripts/e2e-edit.js <origin>` runs the save flow against a live site.

## Notes

- [overview](notes/README.md): the moving parts, the bucket layout, hosting, the admin
- [astro](notes/astro.md): adoption, the two-pass build, the emulator, deploy and pull, setup
- [content](notes/content.md): collections and field builders, content files, `routes.json` and dependencies
- [rendering](notes/rendering.md): sentinel templates, the pure renderer, the one constraint
- [editing](notes/editing.md): the save, locking and recovery
- [localization](notes/localization.md): locale maps per value, routing derived from the layout
- [auth](notes/auth.md): password-encrypted IAM keys, threat model

Notes are high-level: what the approach is and why, with code only to illustrate. Implementation detail belongs in the code.
