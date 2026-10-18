# Content model

A single `content.json` holds everything, split into sitewide fields and per-page fields:

```json
{
  "sitewide": {
    "title": "My Site",
    "footerText": "Copyright 2026"
  },
  "pages": {
    "/": {
      "_template": "home",
      "heading": "Hello!",
      "subheading": "Welcome to my site!"
    },
    "/about-us": {
      "_template": "about",
      "address": "San Francisco, CA",
      "contacts": [
        { "email": "john@example.com" },
        { "email": "jane@example.com" }
      ]
    }
  }
}
```

The schema (field names, types, which template a page uses, which fields are lists) is declared in the Astro project and emitted to `schema.json` at build time, so the SPA can render a form for it without any configuration of its own.

Supported field types are deliberately few: short text, long text / markdown, image, link, boolean, and a repeater (a list of a fixed sub-schema, one level deep). That covers the target audience; anything richer is out of scope.

Both files live under `/_gratis/` in the bucket (see [Architecture](architecture.md#bucket-layout)). How the SPA writes `content.json` safely is covered in [Edit flow](edit-flow.md).
