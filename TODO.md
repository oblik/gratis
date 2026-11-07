# TODO

Rough order. What's done is whatever the code does; see [CLAUDE.md](CLAUDE.md) for where things are.

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
