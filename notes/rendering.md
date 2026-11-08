# Rendering

The template pass emits one HTML file per route pattern in which editable values are sentinel strings and lists and conditionals are bracketed by comments. The renderer parses a template as a DOM, writes content into it through DOM APIs, and serializes it back. It never treats a page as a string.

## Templates

Pages read content through Gratis's getters and look like plain Astro:

```astro
---
import { Each, getCollection, getEntry, If } from 'gratis/astro'

const { post } = Astro.props
const site = await getEntry('site')
const latest = await getCollection('posts', { sort: '-date', limit: 3 })
---

<title>{post.title} · {site.title}</title>
<article set:html={post.body} />
<If when={post.featured}>
  <p>Featured</p>
</If>
<ul>
  <Each of={latest}>{(p) => <li>{p.title}</li>}</Each>
</ul>
```

In the real build and in dev, the getters return the real values and the output has no trace of Gratis. In the template pass, however, they return one placeholder entry per collection, and every read emits a sentinel with its own scope and field:

- `{{gratis:entry:site:title}}` for a single, or a `getEntry` with a literal id.
- `{{gratis:route:title}}` for the page's own entry.
- `{{gratis:item:name}}` inside an `Each`.

A sentinel goes anywhere an expression goes (text, attributes, `<title>`, template literals), and Astro's escaping doesn't change it.

`Each` and `If` are components because a list item and a conditional block need an element boundary that a string can't express; they wrap their children in comment pairs, and an `Each` over a query carries the query in its marker, so the renderer can evaluate it.

How the helpers got here:

1. Data attributes spread onto elements: Verbose, repeated the field name, and couldn't mark `<title>` or `<meta content>`.
2. A `field('heading')` helper reading "the current page" from an async context: Broke as soon as a page rendered several entries.
3. Entry objects whose properties are values or sentinels depending on the mode: Reads like plain Astro and gives every read a scope for free.

A dynamic route is bound to a collection by its `getStaticPaths`: the placeholder's ID lands in the params, so the pass sees which param is a `posts` ID. Every pattern builds exactly one template, and `routes.json` lists one page per pattern, entry and locale.

## The renderer

`render(template, { content, locale })` returns the HTML and the entries and collections it read:

1. Parse the template.
2. Replace sentinels in text nodes and attribute values through the DOM, so escaping is never done by hand.
3. Clone the nodes between every `each` pair once per item.
4. Drop the nodes between an `if` pair when the value is falsy.
5. Serialize.

Because it's a pure function of the template and the content files, the whole site can be regenerated from scratch at any time, in the browser or in Node. That property is what makes everything else safe.

The output is semantically identical to the one produced by Astro on build, but is not byte-identical: the DOM serializer normalizes boolean attributes, entities, and implied elements (in harmless ways). Matching Astro's bytes would mean a hand-written serializer imitating another project's output, which is exactly the kind of code that rots and we don't want.

In Node, the renderer uses jsdom, chosen by round-tripping real Astro output through the browser's `DOMParser` and three Node DOMs:

- jsdom matched the browser byte for byte.
- linkedom left `<` unescaped inside `<title>`.
- happy-dom kept a newline the parser must drop.

It's heavy, but it runs only at build and deploy time.

## Islands

A framework component in a page (an island) gets content in two ways, and both end up in the HTML the renderer fills:

- Props: Astro writes them into the island's `props` attribute as JSON, so the renderer fills them as JSON. A field that is a whole value keeps its type, so a boolean stays a boolean, and a list becomes one entry per match, because its single stand-in entry carries its query.
- Children (slots): Astro renders them to HTML inside the island, and they're filled like any other HTML.

So no HTML that a framework renders on the server ever holds content. A save only fills templates and never runs a framework's server renderer, so it couldn't update that HTML, and the island would show the build's content until it hydrates. Content may therefore reach an island's props only when the island is `client:only`, which has no server-rendered HTML, and the build fails for any other island. The error offers the two ways out: make the island `client:only`, or pass the content as children, which keeps it server-rendered because Astro, not the framework, renders it. Emptying a server-rendered island's HTML, or rewriting its `client` to `only` during the build, was rejected: the template would no longer be what Astro builds, and either change depends on how each framework hydrates.

An island's `uid` is a hash of its props, so it goes stale after a save, but only Astro's dev server reads it.

Testing one framework (React) is enough, because Astro writes `props` the same way for every framework, and the hydration markers Vue, Svelte and Solid add to the HTML don't touch the values. Integrations that ship their own state in a `<script>` aren't covered.

If server-rendered islands with editable props are ever needed, the path is rendering components in the browser: bundle each island with its integration's `renderToStaticMarkup` for the save to call. That would add to the renderer rather than change it.

## The one constraint

Anything derived from a read in JavaScript renders fine in dev and in the build, but can't be reproduced by the editor:

- A value transformed in JavaScript, like `post.title.toUpperCase()`.
- An attribute computed from a field, like `class={post.featured ? 'highlight' : ''}`: Branching on a value must be done with an `If` instead.
- `.filter()` and `.slice()` after `getCollection`: Queries should go in `getCollection`, which keeps them in the marker and lets the fan-out depend on exactly the fields they touch.
- Sentinels inside `<script>` and `<style>`, because the renderer can't know the escaping rules there.

The build already renders every page in Node and warns when the result differs from the real build, which is the start of turning this rule into a check.

Astro is the first target because its default output is plain HTML with no hydration payload: the template is the page. A framework that ships a serialized data payload next to the HTML (like Next.js) carries the content in a second place that would also need updating, which significantly increases complexity.
