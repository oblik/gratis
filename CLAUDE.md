# Gratis

A CMS for tiny static sites with no servers: the site, the admin SPA and all content live in one S3 bucket behind Cloudflare. The editor's browser re-renders affected pages from DOM-marked templates and writes them back to the bucket. The only runtime is the browser, plus the same renderer in Node at build and deploy time. No application server, functions, database or identity provider, ever.

[README.md](README.md) has the pitch, audience and non-goals. The notes in `notes/` explain the approach; the code is the truth, and [TODO.md](TODO.md) says what's missing. Read a note only when the task touches its topic.

## Where things are

A pnpm workspace: `pnpm build`, `pnpm test`, `pnpm run deploy`.

- `packages/gratis/src/`
  - `astro/`
    - the integration (`gratis`): config hooks, template pass, dev middleware
    - `gratis/astro`: `defineCollection`, loaders, field builders, getters, `Each`, `If`
    - the CLI: `deploy`, `pull`, `preview`
  - `renderer/`: `render()`, pure and DOM-based, runs in the browser and in Node
  - `emulator/`: the S3 subset over HTTP, with folder, loader-files and in-memory backends
  - `admin/`: the SPA; `site.ts` (save flow), `storage.ts` (S3 client and object cache) and `auth.ts` are framework-free
- `examples/basic/`: the demo site
- `scripts/`: setup-aws, create-editor, setup-cloudflare, teardown, e2e-edit, the prototype of `gratis init`; they read credentials from the gitignored `.env`

To try the admin without a bucket: `pnpm --filter example-basic dev` (no login, writes `src/data/`), or build and `pnpm --filter example-basic preview` (`dist/` as the bucket, `admin` / `gratis-preview`). `scripts/e2e-edit.js <origin>` runs the save flow against a live site.

## Notes

- [overview](notes/overview.md): the moving parts, the bucket layout, hosting, the admin
- [astro](notes/astro.md): adoption, the two-pass build, the emulator, deploy and pull, setup
- [content](notes/content.md): collections and field builders, content files, `routes.json` and dependencies
- [rendering](notes/rendering.md): sentinel templates, the pure renderer, the one constraint
- [editing](notes/editing.md): the save, locking and recovery
- [localization](notes/localization.md): locale maps per value, routing derived from the layout
- [auth](notes/auth.md): password-encrypted IAM keys, threat model

Notes are high-level: what the approach is and why, with code only to illustrate. Implementation detail belongs in the code.
