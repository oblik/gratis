# Edit flow

## Saving

1. Editor opens `/admin/`, logs in (see [Authentication](auth.md)).
2. SPA fetches `schema.json` and `content.json` and renders the form.
3. Editor changes `heading` on the home page and saves.
4. SPA consults the dependency graph: which pages use the changed fields? A page field affects one page; a sitewide field (navbar, footer) affects every page.
5. For each affected page, SPA fetches its template, renders it with the new content (see [Rendering](rendering.md)), and `PUT`s the resulting HTML to the page's path.
6. SPA writes `content.json` back with a conditional write.

Creating a page is the same flow with a new entry in `content.json`; deleting one is a `DELETE` plus a `content.json` update.

Fan-out on sitewide fields is real overhead (a 30-page site re-renders 30 pages), and it's accepted: Gratis is for sites where that is a few seconds of work in a browser tab.

## File uploads

Uploads are ordinary `PUT`s to `/uploads/`. Files get a content-hashed or UUID name so a replaced image never collides with a cached one. Image fields store the path.

## Consistency and recovery

There are no transactions, so the design leans on cheap guarantees:

- Optimistic locking: `content.json` is written with `If-Match` on the ETag it was read with. Two editors saving at once get a conflict instead of silently overwriting each other.
- Pending marker: before fanning out, the SPA writes `content.json` with a `_pending` list of pages still to render; it clears the list last. If the tab dies mid-save, the next admin session sees the marker and finishes the job.
- Re-render everything: a button in the admin regenerates every page from `content.json`. Any corruption caused by a renderer bug is fixed by fixing the bug and pressing the button.
- Undo: S3 bucket versioning is on, so every overwrite is recoverable. The SPA also keeps a short history of `content.json` snapshots for stores without versioning.
- Deploys re-render: when the developer deploys new templates, the deploy step runs the same renderer in Node against the live `content.json`, so content is never lost or stale after a template change. Deploys must never overwrite `content.json`, `/uploads/` or `/_gratis/auth/`.
