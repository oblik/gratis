# Localization

## Content

An entry has one file for all locales.

A localized field holds a map from locale to value; a shared field holds a plain value:

```jsonc
{
  "heading": {
    "en": "Hello",
    "es": "Hola",
  },
  "photo": "/uploads/a1b2.jpg", // shared field
  "usps": [
    {
      "title": {
        "en": "Fast",
        "es": "Rápido",
      },
      "icon": "bolt", // shared field
    },
  ],
}
```

- Text and markdown default to localized; images, links, booleans, selects, and references to shared.
- A site with one locale stores plain values everywhere.
- A missing translation falls back to the default locale at render time rather than blocking a save.
- The body of a Markdown entry is the one thing that can't be localized; a site that needs that stores the collection as JSON.

Repeaters (array fields) decide this layout. Reordering a list must reorder every translation at once, which is natural when the item is just one object with per-value maps. Otherwise, if you have one file per locale, you'd need to somehow sync them up, which will be incredibly brittle and complex.

This also keeps all translations of a field next to each other, so a diff or "translate what's missing" is one file and one field at a time.

## Routing

The locale is a path prefix, so e.g. `/about` and `/es/about` both render from the same template. The template itself carries no locale: the renderer resolves `{{gratis:route:heading}}` with the locale of the page it's rendering. Gratis derives what it needs from any layout and imposes nothing:

- The locale: `Astro.currentLocale` when Astro's i18n is configured, otherwise a `lang` param, otherwise the default.
- The template ID: the route pattern with the locale segment removed, so `src/pages/es/about.astro`, `src/pages/[lang]/about.astro` and `src/pages/[...lang]/about.astro` all reduce to `/about`.

An existing localized site adopts Gratis without moving a file. Owning routing instead would force every site into one layout and break incremental adoption.

For new sites, the scaffold is `src/pages/[...lang]/about.astro`, where `locales()` returns `undefined` for the default locale and e.g. `'es'` for Spanish, so one file builds both paths. This leans on a rest parameter in a non-final segment, which Astro supports but hasn't committed to officially (see [withastro/astro#9770](https://github.com/withastro/astro/issues/9770)). The bugs reported there are precedence conflicts with static siblings, which a site entirely under `[...lang]/` doesn't have. If a future Astro drops it, the fallback is a generated three-line stub per page under `src/pages/[lang]/`: a dev-time refactor, never an outage, because the deployed site doesn't depend on Astro.

Localized slugs (`/es/sobre-nosotros`) need a single catch-all route that restructures the entire site, so they wait until a site asks for them.
