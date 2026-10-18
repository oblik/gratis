# Schema

The schema is the set of **collections** the admin can edit. A collection is an Astro [content collection](https://docs.astro.build/en/guides/content-collections/) declared with Gratis's `defineCollection` instead of Astro's, which adds what the admin needs: field types, labels, whether a field is localized, how the form is laid out and where the entries are stored. A collection is editable whether or not any page renders it: tags without a tag page, or a `site` single that only feeds the navbar, are ordinary collections.

## Declaring collections

`src/content.config.ts`:

```ts
import { defineCollection, glob, file, text, markdown, image, link, boolean, select, reference, list, tabs, section, row } from 'gratis/astro';

const site = defineCollection({
  single: true,
  loader: file('src/data/site.json'),
  schema: {
    title: text(),
    nav: list({ label: text(), href: link() }),
  },
});

const home = defineCollection({
  single: true,
  loader: file('src/data/home.json'),
  schema: {
    heading: text({ label: 'Headline' }),
    intro: markdown(),
    featured: reference('posts', { multiple: true }),
  },
});

const posts = defineCollection({
  loader: glob({ pattern: '*.json', base: 'src/data/posts' }),
  schema: tabs({
    Content: {
      title: text(),
      date: text(),
      body: markdown(),
      tags: reference('tags', { multiple: true }),
    },
    SEO: section('Search engines', {
      metaTitle: text({ localized: true }),
      ...row({ ogImage: image(), ogImageAlt: text() }),
    }),
  }),
});

const tags = defineCollection({
  loader: file('src/data/tags.json'),
  schema: { name: text() },
});

export const collections = { site, home, posts, tags };
```

- `single: true` makes a collection with exactly one entry, read with `getEntry('site')`. Everything else is a collection the editor adds entries to.
- `loader` is Gratis's `glob` or `file`, with the same signatures as Astro's. Gratis ships its own because it has to know where the entries live in order to write them back, and Astro's loaders don't expose their options.
- `schema` is a plain object of fields, or a layout wrapper around one. `defineCollection` derives a zod schema from it for Astro, so `astro check` and `CollectionEntry<'posts'>` work as for any collection, and the build compiles it to `schema.json` for the admin.

## Field types

| Type | Value | Localized by default |
|---|---|---|
| `text({ multiline? })` | string | yes |
| `markdown()` | markdown string | yes |
| `image()` | upload path | no |
| `link()` | URL or path | no |
| `boolean()` | boolean | no |
| `select({ options })` | one of the options | no |
| `reference(collection, { multiple? })` | an entry id, or a list of them | no |
| `list(fields)` | repeater over a fixed sub-schema, one level deep | per sub-field |

Every field takes `label`, defaulting to a readable form of its key, and `localized`, defaulting as above (see [Localization](localization.md#content)). Deliberately few; anything richer is out of scope.

`reference` points at another collection. The admin shows a picker over that collection's entries, the stored value is the entry id, and a page that renders through a reference depends on the referenced entry (see [Content model](content-model.md#dependencies)). A reference to a deleted entry renders nothing and is flagged in the admin. There are no back-references.

## Layout

`tabs` groups fields into tabs, `section` into a titled, collapsible group, `row` places fields side by side. A plain object is a flat list. The MVP renders the flat list only; the vocabulary is fixed now so schemas don't change later.

## Storage

Gratis writes entries the way the loader reads them. The developer picks the layout and Gratis conforms to it:

| Loader | On disk | Notes |
|---|---|---|
| `glob({ pattern: '*.json', base })` | one JSON file per entry; the id is the path without extension | The default. Optimistic locking is per entry. |
| `file('x.json')` | one JSON file holding every entry, keyed by id | Locking is per collection: two editors saving different entries at once conflict, and the admin retries by refetching and reapplying the one entry it changed. Fine for tags-sized collections. |
| `file('x.json')` with `single: true` | the entry's fields are the file | |
| `glob({ pattern: '*.md', base })` | one Markdown file per entry: frontmatter holds the fields, the body is the field named `body`, which must be `markdown()` and is never localized | A site that needs a localized body stores the collection as JSON instead. |

Markdown is rendered by Gratis's own implementation in every mode, never by Astro's pipeline, so what the editor's browser produces is what the build produces (see [Rendering](rendering.md#the-renderer)). A fenced block renders as plain `<pre><code class="language-x">`; highlighting, if wanted, is the site's client-side concern. MDX is unsupported and `defineCollection` rejects a `.mdx` pattern.

## Mixing with plain Astro collections

A collection declared with Astro's own `defineCollection` is not editable and Gratis ignores it: its values are baked into the pages, as on any Astro site, and change with a redeploy. The two kinds coexist in the same `content.config.ts`, so a site adopts Gratis one collection at a time.

The rule is that a Gratis collection is read only through Gratis's `getEntry` and `getCollection` (see [Rendering](rendering.md#helpers)), never through `astro:content`.

- Gratis getters only accept Gratis collections. This is a type error: the integration generates a `Collections` interface from the config with Astro's `injectTypes` hook, the getters are typed over its keys, and the entry objects they return are typed from the field builders.
- Astro getters must not be used on Gratis collections. This cannot be a type error, because Astro types its own getters from every exported collection, Gratis ones included. It is a build error instead: in the template pass the Gratis loader stores unscoped sentinels, so a value read through `astro:content` shows up in the output as a sentinel without a scope and fails the build naming the page, collection and field.

## `schema.json`

The build compiles the config to `dist/_gratis/schema.json`, which the admin renders its forms from: every collection with its storage layout, fields, labels, options, reference targets and layout, plus the route patterns bound to each collection (see [Rendering](rendering.md#template-id)). The template pass validates every read against it: an undeclared field, a type mismatch or an `Each` over a scalar fails the build.
