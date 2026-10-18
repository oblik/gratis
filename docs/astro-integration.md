# Astro integration

Gratis attaches to an ordinary Astro project as an Astro integration. The project keeps its normal layout, `astro dev`, `astro build` and `astro preview` keep working, and the only code change is pulling editable values out of the content files with the helpers described in [Rendering](rendering.md).

## Incremental adoption

1. Start with a regular Astro project, or an existing one. `npx astro add gratis` adds the integration to `astro.config`.
2. Declare the editable fields in `gratis.config.ts`, add a `content/` directory with their values (see [Content model](content-model.md)) and replace hardcoded strings with helper calls: `<h1>{field('heading')}</h1>`.
3. In dev you see the site rendered with the content from the JSON files. The admin at `/admin/` edits those files on disk.
4. `astro build` produces the site exactly as it would without Gratis, plus the hosting layout the admin needs.
5. `gratis deploy` uploads it. From then on editors change content in the bucket and `gratis pull` brings it back into the repo.

An existing site that already uses Astro's i18n routing adopts Gratis without moving any files (see [Localization](localization.adr.md)).

## Modes

| Mode | Helpers output | Storage the admin talks to |
|---|---|---|
| `astro dev` | Real values from `content/` | Emulator writing JSON to `content/` and uploads to `public/uploads/`; page writes are ignored because Astro re-renders on its own |
| `astro build`, real pass | Real values | |
| `astro build`, template pass | Sentinels and markers | |
| `astro preview` | | Emulator over `dist/` |
| Production | | S3 through the SigV4 client |

## Dev

The integration registers a middleware with `addMiddleware`. It wraps each page render in an `AsyncLocalStorage` context holding the route pattern, pathname, locale and mode, so the helpers are plain imports with no frontmatter setup. Middleware runs for prerendered pages in both dev and build.

The admin SPA is served at `/admin/` by dev middleware and talks to the storage emulator on the same origin, with auth switched off. A `PUT` to `/about/index.json` writes `content/about/index.json`; Vite's HMR then re-renders the page. No templates are produced and nothing is rendered by the Gratis renderer in dev.

## Build

`astro build` runs the real build. In `astro:build:done` the integration:

1. Runs a second programmatic `build()` with `GRATIS_MODE=template` into a scratch directory, `.gratis/` (gitignored). In that mode the helpers emit sentinels and markers instead of values, and `pages()` returns a single placeholder path per pattern, so the pass builds exactly one HTML file per route pattern. The scratch directory also receives assets and `public/` copies the templates don't need.
2. Moves those HTML files to `dist/_gratis/templates/<template id>.html`.
3. Compiles `gratis.config.ts` to `dist/_gratis/schema.json` and fails the build if a helper call in the template pass references a field the schema doesn't declare, or with the wrong type.
4. Copies the admin SPA to `dist/admin/`.
5. Copies `content/` into `dist/` so that each page's JSON sits next to its HTML and `astro preview` is a complete local site.

The real build output is byte-identical to the same project built without Gratis. Markers exist only in the template pass. Two builds cost double the build time, which is nothing for sites this size.

## Preview and tests

`astro preview` serves `dist/` with the storage emulator mounted over it, so the full edit flow (render in the browser, `PUT` the HTML and JSON, conditional writes) can be exercised locally before touching a bucket.

The emulator is an HTTP server implementing the S3 subset the SPA uses: `GET`, `PUT`, `DELETE`, `HEAD`, ETags, `If-Match` and `ListObjectsV2` for the uploads folder. It is HTTP rather than a JavaScript storage interface on purpose: the SPA has exactly one code path, and only the endpoint and the auth differ between local and production. Tests run the same emulator in memory, with the renderer and the SPA against it, and never need a real bucket.

## Deploy and pull

`gratis deploy`:

1. Pulls `routes.json`, `site.json` and every page JSON from the bucket. Once editors have saved, the bucket is the source of truth and the repo copy is stale.
2. Runs `astro build`.
3. Uploads `dist/` except the content files, `/uploads/` and `/_gratis/auth/`, which the deploy never overwrites.
4. Re-renders any page whose JSON changed in the bucket while the build was running, using the same renderer in Node. This is a safety net for edits that land mid-deploy.

`gratis pull` copies the content files from the bucket into `content/` so the developer can commit what editors changed. Both commands are file syncs; `rclone` can do the same.
