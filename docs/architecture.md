# Architecture

## Components

| Component | Role | Initial target | Later |
|---|---|---|---|
| Static site generator | Produces the site and, in a second pass, the page templates | Astro | Hugo, Eleventy |
| SSG integration | `defineCollection`, loaders, getters, template pass, schema, dev and preview storage emulator, `gratis` CLI | `gratis/astro` | one per SSG |
| Object storage | Holds the built site, templates, content, uploads and the admin SPA | AWS S3 | R2 or any S3-compatible store |
| CDN | TLS, custom domain, caching in front of the bucket | Cloudflare | CloudFront and others |
| Admin SPA | Editor UI plus the renderer, served from the bucket at `/admin/` | | |

Nothing else. No application server, no functions, no database, no identity provider. The only Gratis code that runs after deploy is the SPA in the editor's browser. The same renderer runs in Node at build and deploy time, and the integration's storage emulator runs only on the developer's machine.

## Bucket layout

```
/                       built site (public)
/uploads/               editor-uploaded files (public)
/admin/                 the Gratis SPA (public, static)
/_gratis/routes.json    index of all pages with their dependencies
/_gratis/content/       the entries, a folder or a file per collection
/_gratis/templates/     one HTML template per route pattern, from the build
/_gratis/schema.json    collections, fields, storage layout and route bindings, from the build
/_gratis/auth/          per-editor encrypted credential blobs
/_gratis/history/       snapshots of the content files (optional; S3 versioning covers this)
```

## Repo layout

A plain Astro project:

```
astro.config.mjs        with the gratis() integration
src/content.config.ts   the schema: collections, their fields, admin layout and storage
src/data/               the entries, wherever the loaders point
.gratis/                scratch output of the template build pass (gitignored)
public/uploads/         mirrors /uploads/
src/pages/              templates, ordinary Astro pages using the getters
```

See [Schema](schema.md) for the collections, [Content model](content-model.md) for the files and the index, [Rendering](rendering.md) for templates, [Astro integration](astro-integration.md) for the build and dev flow, and [Authentication](auth.md) for the auth blobs.
