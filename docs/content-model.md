# Content model

Content is a set of small files, one per entry or one per collection as the loaders declare (see [Schema](schema.md#storage)), mirrored between the repo and the bucket:

```
Repo                          Bucket
src/data/site.json            /_gratis/content/site.json          the `site` single
src/data/home.json            /_gratis/content/home.json          the `home` single
src/data/posts/hello.json     /_gratis/content/posts/hello.json   entry `hello` of `posts`
src/data/tags.json            /_gratis/content/tags.json          every `tags` entry
                              /_gratis/routes.json                index of every page
```

In the repo the files sit wherever the loaders point. In the bucket a per-entry collection is a folder named after it and a per-collection file is `<collection>.json` (or `.md` for Markdown entries); `schema.json` records the mapping so the admin, `deploy` and `pull` agree. All of it is public, like the pages it renders.

## Entry files

An entry file holds that entry's fields and nothing else:

```json
{
  "title": "Hello!",
  "date": "2026-10-18",
  "body": "Welcome to my site.",
  "tags": ["astro", "cms"]
}
```

A reference holds the id of the referenced entry. A single's file has the same shape. A per-collection file holds a map from id to entry. A Markdown entry holds the fields in frontmatter and `body` as the file body. Localized fields hold a locale map instead of a value; see [Localization](localization.md#content).

Entry ids are what the loader gives them: the path without extension for `glob`, the key for `file`. They double as route params (see [Rendering](rendering.md#template-id)), so they are slugs. Changing one is a delete plus a create.

## `routes.json`

```json
{
  "pages": {
    "/": {
      "template": "/",
      "deps": { "entries": ["home", "site", "posts/hello", "posts/world"], "collections": { "posts": ["date"] } },
      "updated": "2026-10-18T10:00:00Z"
    },
    "/blog/hello": {
      "template": "/blog/[slug]",
      "entry": "posts/hello",
      "deps": { "entries": ["posts/hello", "site", "tags/astro", "tags/cms"], "collections": {} },
      "updated": "2026-10-18T10:00:00Z"
    },
    "/tags/astro": {
      "template": "/tags/[tag]",
      "entry": "tags/astro",
      "deps": { "entries": ["tags/astro", "site", "posts/hello"], "collections": { "posts": ["tags"] } },
      "updated": "2026-10-18T10:00:00Z"
    }
  },
  "_pending": []
}
```

The index is the only file that knows which pages exist. The sitemap, the admin's page list and "re-render everything" read it and nothing else, so no bucket listing is ever needed. The build writes it from the collections and the route patterns; the admin updates it as entries are created and deleted. It carries the i18n settings and per-page locales once the site has more than one locale (see [Localization](localization.md#routing)), and the `_pending` list used for recovery (see [Edit flow](edit-flow.md#consistency-and-recovery)). Nothing from the entry files is duplicated into it.

## Dependencies

Each page records what the renderer read while producing it, so a save affects exactly the pages it should:

- `entries`: every entry whose fields appear on the page: its own entry, singles like `site`, anything reached through a reference, and every entry a query returned. A change to any of them re-renders the page.
- `collections`: every collection the page queried, with the fields the query sorts or filters by. Creating or deleting an entry of that collection re-renders the page, and so does changing one of the listed fields on any of its entries, because that can change which entries match. Changing an unlisted field on an entry not in `entries` does not.

A static relation (the editor picked a post in a reference field) is an entry dependency only. A dynamic one (the template queries the last three posts) is the collection plus the matched entries. The build computes the initial dependencies by rendering every page in Node, the admin recomputes a page's dependencies each time it renders it, and nothing is declared by hand.
