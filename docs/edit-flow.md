# Edit flow

## Saving

1. Editor opens `/admin/`, logs in (see [Authentication](auth.md)).
2. SPA fetches `schema.json`, `routes.json` and every content file (a few dozen tiny files at most), and renders the collection list and the forms. Templates are fetched when first needed.
3. Editor changes `title` on the post `hello` and saves.
4. SPA works out the affected pages from `routes.json`: every page whose dependencies list the entry, in every locale, plus every page that queries the collection by a field that changed (see [Content model](content-model.md#dependencies)).
5. SPA writes `routes.json` with a `_pending` list of the pages to render, using `If-Match` on its ETag.
6. SPA writes the entry file, or the collection file, with `If-Match` on the ETag it was read with.
7. For each affected page and locale, SPA renders the template with the content (see [Rendering](rendering.md)) and `PUT`s the HTML to the page's path.
8. SPA writes `routes.json` again with the dependencies the renders returned and an empty `_pending`.

Content is written before HTML on purpose: if the tab dies in between, the content is already saved and the pending list says which pages still need rendering.

Creating an entry is possible for any collection that isn't a single: a new entry file (or a new key in the collection file), then one page per route pattern bound to the collection and locale, then a re-render of every page that queries the collection. Deleting one is the reverse, and the admin lists the pages that reference the entry before confirming; those are re-rendered and the reference renders nothing. Changing an id is a delete plus a create. An entry with no bound pattern, like a tag, just saves and re-renders its dependents.

Fan-out is exact and accepted as overhead: a sitewide field re-renders every page, a post re-renders the post, the listings and every page that references it. Gratis is for sites where that is a few seconds of work in a browser tab.

## File uploads

Uploads are ordinary `PUT`s to `/uploads/`. Files get a content-hashed or UUID name so a replaced image never collides with a cached one. Image fields store the path.

## Consistency and recovery

There are no transactions, so the design leans on cheap guarantees:

- Optimistic locking: every content file is written with `If-Match` on the ETag it was read with. Two editors saving the same entry at once get a conflict instead of silently overwriting each other, and editors on different entries never conflict at all. For a per-collection file the SPA refetches on a conflict, reapplies the one entry it changed and retries, so a conflict is only ever on the same entry. `routes.json` is the only write every save shares.
- Pending marker: `routes.json` carries the list of pages still to render; it is written first and cleared last. If the tab dies mid-save, the next admin session sees the marker and finishes the job.
- Re-render everything: a button in the admin regenerates every page listed in `routes.json` and its dependencies with it. Any corruption caused by a renderer bug is fixed by fixing the bug and pressing the button.
- Undo: S3 bucket versioning is on, so every overwrite is recoverable. The SPA also keeps a short history of content snapshots for stores without versioning.
- Deploys pull first and re-render last: `gratis deploy` fetches the bucket's content before building and re-renders pages whose dependencies changed during the build (see [Astro integration](astro-integration.md#deploy-and-pull)). Deploys must never overwrite the content files, `/uploads/` or `/_gratis/auth/`.
