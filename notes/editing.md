# Editing

## A save

The admin loads `schema.json`, `routes.json`, and every content file (a few dozen tiny files at most), then renders the forms. When the editor saves an entry:

1. Work out the affected pages from `routes.json`:
   - Every page whose dependencies list the entry, in every locale.
   - Every page that queries the collection by a field that changed.
2. Write `routes.json` with those pages as `_pending`.
3. Write the entry file.
4. Render each affected page from its template and put the HTML.
5. Write `routes.json` again with the dependencies the renders returned and an empty pending list.

Content is written before HTML on purpose: if the tab dies in between, the content is saved and the pending list says which pages still need rendering. The next admin session sees it and finishes the job.

Creating an entry:

1. Add its file.
2. Add one page per route pattern bound to the collection.
3. Re-render every page that queries the collection.

Deleting is the reverse; the admin lists the pages that reference the entry before confirming, and those then render the reference as nothing. Fan-out is exact and accepted as overhead: a sitewide field re-renders every page, which for sites this size is a few seconds in a browser tab.

Uploads are plain puts to `/uploads/` under a unique name, so a replaced image never collides with a cached one.

## Without transactions

- Every content file is written with `If-Match` on the ETag it was read with. Two editors saving the same entry get a conflict instead of overwriting each other; editors on different entries never conflict at all. `routes.json` is the only write every save shares.
- The pending list above covers a tab that dies mid-save.
- Re-render everything: a button regenerates every page listed in `routes.json`, dependencies included. Any corruption from a renderer bug is fixed by the editor alone: revert the content change that triggered it and press the button.
- S3 versioning is on, so every overwrite is recoverable.
- Deploys pull first, never overwrite editor-owned files, and re-render pages whose dependencies changed while the build ran.

The renderer is the one piece of code that can corrupt a site. Purity, versioning and the button are what bound that risk.
