# Content model

Content is a set of small JSON files, mirrored one-to-one between the repo and the bucket:

```
routes.json            index of every page: template, locales, timestamps
site.json              sitewide fields (navbar, footer, title)
index.json             fields of the home page
about/index.json       fields of /about
blog/hello/index.json  fields of /blog/hello
```

In the repo they live under `content/`. In the bucket they sit at the root, so each page's JSON is next to its HTML (`/about/index.html`, `/about/index.json`). All of it is public, like the pages it renders.

## `routes.json`

```json
{
  "pages": {
    "/": { "template": "/", "updated": "2026-10-18T10:00:00Z" },
    "/about": { "template": "/about", "updated": "2026-10-18T10:00:00Z" },
    "/blog/hello": { "template": "/blog/[slug]", "updated": "2026-10-18T10:00:00Z" }
  },
  "_pending": []
}
```

The index is the only file that knows which pages exist. The sitemap, the admin's page list and "re-render everything" read it and nothing else, so no bucket listing is ever needed. It carries the i18n settings and per-page locales once the site has more than one locale (see [Localization](localization.adr.md)), and the `_pending` list used for recovery (see [Edit flow](edit-flow.md#consistency-and-recovery)). Nothing from the page files is duplicated into it.

## Page and site files

A page file holds that page's fields and nothing else:

```json
{
  "heading": "Hello!",
  "subheading": "Welcome to my site!",
  "contacts": [
    { "email": "john@example.com" },
    { "email": "jane@example.com" }
  ]
}
```

`site.json` has the same shape for sitewide fields. Localized fields hold a locale map instead of a value; see the ADR.

## Schema

The developer declares the fields in `gratis.config.ts`, per template and for the site. The build compiles it to `schema.json`, which the SPA renders its forms from, and validates every helper call in the template pass against it: an undeclared field or a type mismatch fails the build.

```ts
import { defineSchema, text, markdown, image, link, boolean, select, list, tabs, section, row } from 'gratis';

export default defineSchema({
  site: {
    title: text(),
    nav: list({ label: text(), href: link() }),
  },
  templates: {
    '/': {
      heading: text({ label: 'Headline' }),
      intro: markdown(),
    },
    '/about': tabs({
      Content: {
        heading: text(),
        body: markdown(),
        contacts: list({ email: text() }),
      },
      SEO: section('Search engines', {
        metaTitle: text({ localized: true }),
        ...row({ ogImage: image(), ogImageAlt: text() }),
      }),
    }),
    '/blog/[slug]': {
      title: text(),
      tone: select({ options: ['news', 'essay'] }),
      body: markdown(),
    },
  },
});
```

- Field types: `text`, `markdown`, `image`, `link`, `boolean`, `select` with options, and `list` (a repeater over a fixed sub-schema, one level deep). Deliberately few; anything richer is out of scope.
- Every field takes `label`, defaulting to a readable form of its key, and `localized`, defaulting by type (see [Localization](localization.md#content)). `text` takes a `multiline` flag.
- Layout: `tabs` groups fields into tabs, `section` into a titled, collapsible group, `row` places fields side by side. A plain object is a flat list. The MVP renders the flat list only; the vocabulary is fixed now so schemas don't change later.
- Template keys are template ids (see [Rendering](rendering.md#template-id)). A dynamic pattern makes the template a collection the editor can add pages to.
- The config is TypeScript so the field keys can type the helpers later; nothing else depends on it.
