# A DOM, not string replacement

Pre-rendered HTML can't be edited by find-and-replace. The same string appears HTML-escaped in the body and differently escaped in `<title>`, meta tags and attributes, and lists change the structure of the DOM. Parsing the template and writing values through DOM APIs leaves escaping to the browser, which never gets it wrong.

# Sentinel strings, not data attributes

The first design marked fields with attributes spread onto the element: `<h1 {...field('heading')}>{content.heading}</h1>`. It is verbose, repeats the field name, needs `attr` and `prefix` options for attributes, and cannot mark `<title>` or `<meta content>`. A sentinel string returned by `field()` goes anywhere an expression goes, including template literals and attributes, and the renderer locates it in text nodes and attribute values through the DOM. Only lists and conditionals need an element boundary, so only those are components, marked with comment pairs.

# Astro first

Astro's default output is plain HTML with no hydration payload: the template is the page. Frameworks that ship a serialized data payload alongside the HTML (see [Roadmap](roadmap.md#other-static-site-generators)) carry the same content in a second place that would also need updating.
