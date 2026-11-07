# TODO

Rough order. What's done is whatever the code does; see [CLAUDE.md](CLAUDE.md) for where things are.

- Stable collection order in `schema.json`: the loaders register collections in whatever order Astro runs them, so the order changes between builds and the file shows up as changed. The admin lists collections in this order, so prefer the content config's order if the build can recover it, or else sort by name.
- `file()` collections
- Uploads and `image` fields
- Lexical for rich text
- `reference` fields
- `list` (repeater) fields
- Localization handling and locale switcher
- Admin layout: `tabs`, `section`, `row`
- `sitemap.xml` as a pure function of `routes.json`, replacing `@astrojs/sitemap`
- Query wrapper type so `.filter()` and `.slice()` after `getCollection` are a type error
- Markdown entries support
- `deploy` re-renders pages whose dependencies changed in the bucket during the build
- `gratis init`

Maybe later:

- other SSGs with plain HTML output (Eleventy, Hugo; Next.js duplicates content in a hydration payload, so probably never)
- R2 and other S3-compatible stores (no versioning, no `index.html` rewriting, shared tokens)
- CloudFront (caches HTML, so a save would create invalidations with the editor's own key)
- optional hardening adapters for auth in front of `/admin/`
- localized slugs
