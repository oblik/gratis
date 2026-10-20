# Gratis CMS

A content editor for static sites that runs with no servers, no build pipeline, and no third-party CMS.

## Idea origin

1. Suppose you have a simple single-page static site
2. The site owner wants to change the heading in the header
3. This essentially amounts to simply changing the text inside the HTML, nothing more

Gratis does exactly that. The user's browser directly modifies the hosted HTML file.

It can't get any simpler than that. No need for servers or redeployment processes. Just update the fucking HTML file.

## What it is

The site is plain files in an S3 bucket, served through Cloudflare. The admin is a single-page app that lives in the same bucket. When an editor changes something, their browser re-renders the affected pages and writes them straight back to the bucket.

The browser does the job a build server or an application server would normally do. Hardware in modern laptops is fast, browsers are powerful, and web standards are stable and backwards-compatible, so there's no actual _need_ for a server.

Gratis is incrementally adoptable: it attaches to an ordinary Astro project as an integration and can be added to one [content collection](https://docs.astro.build/en/guides/content-collections/) at a time. The built site is byte-identical to one built without Gratis.

### Why "Gratis"

"Gratis" means "free", and the admin is free in two ways:

- **Free to adopt.** An existing Astro site gets an admin with hardly any effort: no migration, no new hosting, no rewrite.
- **Free to run.** An S3 bucket and a free CDN cost almost nothing, yet scale to infinity page views per second. You get the reliability and affordability of a static site, with many of the benefits of a dynamic one. A dynamic static site.

## Who it's for

Gratis is for the long tail of tiny sites that a developer builds once and then wants to **stop thinking about**: the coffee shop down the street, a personal blog, a one-page portfolio, a club or a small practice. The site owner needs to change a heading, update opening hours, swap a photo or add a menu item without calling the developer.

Explicit non-goals:

- Drafts, scheduling, complex content review workflows
- Large sites (hundreds of pages) or high-frequency editing by many people
- "Top-notch" security. Gratis accepts a modest security compromise in exchange for having no moving parts. See [Authentication](auth.md).

The day a site needs any of the above, the honest answer is "use a real CMS", and Gratis should make that easy rather than tempting you to bolt features on.

## Why use it

Every existing option for giving a non-technical person an editor on a static site depends on something that rots:

- Git-based CMSs (Decap, Sveltia, Pages CMS) commit content and then rely on a build pipeline. GitHub Actions break on dependency bumps; Node versions go out of support.
- Serverless functions need runtime upgrades every couple of years.
- Hosted CMSs raise prices, get acquired or shut down.
- A classic CMS on a VPS needs patching forever.

Gratis's bet is different: depend only on things that already have, or can reasonably be expected to have, a **multi-decade lifespan**.

- Object storage behind the S3 API. S3 itself has twenty years of unchanged API, and the S3 API is now a de facto standard (R2, Backblaze, Tigris, MinIO).
- A CDN for TLS and caching. Cloudflare's affordability and robustness are proven and pretty much unbeatable.
- The browser, which is the most backwards-compatible runtime that exists.
- Plain HTML, CSS, JS and JSON files.

A Gratis site has no scheduled maintenance. If nobody touches it for ten years, it keeps serving and it keeps being editable. The only code that can break is Gratis's own renderer, and that risk is bounded by design (see [Consistency and recovery](edit-flow.md#consistency-and-recovery)).

---

See [CLAUDE.md](CLAUDE.md) for the docs overview.
