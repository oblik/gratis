# Astro integration

Gratis attaches to an ordinary Astro project as an integration. `astro dev` and `astro build` keep working, and the only code change is declaring the editable collections with Gratis's `defineCollection` and reading them through its getters (see [content](content.md) and [rendering](rendering.md)).

## Adoption, one collection at a time

1. `npx astro add gratis`.
2. Pick a collection and make it editable:
   - Swap Astro's `defineCollection` for Gratis's, and its zod fields for Gratis field builders.
   - In the pages that read it, swap `astro:content`'s `getEntry` and `getCollection` for Gratis's.
   - Hardcoded strings become a `site` single the same way.
   - The other collections stay plain Astro collections, baked into the pages as before.
3. In dev the site renders from the content files and the admin at `/admin/` edits those files on disk.
4. `astro build` produces the site exactly as it would without Gratis, plus `/_gratis/` and the admin. `gratis preview` serves the result as if it were the bucket, with the full edit flow.
5. `gratis deploy` uploads it. From then on editors change content in the bucket, and `gratis pull` brings it back into the repo.

## Two build passes

The served HTML must be byte-identical to a build without Gratis, so the real build is left alone. After it, the integration runs a second programmatic build in template mode:

- The loaders hand out one placeholder entry per collection.
- The getters return placeholders whose reads emit sentinels and markers.
- `locales()` returns one placeholder.

Every route pattern therefore builds exactly one HTML file. From that pass the integration produces:

- One template per pattern under `/_gratis/templates/`.
- `schema.json`, compiled from the content config, with the collection each dynamic route is bound to.
- `routes.json`, by rendering every page once in Node to record its dependencies.

Stripping markers out of a single marked build was rejected: it means re-serializing every page, which gives equivalent but not identical output. Two passes cost double the build time, which is nothing at this size.

## The emulator

Locally the admin talks to a small HTTP server that implements the S3 subset the admin uses: get, put, delete, head, ETags, conditional writes and listing a folder.

- In `astro dev` it writes entries straight to the loaders' files and Astro re-renders. Auth is switched off.
- For `gratis preview` and the tests, it serves `dist/`, or a map in memory, and answers like the bucket's website endpoint.

It's HTTP rather than a JavaScript storage interface on purpose: the admin has exactly one code path, and only the endpoint and the credentials differ between a laptop and production. A storage interface with two implementations would leave the production path untested locally. It's a command of Gratis's own rather than `astro preview` because `astro preview` gives integrations no hook and drops the project's Vite plugins.

## Deploy and pull

Once editors have saved, the bucket is the source of truth and the repo copy is stale. So `gratis deploy`:

1. Pulls the content from the bucket into the repo.
2. Builds.
3. Uploads `dist/`, except the files editors own: the content, `/uploads/`, and `/_gratis/auth/`. Those are seeded on the first deploy with a conditional write and never replaced after.

`gratis pull` alone does step 1, so the developer can commit what editors changed. Both are file syncs with the one mapping from `schema.json`; `rclone` could do the same.

## Setup

`gratis init` is meant to do, or print exact instructions for:

1. The bucket, with website hosting, versioning, CORS and a public-read policy.
2. The IAM users and keys (see [auth](auth.md)).
3. The first deploy.
4. A proxied Cloudflare DNS record with Flexible SSL.

The scripts in `scripts/` are its prototype. If setup is an hour of console clicking, nobody reaches the "no maintenance forever" part.
