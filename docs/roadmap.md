# Roadmap

## MVP

One single with one text field. `gratis init`, deploy to S3 behind Cloudflare, log in to `/admin/`, change the field, see the change on the site. Everything else below comes after that works end to end.

## Next, in order

### Collections, references and queries

The design is agreed (see [Schema](schema.md), [Content model](content-model.md#dependencies) and [Rendering](rendering.md)); the MVP ships singles only. Then collection entries with their pages, `reference` fields, and `getCollection` queries inside `Each`, with the renderer recording dependencies per page.

### Pagination and the sitemap

- Pagination is a query behind a `paginate()` helper that wraps Astro's and records the page size and sort. The renderer computes the page count, writes `/blog/`, `/blog/2/` and so on, and deletes pages that no longer exist. Those routes are flagged as derived in `routes.json` and recomputed whenever the collection changes.
- `sitemap.xml` is a pure function of `routes.json`, with `lastmod` from the pages and `hreflang` alternates from the locales. The integration writes it at build and the SPA rewrites it on every route change with the same function, replacing `@astrojs/sitemap` for Gratis sites. A per-page `indexable` flag lives in the index.
- An id change leaves a small meta-refresh page at the old path, since there is no server to redirect.

### Build-time content check

The build already renders every page in Node to compute `routes.json`. The check compares each result's DOM to the real build's page. Any difference means the template derives something from a read, which the editor can't reproduce. It also serves as the renderer's test suite against real Astro output.

### Admin layout and translations

Locale switcher, a missing-translations view, and the `tabs`, `section` and `row` layouts from the schema, per [Localization](localization.md) and [Schema](schema.md#layout).

### Query wrapper

`getCollection` returns a plain array, so `.filter()` and `.slice()` after it compile and silently break editing. A wrapper type exposing only the query methods, with `filter` and `slice` re-added in a form the template pass can see, turns that into a type error.

### Localized slugs

`/es/sobre-nosotros` needs a catch-all dispatch route in Astro, which means restructuring the site, so it waits until a site actually needs it.

## Other static site generators

The adapter contract is: emit marked templates and a `schema.json` in a template pass, provide the getters, and provide the storage emulator for dev and preview (see [Rendering](rendering.md) and [Astro integration](astro-integration.md)). The field builders, `schema.json` and the content files are SSG-neutral; only the collection binding is Astro's. Any SSG whose output is plain HTML fits easily (Eleventy, Hugo).

Next.js is harder and should come later, if at all. Static export embeds an RSC/hydration payload in each page that duplicates the content in JSON-escaped form, and client-side navigation fetches separate payload files, so a page updated only in its HTML shows stale content on in-app navigation. A Next adapter would have to update those payloads too, or constrain projects to pages with no client navigation.

## Other S3-compatible storage

Because the SPA speaks the S3 API, swapping storage is configuration plus a provider-specific setup page. Known differences for R2: no object versioning (use the content history snapshots), no `index.html` rewriting on custom domains (needs a Cloudflare Transform Rule or `build.format: 'file'`), per-bucket API tokens instead of IAM users (editors share a token, so revocation means rotation and re-encrypting blobs). R2's advantages are free egress and native HTTPS custom domains without a separate CDN step.

## Other CDNs

CloudFront is the natural fit for S3-only users. Unlike Cloudflare, it caches HTML, so the SPA would need to create invalidations after writes. That works without any new service because editors already hold IAM keys: add `cloudfront:CreateInvalidation` on the distribution to their policy.

## Optional hardening adapters

For clients who need it: Cloudflare Access in front of `/admin/`, or a dependency-free Worker that holds the storage credential and checks sessions, kept strictly out of the serving path so that if it disappears the site stays up and only editing stops.

## Open risks

- The renderer is the one piece of code that can corrupt a site. Mitigated by purity, versioning and the re-render button; the build-time check above turns every build into a test against real Astro output.
- Markdown rendering in the browser must produce the same output as at deploy time in Node. Use one implementation for both.
- Astro's content layer API is younger than anything else Gratis depends on. The coupling is confined to `gratis/astro`; the content files, `schema.json` and the deployed site don't depend on it.
- The `[...lang]/` layout relies on a rest parameter in a non-final segment, which Astro supports but does not officially commit to. The fallback layout is documented in [Localization](localization.md).
- Scope creep. The first request for drafts or previews is the moment to say no.
