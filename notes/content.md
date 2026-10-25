# Content

## Collections

The schema is the set of collections the admin can edit. A collection is an Astro content collection declared with Gratis's `defineCollection`, which adds what a form needs:

- Field types, with labels.
- Whether a field is localized.
- How the form is laid out.
- Where the entries are stored.

It's editable whether or not any page renders it: tags without a tag page, or a `site` single that only feeds the navbar, are ordinary collections.

```ts
import {
  defineCollection,
  file,
  glob,
  markdown,
  reference,
  text,
} from 'gratis/astro'

const site = defineCollection({
  single: true,
  loader: file('src/data/site.json'),
  schema: { title: text() },
})

const posts = defineCollection({
  loader: glob({ pattern: '*.json', base: 'src/data/posts' }),
  schema: {
    title: text(),
    body: markdown(),
    tags: reference('tags', { multiple: true }),
  },
})
```

Fields are declared with Gratis builder functions rather than zod because an arbitrary zod schema (unions, transforms) can't be turned into a form and carries no label or layout. `defineCollection` derives the zod schema from them, so `astro check` and Astro's generated types keep working, and the build compiles them to `schema.json` for the admin. The vocabulary is deliberately small:

- Fields: text, markdown, image, link, boolean, select, reference, and a one-level list.
  - A reference stores the ID of another entry and the admin shows a picker over that collection.
- Layout: tabs, sections, rows.

A collection declared with Astro's own `defineCollection` is ignored by Gratis, so a site adopts Gratis one collection at a time. The one rule is that a Gratis collection is read only through Gratis's getters; a read through `astro:content` shows up in the template pass as a sentinel with no scope and fails the build naming the page.

## Files

Entries are small files mirrored between the repo and the bucket, in whatever shape the loader reads them:

- One JSON file per entry.
- One JSON file per collection, keyed by ID.
- One Markdown file per entry, with the fields in frontmatter and `body` as the body.

Gratis ships its own `glob` and `file` loaders because it has to know where entries live in order to write them back, and Astro's don't expose their options. However, nothing on disk is Gratis-specific.

- `src/data/site.json` -> `/_gratis/content/site.json`
- `src/data/posts/hello.json` -> `/_gratis/content/posts/hello.json`
- `src/data/tags.json` -> `/_gratis/content/tags.json`

An entry file holds that entry's fields and nothing else; a localized field holds a locale map instead of a value (see [localization](localization.md)). IDs are what the loader gives them and double as route params, so they're slugs. Changing one is a delete plus a create.

Why many small files rather than one `content.json`:

- Optimistic locking becomes per entry, so editors on different entries never conflict.
- Files stay small however many entries and locales there are.
- Pull and deploy become plain file syncs.

The cost is one shared index, below.

A per-collection file is allowed where the developer wants it, with the stated cost that two editors saving different entries of it will conflict and one has to retry. The admin finds a collection's entries by listing its folder, so there is no entry index to keep in sync.

Markdown is rendered by Gratis's own implementation in every mode, never by Astro's remark pipeline, because the editor's browser has to produce the same HTML as the build. MDX is out.

## `routes.json`

The one index. It lists every page with its template, the object key it's written to, the entry it belongs to, and what the renderer has read while producing it:

```json
"/blog/hello": {
  "template": "/blog/[slug]",
  "file": "blog/hello/index.html",
  "entry": "posts/hello",
  "deps": {
    "entries": ["posts/hello", "site", "tags/astro"],
    "collections": { "posts": ["date"] }
  }
}
```

- `entries`: every entry whose fields appear on the page, through references and queries included. A change to any of them re-renders the page.
- `collections`: every collection the page queried, with the fields the query sorts or filters by. Creating or deleting an entry there, or changing one of those fields on any entry, re-renders it too.

Nothing is declared by hand: the build computes the dependencies by rendering every page in Node, and the admin recomputes them each time it renders one. That's what makes the fan-out on save exact and lets "re-render everything" rebuild the index from scratch.

The index is the only thing that knows which pages exist. The sitemap, the admin's page list and re-render-everything read it and nothing else. It also carries the i18n settings once there's more than one locale, and a pending list used for recovery (see [editing](editing.md)).
