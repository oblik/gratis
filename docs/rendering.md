# Rendering

A second build pass emits one template per route pattern in which editable values are sentinel strings and lists and conditionals are bracketed by comments. The renderer parses the template as a DOM, writes the content into it through DOM APIs and serializes it back. It never treats a page as a string.

## Helpers

```astro
---
import { getEntry, getCollection, locales, locale, Each, If } from 'gratis/astro';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map(post => ({ params: { slug: post.id }, props: { post } }));
}

const { post } = Astro.props;
const site = await getEntry('site');
const latest = await getCollection('posts', { sort: '-date', limit: 3 });
---
<html lang={locale()}>
<title>{post.title} · {site.title}</title>
<h1>{post.title}</h1>
<img src={post.ogImage} alt={post.ogImageAlt}>
<article set:html={post.body} />

<ul>
  <Each of={post.tags}>{tag => <li>{tag.name}</li>}</Each>
</ul>

<If when={post.featured}><p>Featured</p></If>

<Each of={latest}>{p => <li><a href={`/blog/${p.id}`}>{p.title}</a></li>}</Each>
```

- `getEntry(collection, id)` reads one entry, `getEntry(single)` a single. `getCollection(collection, query?)` reads a collection; `query` is `{ sort, limit, where }` and nothing else: `sort` a field name with an optional leading `-`, `where` an equality on a field or, for a multiple reference, a contains. Both accept only collections declared with Gratis's `defineCollection` (see [Schema](schema.md#mixing-with-plain-astro-collections)).
- An entry has `id`, `collection` and one property per field. A scalar field reads as a plain string, so it goes anywhere an expression can: text, attributes, template literals. `markdown` reads as rendered HTML for `set:html`. A single `reference` reads as the referenced entry (`post.author.name`); a multiple reference, a `list` or a query reads as something for `Each`; a `boolean` as something for `If`.
- `Each` and `If` are components because a list item and a conditional block need an element boundary, which a string can't express. `Each` takes a function slot and calls it once per item. Nesting is one level deep.
- `locales()` returns the `lang` param for every locale, `undefined` for an unprefixed default, for use in `getStaticPaths`. `locale()` is the current one.
- Types live in the schema, not in the reads: the entry objects are typed from the field builders, and the build checks every read against the declared type.
- There is no frontmatter setup beyond the reads. The integration's middleware runs each page render in an async context holding the route pattern, the locale and the mode, which the helpers read (see [Astro integration](astro-integration.md#dev)).

Sentinels inside `<script>` and `<style>` are unsupported: the renderer can't know the escaping rules there.

## Two modes

In real mode (`astro dev` and the first `astro build` pass) the getters return the values from the content files, resolved for the current locale. The output has no trace of Gratis.

In template mode (the second build pass) `getEntry` and `getCollection` return one placeholder entry per collection, and the reads emit markers:

- A field read emits a sentinel naming its scope and field: `{{gratis:entry:site:title}}` for a single or a `getEntry` with a literal id, `{{gratis:route:title}}` for the page's own entry, `{{gratis:item:name}}` inside an `Each`. A read through a single reference adds a path: `{{gratis:route:author.name}}`. `locale()` emits `{{gratis:locale}}`.
- `Each` calls its function once with a placeholder item and wraps the result in `<!--gratis:each route:tags-->` and `<!--/gratis:each-->`. Over a query the marker carries it: `<!--gratis:each query:posts {"sort":"-date","limit":3}-->`.
- `If` always renders its children, wrapped in `<!--gratis:if route:featured-->` and `<!--/gratis:if-->`.
- Every read is recorded with its template, scope and field, and the build fails if one doesn't match the schema or has no scope (see [Schema](schema.md#mixing-with-plain-astro-collections)).

A placeholder of the collection the pattern is bound to, read outside an `Each`, is the page's own entry. A placeholder from a query read outside an `Each` is a build error: "the latest post" is an `Each` of one.

Astro escapes the sentinel like any string, but it contains nothing that escaping changes, so it survives into text nodes, attributes, `<title>` and `<meta content>` alike.

## Template id

The template id is the route pattern with any locale segment removed: `src/pages/about.astro` is `/about`, `src/pages/blog/[slug].astro` is `/blog/[slug]`. A pattern is bound to a collection by its `getStaticPaths`: in template mode `getCollection('posts')` returns one placeholder whose id lands in the params, so the pass sees `/blog/<placeholder>` and records that `slug` is a `posts` id. `locales()` returns one placeholder too, so every pattern builds exactly one template. Params must be entry ids or the locale; a param derived from a field is the one constraint below. The bindings go into `schema.json`, and `routes.json` lists one page per pattern, entry and locale.

A static pattern renders singles and fixed entries. A dynamic pattern bound to a collection gets a page per entry, created and deleted by the admin as entries come and go.

## The renderer

`render(template, { content, locale }) -> { html, deps }` is a pure function that:

1. Parses the template with `DOMParser`.
2. Walks every text node and attribute value, finds sentinels and replaces them through the DOM (`textContent`, `setAttribute`), resolving the scope to an entry, a reference to the referenced entry, and localized values with fallback to the default locale. Escaping is handled by the DOM, never by hand. A markdown sentinel's text node is replaced by the rendered nodes.
3. For each `each` comment pair, takes the nodes between as the item template, removes them, clones them once per item and fills the `item` sentinels. Items come from a list field, a multiple reference, or from evaluating the query against the collection's entries.
4. For each `if` comment pair, removes the nodes between when the field is falsy. The comments are removed either way.
5. Serializes back to HTML and returns it with every entry and collection it read (see [Content model](content-model.md#dependencies)).

Because it's a pure function of the template and the content files, the whole site can be regenerated from scratch at any time, in the browser or in Node. That property is what makes everything else safe (see [Consistency and recovery](edit-flow.md#consistency-and-recovery)).

The same renderer runs in Node at build and deploy time, so markdown rendering must use one implementation for both environments. A reference to a missing entry renders nothing.

### Output equivalence

A rendered page is semantically identical to the build's page, not byte-identical. The renderer serializes as `<!DOCTYPE name>` followed by `documentElement.outerHTML`, which normalizes what the HTML parser already normalized:

- Boolean and empty attributes gain `=""`: `checked` becomes `checked=""`.
- Named character references that need no escaping become characters: `&copy;` becomes `©`. `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&nbsp;` stay escaped where the serializer requires it.
- Implied elements appear: a `<tr>` directly in `<table>` gets its `<tbody>`.
- The newline right after `<pre>` or `<textarea>`, which the parser drops, is gone.

Void elements, SVG children, whitespace, comments, and the contents of `<script>`, `<style>` and `<template>` round-trip unchanged.

The renderer takes a `DOMParser` as an argument: the browser's own in the admin, jsdom's in Node. Both produce byte-identical output for the same template and content, so a page rendered in the admin and the same page rendered at deploy are the same bytes.

## The one constraint

Anything derived from a read in JavaScript, like `post.title.toUpperCase()`, a class chosen by content, `.filter()` or `.slice()` after `getCollection`, or a param computed from a field, renders correctly in dev and in the real build but can't be reproduced by the editor. Queries go in `getCollection`, conditionals in `If`. A build-time check that renders each page with the current content and compares it to the real build is planned (see [Roadmap](roadmap.md#build-time-content-check)); until then it is a documented rule.
