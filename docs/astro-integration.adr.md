# An Astro integration, not a Vite plugin

The work happens in build hooks that need the route list and the output directory, in dev-server middleware, in `addMiddleware` for the per-render context, and in `astro add` for one-line adoption. A Vite plugin has access to none of that. The helpers themselves are plain functions and components and need no plugin at all.

# Two build passes, not one build with markers stripped

The served HTML must be byte-identical to the same project built without Gratis. Stripping markers from a single marked build would mean parsing and re-serializing every page, which normalizes whitespace, quoting and self-closing tags, so the output would be equivalent but not identical. Two passes cost double the build time, which is irrelevant at this size, and keep the real pass completely untouched by Gratis.

Rejected as well: helpers that emit placeholders and a renderer that fills them at build time. It forces the renderer to run on every build and makes the build output depend on Gratis code.

# An HTTP storage emulator, not a JavaScript storage interface

The SPA already speaks the S3 REST API over `fetch`. Emulating that subset over HTTP means the SPA has exactly one code path, and only the endpoint and the auth differ between a laptop and production. A storage interface with two implementations would leave the production path untested locally. The same emulator runs in memory for tests, so no test ever needs a bucket.
