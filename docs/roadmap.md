# Roadmap

## MVP

One page with one text field. `gratis init`, deploy to S3 behind Cloudflare, log in to `/admin/`, change the field, see the change on the site. Everything else below comes after that works end to end.

## Next, in order

### Listings, pagination and the sitemap

The design is agreed; only the MVP comes first.

- A listing page uses a query inside `Each`: `collection('/blog/[slug]', { sort: '-date', limit: 3 })`. In template mode the `each` marker carries the query, so the renderer evaluates it against the page files.
- Pagination is the same query behind a `listing()` `getStaticPaths` helper that wraps Astro's `paginate` and records the page size and sort. The renderer computes the page count, writes `/blog/`, `/blog/2/` and so on, and deletes pages that no longer exist. Those routes are flagged as derived in `routes.json` and recomputed whenever the collection changes.
- The dependency graph needs no declaration: a template depends on a collection if it queries it. Changing a post's title re-renders the post plus every page whose template queries that collection. Publishing a post re-renders all listing pages, which is accepted overhead at this scale.
- `sitemap.xml` is a pure function of `routes.json`, with `lastmod` from the page files and `hreflang` alternates from the locales. The integration writes it at build and the SPA rewrites it on every route change with the same function, replacing `@astrojs/sitemap` for Gratis sites. A per-page `indexable` flag lives in the index.
- A slug change leaves a small meta-refresh page at the old path, since there is no server to redirect.

### Build-time content check

Render every template with the current content in Node and compare the DOM to the real build's page. Any difference means the template derives something from a value, which the editor can't reproduce. The check also serves as the renderer's test suite against real Astro output.

### Admin layout and translations

Locale switcher, a missing-translations view, and the `tabs`, `section` and `row` layouts from the schema, per [Localization](localization.md) and [Content model](content-model.md#schema).

### Localized slugs

`/es/sobre-nosotros` needs a catch-all dispatch route in Astro, which means restructuring the site, so it waits until a site actually needs it.

## Other static site generators

The adapter contract is: emit marked templates and a `schema.json` in a template pass, provide the helpers, and provide the storage emulator for dev and preview (see [Rendering](rendering.md) and [Astro integration](astro-integration.md)). Any SSG whose output is plain HTML fits easily (Eleventy, Hugo).

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
- The `[...lang]/` layout relies on a rest parameter in a non-final segment, which Astro supports but does not officially commit to. The fallback layout is documented in [Localization](localization.md).
- Scope creep. The first request for drafts or previews is the moment to say no.
