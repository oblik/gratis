# Roadmap

The core is deliberately small. Extension points, in rough priority order:

## Other static site generators

The adapter contract is: emit DOM-marked templates and a `schema.json` at build time, and provide helpers for marking fields (see [Rendering](rendering.md)). Any SSG whose output is plain HTML fits easily (Eleventy, Hugo).

Next.js is harder and should come later, if at all. Static export embeds an RSC/hydration payload in each page that duplicates the content in JSON-escaped form, and client-side navigation fetches separate payload files, so a page updated only in its HTML shows stale content on in-app navigation. A Next adapter would have to update those payloads too, or constrain projects to pages with no client navigation.

## Other S3-compatible storage

Because the SPA speaks the S3 API, swapping storage is configuration plus a provider-specific setup page. Known differences for R2: no object versioning (use the `content.json` history snapshots), no `index.html` rewriting on custom domains (needs a Cloudflare Transform Rule or `build.format: 'file'`), per-bucket API tokens instead of IAM users (editors share a token, so revocation means rotation and re-encrypting blobs). R2's advantages are free egress and native HTTPS custom domains without a separate CDN step.

## Other CDNs

CloudFront is the natural fit for S3-only users. Unlike Cloudflare, it caches HTML, so the SPA would need to create invalidations after writes. That works without any new service because editors already hold IAM keys: add `cloudfront:CreateInvalidation` on the distribution to their policy.

## Optional hardening adapters

For clients who need it: Cloudflare Access in front of `/admin/`, or a dependency-free Worker that holds the storage credential and checks sessions, kept strictly out of the serving path so that if it disappears the site stays up and only editing stops.

## Open risks

- The renderer is the one piece of code that can corrupt a site. Mitigated by purity, versioning and the re-render button, but it needs a thorough test suite against real Astro output.
- Markdown rendering in the browser must produce the same output as at deploy time in Node. Use one implementation for both.
- Scope creep. The first request for drafts or previews is the moment to say no.
