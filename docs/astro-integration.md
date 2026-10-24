# Astro integration

Gratis attaches to an ordinary Astro project as an Astro integration. The project keeps its normal layout, `astro dev`, `astro build` and `astro preview` keep working, and the only code change is declaring the editable collections with Gratis's `defineCollection` and reading them through its getters, as described in [Schema](schema.md) and [Rendering](rendering.md).

## Incremental adoption

1. Start with a regular Astro project, or an existing one. `npx astro add gratis` adds the integration to `astro.config`.
2. Pick a collection to make editable. In `src/content.config.ts` swap Astro's `defineCollection` for Gratis's and its zod fields for Gratis field builders; put the entries where its loader points, `src/data/` by convention (see [Content model](content-model.md)); in the pages that read it, swap `astro:content`'s `getEntry` and `getCollection` for Gratis's. Hardcoded strings become a `site` single the same way. One collection at a time; the rest stay plain Astro collections.
3. In dev you see the site rendered with the content from the files. The admin at `/admin/` edits those files on disk.
4. `astro build` produces the site exactly as it would without Gratis, plus the hosting layout the admin needs. `gratis preview` serves it as if it were the bucket, with the admin's full edit flow.
5. `gratis deploy` uploads it. From then on editors change content in the bucket and `gratis pull` brings it back into the repo.

An existing site that already uses Astro's i18n routing adopts Gratis without moving any files (see [Localization](localization.adr.md)).

## Modes

| Mode | Getters return | Storage the admin talks to |
|---|---|---|
| `astro dev` | Real values from the content files | Emulator writing entries to the loaders' files and uploads to `public/uploads/`; page writes are ignored because Astro re-renders on its own |
| `astro build`, real pass | Real values | |
| `astro build`, template pass | Placeholders that emit sentinels and markers | |
| `gratis preview` | | Emulator over `dist/` |
| Production | | S3 through the SigV4 client |

## Dev

The integration registers a middleware with `addMiddleware`. It wraps each page render in an `AsyncLocalStorage` context holding the route pattern, locale and mode, so the getters are plain imports with no frontmatter setup. Middleware runs for prerendered pages in both dev and build. In `astro:config:done` the integration injects the `Collections` types generated from the content config (see [Schema](schema.md#mixing-with-plain-astro-collections)), so `astro sync` refreshes them like Astro's own.

The admin SPA is served at `/admin/` by dev middleware and talks to the storage emulator on the same origin, with auth switched off: the served `index.html` carries `<meta name="gratis-storage" content="local">`, and the admin then signs with dummy keys against its own origin instead of showing the login. The emulator compiles `schema.json` from the content config on each read and keeps a `routes.json` with no pages, so a save writes only the entry. A `PUT` to `/_gratis/content/posts/hello.json` writes `src/data/posts/hello.json`, following the mapping in `schema.json`; the loader watches its files, as Astro's `file()` does, and Astro re-renders. No templates are produced and nothing is rendered by the Gratis renderer in dev.

## Build

`astro build` runs the real build. In `astro:build:done` the integration:

1. Runs a second programmatic `build()` with `GRATIS_MODE=template` into a scratch directory, `.gratis/` (gitignored). In that mode `defineCollection` hands Astro a lenient schema, the loaders store one placeholder entry per collection, the getters return placeholders that emit sentinels and markers, and `locales()` returns one placeholder, so the pass builds exactly one HTML file per route pattern. The scratch directory also receives assets and `public/` copies the templates don't need.
2. Moves those HTML files to `dist/_gratis/templates/<template id>.html`.
3. Compiles the content config to `dist/_gratis/schema.json`, with the route bindings observed in step 1, and fails the build if a read in the template pass references a field the schema doesn't declare, with the wrong type, or without a scope.
4. Renders every page with the Node renderer to write `dist/_gratis/routes.json` with each page's dependencies (see [Content model](content-model.md#dependencies)).
5. Copies the admin SPA to `dist/admin/`.
6. Copies the content files to `dist/_gratis/content/` in the bucket layout so that `astro preview` is a complete local site.

The real build output is byte-identical to the same project built without Gratis. Markers exist only in the template pass. Two builds cost double the build time, which is nothing for sites this size.

## Preview and tests

`gratis preview` serves `dist/` with the storage emulator mounted over it on `http://localhost:4321`, so the full edit flow (log in, render in the browser, `PUT` the HTML and the entries, conditional writes, recovery) can be exercised locally before touching a bucket. Reads behave like the S3 website endpoint: `/dir/` serves `index.html`, `/dir` redirects, a missing key serves `404.html`. The login is `admin` with the password in `GRATIS_PREVIEW_PASSWORD` (default `gratis-preview`), a blob made at startup for keys the emulator doesn't check. Saves write into `dist/`, so the next build starts over from the repo's content.

The emulator is an HTTP handler implementing the S3 subset the SPA uses: `GET`, `PUT`, `DELETE`, `HEAD`, ETags, `If-Match`, `If-None-Match: *` and `ListObjectsV2` for the collection and uploads folders. Request signatures are not checked. It stores objects through a backend: a folder for preview, the content files for dev, a map in memory for tests. It is HTTP rather than a JavaScript storage interface on purpose: the SPA has exactly one code path, and only the endpoint and the auth differ between local and production. Tests run the same emulator in memory, with the renderer and the SPA against it, and never need a real bucket.

## Deploy and pull

`gratis deploy`:

1. Pulls `/_gratis/content/` and `routes.json` from the bucket into the loaders' files. Once editors have saved, the bucket is the source of truth and the repo copy is stale.
2. Runs `astro build`.
3. Uploads `dist/` except `/_gratis/content/`, `/uploads/` and `/_gratis/auth/`, which the deploy never overwrites.
4. Re-renders any page whose dependencies changed in the bucket while the build was running, using the same renderer in Node. This is a safety net for edits that land mid-deploy.

`gratis pull` copies the content files from the bucket into the loaders' files so the developer can commit what editors changed. Both commands are file syncs with the one mapping from `schema.json`; `rclone` can do the same.
