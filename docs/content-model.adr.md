# Split files, not a single `content.json`

One file for everything was the first design. Per-page files win on four counts: optimistic locking becomes per file, so editors on different pages never conflict; files stay small however many pages and locales exist; the content sits next to the HTML it renders, in the bucket and in the repo; and `pull`, `deploy` and `rclone` become plain file syncs. The cost is one index file, `routes.json`, which every save shares and which carries the recovery marker.

# A declared schema, not one inferred from helper calls

An earlier draft generated the schema from the helper calls recorded in the template pass. It fails in three ways: a JSON string cannot tell a text field from markdown or a select with options; two helper calls for the same field could disagree on type or `localized`; and the admin form needs a layout (tabs, sections, rows) that no helper call can express. So the developer declares the schema in `gratis.config.ts`, the build compiles it to `schema.json`, and the template pass validates the helper calls against it instead of defining it.
