# Split files, not a single `content.json`

One file for everything was the first design. Per-entry files win on three counts: optimistic locking becomes per entry, so editors on different entries never conflict; files stay small however many entries and locales exist; and `pull`, `deploy` and `rclone` become plain file syncs. The cost is one index file, `routes.json`, which every save shares and which carries the recovery marker. A per-collection file is allowed where the developer wants it, with the locking cost stated (see [Schema](schema.adr.md)).

# Content by collection, not next to the page

The previous layout put each page's JSON beside its HTML. Once content is per entry, an entry may have no page (a tag), one page, or several (a post also listed on the home page), so there is no single HTML file to sit next to. Content lives under `/_gratis/content/` in the layout the loaders declare, and `routes.json` moves beside it, which also keeps Gratis's files out of the site's route space.

The admin finds a collection's entries by listing its folder rather than from an index. `routes.json` can't serve: it knows only entries that have a page, and a tag has none. A separate entry index would be one more file every create and delete writes under a lock, and one more thing that can disagree with the folder it describes. The listing is a single request for a folder of a few dozen keys, and the editor's key already needs `ListBucket` for uploads.

# Dependencies recorded by the renderer, not declared

The template pass renders one placeholder per collection and can't know which entries a page will reach; the renderer, filling a concrete route, can. Recording them per page in `routes.json` makes the fan-out exact, lets "re-render everything" rebuild them from scratch, and costs nothing the save wasn't doing already.
