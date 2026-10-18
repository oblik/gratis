# Rendering

A second build pass emits one template per route pattern in which editable values are sentinel strings and lists and conditionals are bracketed by comments. The renderer parses the template as a DOM, writes the content into it through DOM APIs and serializes it back. It never treats a page as a string.

## Helpers

```astro
---
import { field, site, list, markdown, Each, If } from 'gratis/astro';
---
<title>{site('title')}</title>
<h1>{field('heading')}</h1>
<a href={`mailto:${field('email')}`}>{field('email')}</a>
<img src={field('photo')} alt={field('photoAlt')}>
<article set:html={markdown('body')} />

<ul>
  <Each of={list('contacts')}>{c => <li>{c.field('email')}</li>}</Each>
</ul>

<If field="showHours"><p>{field('hours')}</p></If>
```

- `field(name, options?)` reads a field of the current page, `site(name)` a sitewide field, `list(name)` and `site.list(name)` a repeater. `locale()` gives the current locale.
- Values are plain strings, so they can go anywhere an expression can: text, attributes, template literals. No wrapper elements, no `attr` or `prefix` options.
- Types live in the schema (see [Content model](content-model.md#schema)), not in the helper calls. `markdown()` returns rendered HTML for `set:html`, `If` reads a boolean, `Each` a list; the build checks each call against the declared type.
- `Each` and `If` are components because a list item and a conditional block need an element boundary, which a string can't express. `Each` takes a function slot and calls it once per item.
- There is no frontmatter setup. The integration's middleware runs each page render in an async context that the helpers read (see [Astro integration](astro-integration.md#dev)).

Sentinels inside `<script>` and `<style>` are unsupported: the renderer can't know the escaping rules there.

## Two modes

In real mode (`astro dev` and the first `astro build` pass) every helper returns the value from the content files for the current page and locale. The output has no trace of Gratis.

In template mode (the second build pass) the helpers emit markers:

- `field('heading')` returns the sentinel `{{gratis:page:heading}}`; `site('title')` returns `{{gratis:site:title}}`; inside an `Each`, `c.field('email')` returns `{{gratis:item:email}}`.
- `Each` calls its function once with a placeholder scope and wraps the result in `<!--gratis:each page:contacts-->` and `<!--/gratis:each-->`.
- `If` always renders its children, wrapped in `<!--gratis:if page:showHours-->` and `<!--/gratis:if-->`.
- Every helper call is recorded with its template, scope and name, and the build fails if one doesn't match the schema.

Astro escapes the sentinel like any string, but it contains nothing that escaping changes, so it survives into text nodes, attributes, `<title>` and `<meta content>` alike.

## Template id

The template id is the route pattern with any locale segment removed: `src/pages/about.astro` is `/about`, `src/pages/blog/[slug].astro` is `/blog/[slug]`. A static pattern is a singleton; a dynamic pattern is a collection the editor can add pages to. Collection pages supply their paths with `export const getStaticPaths = pages('/blog/[slug]')`, which matches the routes index against the pattern. In template mode `pages()` returns one placeholder path, so the pass builds exactly one template per pattern.

## The renderer

`render(template, { page, site, locale }) -> html` is a pure function that:

1. Parses the template with `DOMParser`.
2. Walks every text node and attribute value, finds sentinels and replaces them through the DOM (`textContent`, `setAttribute`), resolving localized values with fallback to the default locale. Escaping is handled by the DOM, never by hand. A markdown sentinel's text node is replaced by the rendered nodes.
3. For each `each` comment pair, takes the nodes between as the item template, removes them, clones them once per item and fills the `item` sentinels. Nesting is one level deep, matching the content model.
4. For each `if` comment pair, removes the nodes between when the field is falsy. The comments are removed either way.
5. Serializes back to HTML.

Because it's a pure function of the template and the content files, the whole site can be regenerated from scratch at any time, in the browser or in Node. That property is what makes everything else safe (see [Consistency and recovery](edit-flow.md#consistency-and-recovery)).

The same renderer runs in Node at deploy time, so markdown rendering must use one implementation for both environments.

## The one constraint

Anything derived from a value in the template, like `field('x').toUpperCase()` or a class chosen by content, renders correctly in dev and in the real build but can't be reproduced by the editor. A build-time check that renders each template with the current content and compares it to the real build is planned (see [Roadmap](roadmap.md)); until then it is a documented rule.
