# Collections, not templates

The first schema declared fields per template, so a thing could only be edited if a page rendered it. Tags without a tag page, posts featured on the home page, a sitewide `site.json` that was a special case: all need content that exists independently of a route. A collection is edited on its own, pages read from any number of them, and `site` becomes an ordinary single.

# Astro content collections, with Gratis field builders as the source

A Gratis collection is an Astro collection so that adoption is per collection and `astro check`, generated types and the rest of Astro's tooling keep working. But zod is not the source of truth: an arbitrary zod schema (unions, transforms, refinements) can't be turned into a form, and it carries no label, `localized` or layout. So the fields are declared with Gratis builders and `defineCollection` derives the zod schema from them, not the other way around. Moving an existing collection over is a mechanical swap of `z.string()` for `text()`.

# A declared schema, not one inferred from helper calls

An earlier draft generated the schema from the reads recorded in the template pass. It fails in three ways: a JSON string cannot tell a text field from markdown or a select with options; two reads of the same field could disagree on type or `localized`; and the admin form needs a layout (tabs, sections, rows) that no read can express. So the developer declares the schema, the build compiles it to `schema.json`, and the template pass validates the reads against it instead of defining it.

# Gratis conforms to the loader

Gratis could have required its own content folder and file layout. Instead it writes entries in whatever shape the loader reads them: one file per entry, one file per collection, or Markdown with frontmatter. The developer keeps Astro's conventions and nothing on disk is Gratis-specific. The cost is that Gratis ships its own `glob` and `file`, since Astro's don't expose their options, and that the per-collection file trades per-entry locking for simplicity, which is stated rather than forbidden.

# Own `getEntry` and `getCollection`, enforced at build time

The getters are the only place that can hand out placeholders in the template pass, resolve the locale in the real build, and give every read a scope so the renderer can track dependencies. Keeping `astro:content` getters away from Gratis collections can't be done in types without overriding Astro's generated declarations, which would break on Astro upgrades. Failing the build on unscoped sentinels is deterministic, runs on every `astro build`, and names the offending read.

# Markdown through one implementation

Astro's markdown pipeline runs remark, rehype and Shiki with project-specific plugins that the editor's browser can't reproduce. Rendering every markdown value, Markdown file bodies included, with Gratis's own implementation in both the build and the browser is what keeps the output identical. MDX would need the whole pipeline in the browser and is out of scope.
