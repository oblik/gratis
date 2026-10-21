# A DOM, not string replacement

Pre-rendered HTML can't be edited by find-and-replace. The same string appears HTML-escaped in the body and differently escaped in `<title>`, meta tags and attributes, and lists change the structure of the DOM. Parsing the template and writing values through DOM APIs leaves escaping to the browser, which never gets it wrong.

# Sentinel strings, not data attributes

The first design marked fields with attributes spread onto the element: `<h1 {...field('heading')}>{content.heading}</h1>`. It is verbose, repeats the field name, needs `attr` and `prefix` options for attributes, and cannot mark `<title>` or `<meta content>`. A sentinel string goes anywhere an expression goes, including template literals and attributes, and the renderer locates it in text nodes and attribute values through the DOM. Only lists and conditionals need an element boundary, so only those are components, marked with comment pairs.

# Entry objects, not a `field()` helper

The first helpers read "the current page" from an async context: `field('heading')`, `site('title')`. Once a page renders several entries there is no current page. The getters return entry objects whose properties are values in the real build and sentinels in the template pass, which reads like plain Astro and gives every read a scope for free. The async context stays, but only for the locale, the route pattern and the mode.

# Queries in `getCollection`, not in JavaScript

`.filter().sort().slice()` after the read is invisible to the template pass. Putting the query in the call makes it part of the marker, so the renderer can evaluate it, and lets the fan-out depend on exactly the fields the query touches. The vocabulary is kept tiny on purpose; a wrapper type that hides the array methods is a later refinement (see [Roadmap](roadmap.md#query-wrapper)).

# Astro first

Astro's default output is plain HTML with no hydration payload: the template is the page. Frameworks that ship a serialized data payload alongside the HTML (see [Roadmap](roadmap.md#other-static-site-generators)) carry the same content in a second place that would also need updating.

# jsdom in Node

The Node renderer needs a DOM whose parse and serialize match the browser's, or pages would change depending on where they were rendered. A sample of real Astro output (entities, boolean attributes, SVG, `<template>`, a table without `<tbody>`, `<pre>` and `<textarea>` with a leading newline, `<script>` containing `</div>`) was round-tripped through the browser's `DOMParser` and three Node DOMs. jsdom, which parses with parse5 per the HTML spec, matched the browser byte for byte. linkedom left `<` and `&` unescaped inside `<title>`, which would let content inject markup. happy-dom kept the newline after `<pre>` that the parser is required to drop. jsdom is heavy, but it runs only at build and deploy time, never in the admin.

# Semantic, not byte, equivalence with the build

Astro's serializer and the DOM's differ in harmless ways (see [Rendering](rendering.md#output-equivalence)). Matching Astro's bytes would mean a hand-written serializer imitating another project's output choices, which is exactly the kind of code that rots. Browsers render both forms identically, so the first edit of a page normalizes it once and nothing else changes.
