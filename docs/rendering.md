# Rendering: DOM markers, not string replacement

Pre-rendered HTML can't be edited by find-and-replace. The same string appears HTML-escaped in the body and differently escaped in `<title>`, meta tags and JSON-LD, and lists change the structure of the DOM. So Gratis doesn't treat a page as a string. The SSG adapter emits a template per route in which editable regions are marked with data attributes, and the renderer manipulates it as a DOM.

## Marking fields in Astro

In the Astro project the developer uses Gratis helpers:

```astro
---
import { field, each } from 'gratis/astro';
---
<h1 {...field('heading')}>{content.heading}</h1>

<ul {...each('contacts')}>
  <li><a {...field('email', { attr: 'href', prefix: 'mailto:' })}>{item.email}</a></li>
</ul>
```

The build produces, in the template file:

```html
<h1 data-gratis-field="heading">Hello!</h1>
<ul data-gratis-each="contacts">
  <li><a data-gratis-field="email" data-gratis-attr="href" data-gratis-prefix="mailto:">john@example.com</a></li>
</ul>
```

## The renderer

Rendering is a small, pure function `render(template, content) -> html` that:

1. Parses the template with `DOMParser`.
2. For each `data-gratis-field`, sets `textContent` (or the named attribute). Escaping is handled by the DOM, never by hand.
3. For each `data-gratis-each`, keeps the first child as the item template, clones it once per item, and recurses.
4. For `data-gratis-if`, removes the element when the field is falsy.
5. For markdown fields, renders markdown to DOM nodes in the browser.
6. Serializes back to HTML.

Because it's a pure function of `(templates, content.json)`, the whole site can be regenerated from scratch at any time, in the browser or in Node. That property is what makes everything else safe (see [Consistency and recovery](edit-flow.md#consistency-and-recovery)).

The same renderer runs in Node at deploy time, so markdown rendering must use one implementation for both environments.

## Why Astro first

Astro is the right first target because its default output is plain HTML with no hydration payload: the template is the page. Frameworks that ship a serialized data payload alongside the HTML (see [Roadmap](roadmap.md#other-static-site-generators)) need the same content written in a second place.
