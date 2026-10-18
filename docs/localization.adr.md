# One JSON per page with locale maps, not one JSON per locale

Repeaters decide it. Reordering a list must reorder every translation at once, which is natural when the item is one object with per-value maps and a mess across files. A single file also keeps all translations of a field next to each other, so a diff, a review or "translate what's missing" is one file and one field at a time, and the other languages give an AI or a translator the meaning of the text.

Per-value maps rather than a per-locale block at the top of the page file for the same reason: the unit that gets reordered, duplicated or deleted is the item, and its translations must travel with it.

# Gratis owns content, not routing

Owning routing would force every existing localized site into one file layout, which breaks incremental adoption. Everything Gratis needs, the locale and the canonical page identity, can be derived from any layout, so it is. The cost is one constraint, locale as a path prefix, which is what Astro's own i18n routing produces anyway.

# `[...lang]/` folder as the scaffold

With `prefixDefaultLocale: false`, Astro's [i18n guide](https://docs.astro.build/en/guides/internationalization/) expects the default locale's pages at the root of `src/pages/` and every other locale in its own folder: `src/pages/about.astro` and `src/pages/es/about.astro`. That is one file per locale per page, and Astro does not generate the copies. With `src/pages/[...lang]/about.astro` one file serves every locale: the [routing guide](https://docs.astro.build/en/guides/routing/) shows that a rest parameter set to `undefined` matches the top-level page, so `lang: undefined` builds `/about` and `lang: 'es'` builds `/es/about`.

The risk is that this relies on a rest parameter in a non-final segment. The routing guide lists `src/pages/[...locale]/[slug].astro` as a valid shape only in its on-demand rendering section, and in [withastro/astro#9770](https://github.com/withastro/astro/issues/9770) a maintainer called a spread parameter in the middle of a path unusual and not officially supported. The bugs reported there and in [withastro/astro#9103](https://github.com/withastro/astro/issues/9103) are precedence conflicts between a rest route and a static sibling such as a root `index.astro`; with the whole site under `[...lang]/` there are no static siblings. [withastro/astro#9757](https://github.com/withastro/astro/issues/9757) is an SSR-only `[...lang]/index` bug that prerendering fixes, and static builds always prerender.

If a future Astro version drops support, the fallback is the documented layout with a generated three-line stub per page under `src/pages/[lang]/` that imports and renders the canonical page. That is a dev-time refactor, never a site outage, because the deployed site does not depend on Astro. The ergonomics are worth that risk.

# Localized slugs deferred

They need a catch-all dispatch route that restructures the site, which contradicts incremental adoption. No target site has asked for them yet.
