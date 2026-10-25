# Overview

Gratis has four moving parts and nothing else:

- A static site generator, Astro first.
- An S3 bucket.
- A CDN in front of it, Cloudflare.
- The admin, a single-page app served from the same bucket.

No application server, no functions, no database, no identity provider. The only Gratis code that runs after deploy is the admin in the editor's browser. The same renderer runs in Node at build and deploy time, and a storage emulator stands in for the bucket on the developer's machine.

## The bucket

- `/`: built site (public)
- `/uploads/`: editor-uploaded files (public)
- `/admin/`: the Gratis SPA (public, static)
- `/_gratis/routes.json`: index of all pages with their dependencies
- `/_gratis/content/`: the entries, a folder or a file per collection
- `/_gratis/templates/`: one HTML template per route pattern, from the build
- `/_gratis/schema.json`: collections, fields, storage layout and route bindings, from the build
- `/_gratis/auth/`: per-editor encrypted credential blobs

Everything in it is public, like the pages it renders. The site is plain files; `/_gratis/` is what the admin needs to re-render them, kept out of the site's own route space.

The repo is a plain Astro project with the `gratis()` integration in its config. Entries live wherever the content loaders point, `src/data/` by convention.

## Hosting

Cloudflare proxies the bucket's website endpoint. There is no cache purging, ever:

- Cloudflare doesn't cache HTML by default, and every HTML and JSON file is uploaded with `Cache-Control: no-cache`, so an edit is visible on the next request.
- Astro's CSS and JS are content-hashed and uploads get unique names, so those cache forever.

Writes never go through the CDN, though; the admin signs requests straight to the S3 REST endpoint. And since the S3 website endpoint is HTTP-only, Cloudflare talks to it in Flexible SSL mode, which is fine for public content.

However, the admin page itself must be opened over HTTPS: WebCrypto, which both unlocking the credentials and signing requests need, exists only in secure contexts. A TLS front is a hard requirement, not an option.

## The admin

React with Tailwind, built by Vite into `dist/admin` and served as one `index.html` with hash routing.

- React is there because of Lexical, whose plugins and examples are built for it.
- A new dependency must replace something hard to build, as Lexical does for rich text, not something a thin wrapper over a native element can do. `<dialog>`, `popover`, `<details>`, and native form controls cover nearly everything a CMS form needs and bring accessibility for free.
- The renderer, the save flow, the storage client, and auth are framework-free TypeScript in `core/` that the UI imports and Node runs directly.
