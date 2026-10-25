# TODO

Rough order. What's done is whatever the code does; see [CLAUDE.md](CLAUDE.md) for where things are.

- `deploy` re-renders pages whose dependencies changed in the bucket during the build
- `reference` and `list` fields, `file()` collections, Markdown entries, `getEntry` on collection entries rather than singles only
- Async-context middleware for the route, locale and mode, so a query placeholder read outside an `Each` isn't taken for the page's own entry; validate every read against the schema in the template pass
- Build-time check: compare each Node-rendered page's DOM to the real build's, and keep it as the renderer's test suite against real Astro output (the warning exists)
- Uploads and `image` fields
- Lexical for rich text
- Locales in the admin: switcher, missing-translations view
- Admin layout: `tabs`, `section`, `row`
- Pagination: a `paginate()` wrapper that records page size and sort, with derived routes recomputed when the collection changes; `sitemap.xml` as a pure function of `routes.json`, replacing `@astrojs/sitemap`; a meta-refresh page at an id's old path
- Query wrapper type so `.filter()` and `.slice()` after `getCollection` are a type error
- `gratis init`, from the scripts in `scripts/`; `npx astro add gratis` is untested; `deploy` assumes `outDir` is `dist`
- Publishing: Node won't strip types under `node_modules`, so the package needs compiled JS or a bundled integration

Maybe later:

- other SSGs with plain HTML output (Eleventy, Hugo; Next.js duplicates content in a hydration payload, so probably never)
- R2 and other S3-compatible stores (no versioning, no `index.html` rewriting, shared tokens)
- CloudFront (caches HTML, so a save would create invalidations with the editor's own key)
- optional hardening adapters for auth in front of `/admin/`
- localized slugs.
