# Edit flow

## Saving

1. Editor opens `/admin/`, logs in (see [Authentication](auth.md)).
2. SPA fetches `schema.json`, `routes.json`, `site.json` and every page JSON (a few dozen tiny files at most), and renders the form. Templates are fetched when first needed.
3. Editor changes `heading` on `/about` and saves.
4. SPA works out the affected pages. A page field affects that page in every locale it exists in; a sitewide field affects every page.
5. SPA writes `routes.json` with a `_pending` list of the pages to render, using `If-Match` on its ETag.
6. SPA writes the page JSON with `If-Match` on the ETag it was read with.
7. For each affected page and locale, SPA renders the template with the content (see [Rendering](rendering.md)) and `PUT`s the HTML to the page's path.
8. SPA clears `_pending`.

Content is written before HTML on purpose: if the tab dies in between, the content is already saved and the pending list says which pages still need rendering.

Creating a page is possible for collection templates only (a dynamic route pattern): a new entry in `routes.json`, a new page JSON, then the renders. Deleting one is a `DELETE` of the HTML and JSON plus an index update. Changing a slug is a delete plus a create.

Fan-out on sitewide fields is real overhead (a 30-page site re-renders 30 pages), and it's accepted: Gratis is for sites where that is a few seconds of work in a browser tab. Listings that show other pages' content add more fan-out and come after the MVP (see [Roadmap](roadmap.md)).

## File uploads

Uploads are ordinary `PUT`s to `/uploads/`. Files get a content-hashed or UUID name so a replaced image never collides with a cached one. Image fields store the path.

## Consistency and recovery

There are no transactions, so the design leans on cheap guarantees:

- Optimistic locking: every content file is written with `If-Match` on the ETag it was read with. Two editors saving the same page at once get a conflict instead of silently overwriting each other, and editors on different pages never conflict at all. `routes.json` is the only write every save shares.
- Pending marker: `routes.json` carries the list of pages still to render; it is written first and cleared last. If the tab dies mid-save, the next admin session sees the marker and finishes the job.
- Re-render everything: a button in the admin regenerates every page listed in `routes.json`. Any corruption caused by a renderer bug is fixed by fixing the bug and pressing the button.
- Undo: S3 bucket versioning is on, so every overwrite is recoverable. The SPA also keeps a short history of content snapshots for stores without versioning.
- Deploys pull first and re-render last: `gratis deploy` fetches the bucket's content before building and re-renders pages whose content changed during the build (see [Astro integration](astro-integration.md#deploy-and-pull)). Deploys must never overwrite the content files, `/uploads/` or `/_gratis/auth/`.
