# Gratis

A CMS for tiny static sites with no servers: the site, the admin SPA and all content live in one S3 bucket behind Cloudflare. The editor's browser re-renders affected pages from DOM-marked templates and writes them back to the bucket. The only runtime is the browser (plus the same renderer in Node at deploy time). No application server, functions, database or identity provider, ever.

The docs are the design; the MVP is implemented (see [roadmap.md](docs/roadmap.md#mvp) for what exists, findings and gaps). Astro is the first SSG target. A pnpm workspace: `pnpm build`, `pnpm test`, `pnpm run deploy`; setup scripts in `scripts/` read credentials from the gitignored `.env`.

## Docs

Read [README.md](README.md) for the pitch, audience and non-goals. Load the rest only when relevant to the task:

- [docs/architecture.md](docs/architecture.md): components, bucket and repo layout
- [docs/astro-integration.md](docs/astro-integration.md): adoption, dev/preview emulator, two-pass build, deploy and pull
- [docs/schema.md](docs/schema.md): collections on top of Astro's, field types, references, storage formats, mixing with plain collections
- [docs/content-model.md](docs/content-model.md): entry files, `routes.json`, per-page dependencies
- [docs/rendering.md](docs/rendering.md): getters and queries, sentinel templates, the pure `render()` function
- [docs/edit-flow.md](docs/edit-flow.md): save fan-out, uploads, optimistic locking, recovery
- [docs/localization.md](docs/localization.md): locale maps per value, layout-agnostic routing
- [docs/caching.md](docs/caching.md): Cloudflare in front of S3, no purging
- [docs/auth.md](docs/auth.md): password-encrypted IAM keys, threat model
- [docs/setup.md](docs/setup.md): `gratis init`
- [docs/roadmap.md](docs/roadmap.md): the MVP (what exists, findings, gaps), listings/sitemap design, other SSGs/storage/CDNs, open risks

A `<topic>.md` defines the chosen design only. The `<topic>.adr.md` next to it records why it beat the alternatives. Keep rationale out of the main docs and definitions out of the ADRs.
