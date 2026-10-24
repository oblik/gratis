# Architecture

## Components

| Component | Role | Initial target | Later |
|---|---|---|---|
| Static site generator | Produces the site and, in a second pass, the page templates | Astro | Hugo, Eleventy |
| SSG integration | `defineCollection`, loaders, getters, template pass, schema, dev and preview storage emulator, `gratis` CLI | `gratis/astro` | one per SSG |
| Object storage | Holds the built site, templates, content, uploads and the admin SPA | AWS S3 | R2 or any S3-compatible store |
| CDN | TLS, custom domain, caching in front of the bucket | Cloudflare | CloudFront and others |
| Admin SPA | Editor UI plus the renderer, served from the bucket at `/admin/` | React, Lexical, Tailwind | |

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

## Admin SPA

React and TypeScript, built with Vite into `dist/admin` and styled with Tailwind. The runtime dependencies are:

- `react` and `react-dom`
- `lexical`, with only the `@lexical/*` feature packages in use, for rich text
- `aws4fetch`, for SigV4-signed S3 requests
- `@tanstack/react-router`, for routing
- `zustand`, for form state

The build adds the React Compiler as a Babel plugin of `@vitejs/plugin-react`, so components are memoized without hand-written `memo` or `useCallback`.

Everything else is local code:

- **Components**: `src/admin/ui/` holds thin Tailwind wrappers over native elements: `<dialog>`, `popover` placed with CSS anchor positioning, `<details>`, native form controls including `<input type="date">`, and native drag and drop for reordering. Icons are inline SVG components. The one composite widget, the combobox for reference fields, is written here too.
- **Routing**: code-based TanStack Router routes on `createHashHistory()` (`/admin/#/…`), so the bucket serves only `/admin/index.html`. List filters, sort order, locale and the open tab are typed search params. `useBlocker` holds navigation while an entry has unsaved changes.
- **Data**: a cache of S3 objects keyed by path, each holding the body and its ETag. Writes go through the save flow in [Edit flow](edit-flow.md).
- **Form state**: one Zustand store per open entry, made with `createStore` and provided through context, holds the base snapshot with its ETag and the draft. Each field selects the value at its path, and updates copy only the objects along the changed path, so a keystroke re-renders only that field. A field is dirty when the draft differs from the base at its path. Validation checks the draft against `schema.json` and maps errors to paths. Lexical keeps its own editor state and writes the serialized value into the draft on blur, on a debounce and before save.
- **Core**: the renderer and the save flow are framework-free TypeScript modules that the UI imports and Node runs at build and deploy time.

A new dependency must replace something hard to build, as Lexical does, not something a component in `ui/` can do. The integration and the CLI target Node and use no runtime-specific APIs.

See [Schema](schema.md) for the collections, [Content model](content-model.md) for the files and the index, [Rendering](rendering.md) for templates, [Astro integration](astro-integration.md) for the build and dev flow, and [Authentication](auth.md) for the auth blobs.
