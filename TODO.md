# TODO

Rough order. What's done is whatever the code does; see [CLAUDE.md](CLAUDE.md) for where things are.

- Uploads and `image` fields
- Lexical for rich text
- `reference` fields
- `list` (repeater) fields
- Custom order, opted into per collection (entries are in ID order otherwise): an index whose array is the order, or a fractional `sort` field on each entry
- Localization handling and locale switcher
- Admin layout: `tabs`, `section`, `row`
- `sitemap.xml` as a pure function of `routes.json`, replacing `@astrojs/sitemap`
- Query wrapper type so `.filter()` and `.slice()` after `getCollection` are a type error
- Markdown entries support
- `deploy` re-renders pages whose dependencies changed in the bucket during the build
- `gratis setup`, from the prototype scripts in `scripts/`
  - S3 and IAM calls through `aws4fetch`, not the AWS SDK: the package already depends on it (80 KB), while the SDK's S3 and IAM clients are about 23 MB
- Test the emulator against a real S3 bucket: the same tests, skipped without credentials
- Type-check the example site with `@astrojs/ts-content-mapper` and TypeScript 7 once 7.1 is stable, dropping `astro check` and its pinned TypeScript 6

Maybe later:

- other SSGs with plain HTML output (Eleventy, Hugo; Next.js duplicates content in a hydration payload, so probably never)
- R2 and other S3-compatible stores (no versioning, no `index.html` rewriting, shared tokens)
- CloudFront (caches HTML, so a save would create invalidations with the editor's own key)
- optional hardening adapters for auth in front of `/admin/`
- localized slugs
