# Gratis

A CMS for tiny static sites with no servers: the site, the admin SPA and all content live in one S3 bucket behind Cloudflare. The editor's browser re-renders affected pages from DOM-marked templates and writes them back to the bucket. The only runtime is the browser (plus the same renderer in Node at deploy time). No application server, functions, database or identity provider, ever.

Nothing is implemented yet; the docs are the design. Astro is the first SSG target.

## Docs

Read [docs/readme.md](docs/readme.md) for the pitch, audience and non-goals. Load the rest only when relevant to the task:

- [docs/architecture.md](docs/architecture.md): components, bucket and repo layout
- [docs/astro-integration.md](docs/astro-integration.md): adoption, dev/preview emulator, two-pass build, deploy and pull
- [docs/content-model.md](docs/content-model.md): `routes.json`, per-page JSON, the declared schema, field types
- [docs/rendering.md](docs/rendering.md): helpers, sentinel templates, the pure `render()` function
- [docs/edit-flow.md](docs/edit-flow.md): save fan-out, uploads, optimistic locking, recovery
- [docs/localization.md](docs/localization.md): locale maps per value, layout-agnostic routing
- [docs/caching.md](docs/caching.md): Cloudflare in front of S3, no purging
- [docs/auth.md](docs/auth.md): password-encrypted IAM keys, threat model
- [docs/setup.md](docs/setup.md): `gratis init`
- [docs/roadmap.md](docs/roadmap.md): the MVP, listings/sitemap design, other SSGs/storage/CDNs, open risks

A `<topic>.md` defines the chosen design only. The `<topic>.adr.md` next to it records why it beat the alternatives. Keep rationale out of the main docs and definitions out of the ADRs.

## Guardrails

- Keep scope small. Drafts, previews, workflows, relations, search: say no (see non-goals in the readme).
- Every dependency must plausibly last decades: S3 API, a CDN, the browser, plain files.
- The renderer must stay a pure function of the templates and the content files so the whole site can be regenerated at any time.
- The real build output must stay byte-identical to the same project without Gratis; markers live only in the template pass.
