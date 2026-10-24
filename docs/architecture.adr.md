# React, for Lexical

Rich text is the hardest widget in the admin, and Lexical is the best editor for it. It is framework-agnostic on paper, but its plugins, menus and examples are built for React. React is also the framework a custom-field author most likely knows. Svelte and Solid would ship smaller bundles but give up both.

# Native elements, not a component library

shadcn/ui is fast to start with, but it brings Radix, `cva`, `tailwind-merge` and an icon package, and Radix is no longer actively developed. Headless libraries such as Base UI are maintained and stay out of the way, but most of what they offer is now in the platform: `<dialog>` traps focus and closes on Esc, `popover` closes on an outside click, and CSS anchor positioning places it. The only widget left that is hard to write by hand is a combobox. Native elements also give most of the accessibility for free, and Lexical's toolbars and typeahead menus need their own focus handling to keep the editor's selection, which a library popover would get in the way of.

# Zustand, not a form library

TanStack Form's main advantage is type inference, and that is lost when the form is generated from the schema at runtime. What remains is per-field subscriptions, dirty tracking and array helpers. The CMS-specific state fights a library's single "initial values" model: Lexical owns its editor state, merging after a 412 needs the base, the draft and the current version at once, and switching locale points the same field at a different slice of a locale map.

A store with path selectors covers what remains. Zustand is that store, at about 1 kB, and its subscriptions are tested in a way a hand-written `useSyncExternalStore` store would not be. Per-entry vanilla stores keep entries from leaking into each other. Re-renders stay predictable as long as selectors return values, not new objects. The React Compiler covers what selectors can't, a parent re-render cascading through the form, at no runtime cost.

# TanStack Router, not a hand-written hash router

A few lines of `hashchange` handling cover the views, but not what a CMS needs from routing. Blocking navigation on unsaved changes can't be done cleanly by hand, since `hashchange` fires after the URL has changed and the router would have to change it back, which breaks around the back button. Filters, sort order, locale and the open tab live in the URL, and TanStack Router validates and types those search params, and types path params and links, so renaming a route is a compile error. Hash history keeps the single `index.html`. Code-based routes avoid the route generator and its Vite plugin.

# No query library

The data layer is the product: ETags, the fan-out on save and conflict handling are Gratis's own code, and TanStack Query's mutation model would sit next to that, not replace it. A cache keyed by S3 path covers the reads. Query comes back only if invalidation and deduplication end up being rebuilt by hand.

# Node, not Bun

Bun's built-in S3 client and speed don't help where they would matter. The admin runs in the browser, where `Bun.s3` doesn't exist, and `aws4fetch` already works there. The integration and the CLI run inside users' Astro builds, which are mostly on Node, so a Bun-only API would break them. Node runs `.ts` files directly through type stripping, and the project already uses `node --test`.
