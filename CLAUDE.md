# Gratis

A CMS for tiny static sites with no servers:

- The site, the admin SPA and all content live in one S3 bucket behind Cloudflare.
- The editor's browser re-renders affected pages from DOM-marked templates and writes them back to the bucket.
- The only runtime is the browser, plus the same renderer in Node at build and deploy time.
- No application server, functions, database or identity provider, ever.

Non-goals:

- Drafts, scheduling and review workflows
- Large sites (hundreds of pages) or many people editing often
- Top-notch security: Gratis trades some for having no moving parts

## Code

A pnpm workspace:

- Commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm run deploy`
- TypeScript only, no plain JavaScript, configs and scripts included. Node runs the `.ts` files as they are, so relative imports keep their `.ts` extension.
- Tests sit next to their module as `<name>.test.ts` (Vitest). The slower end-to-end ones are in `e2e/`, and only `pnpm test:e2e` runs them.
- `packages/gratis/src/`:
  - `core/`: framework-free, runs in the browser and in Node, imports none of the folders below
    - `bucket.ts`: every kind of name
    - `template/sentinels.ts`: the template language
    - `plan.ts`: what an edit changes
    - `save.ts`: carries out a plan
  - `emulator/`: the S3 subset the admin uses, for dev, preview and tests
    - `backends.ts`: where the bytes live
    - `objects.ts`: ETags and conditional writes
    - `http.ts`: the wire format
  - `astro/`:
    - `index.ts`: what sites import from `gratis/astro`
    - `integration.ts`: the Astro integration
    - `template-mode.ts`, `build.ts`: the template pass
    - `cli.ts`: `deploy`, `pull`, `preview`
  - `admin/`: the React SPA
- `examples/basic/`: the demo site
- `scripts/`: set up and tear down AWS and Cloudflare, reading the gitignored `.env`

To try the admin without a bucket:

- `pnpm --filter example-basic dev`: no login, writes `src/data/`
- `pnpm build`, `pnpm --filter example-basic run deploy`, then `pnpm --filter example-basic preview`: `.gratis/bucket/` as the bucket, log in as `admin` / `gratis-preview`, and `pnpm --filter example-basic pull` brings the edits back

## Notes

The approach and why, by topic. Read one when the task touches it. The code is the truth.

- [overview](notes/README.md): the moving parts, the bucket layout, hosting, the admin
- [astro](notes/astro.md): adoption, the two-pass build, the emulator, deploy and pull, setup
- [content](notes/content.md): collections and field builders, content files, `routes.json` and dependencies
- [rendering](notes/rendering.md): sentinel templates, the pure renderer, the one constraint
- [editing](notes/editing.md): the save, locking and recovery
- [localization](notes/localization.md): locale maps per value, routing derived from the layout
- [auth](notes/auth.md): password-encrypted IAM keys, threat model

Notes stay high-level, with code only to illustrate.

## Comments

- Comment only what the code can't say: why, a non-obvious constraint, a short example.
- Never point to `notes/`.
