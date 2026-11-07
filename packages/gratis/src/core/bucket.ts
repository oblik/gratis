// Every name things go by, and the bucket's layout (notes/README.md).
//
//   name            example                               made by
//   collection      `posts`                               the content config
//   entry id        `hello`                               the editor, as a slug (isEntryId)
//   entry key       `site` (a single), `posts/hello`      entryKey, parseKey
//   content key     `_gratis/content/posts/hello.json`    contentKey, parseContentKey
//   source path     `src/data/posts/hello.json`           the collection's source (astro/repo.ts)
//   route pattern   `/[lang]/blog/[slug]`                 Astro
//   template id     `/blog/[slug]`                        templateId: the pattern without its locale
//   template key    `_gratis/templates/blog/[slug].html`  templateKey
//   page path       `/blog/hello`                         a page of routes.json (routes.ts)
//   page file       `blog/hello/index.html`               the build, or a route's binding
//
// Every name is a plain string; the aliases below only say which kind a string is. A key is an
// object's key in the bucket, which holds:
//
//   index.html, blog/hello/index.html, …   the site's pages
//   admin/                                 the admin SPA
//   _gratis/schema.json                    collections and route bindings (schema.ts)
//   _gratis/routes.json                    every page and what it read (routes.ts)
//   _gratis/templates/                     a template per route (template/)
//   _gratis/content/                       a JSON file per entry
//   _gratis/auth/<username>.json           an editor's encrypted keys (auth.ts)

/** An entry's name: its collection, and its id unless it's a single. */
export type EntryKey = string
/** The key of an object in the bucket. */
export type ObjectKey = string
/** A route pattern without its locale; a template is stored under it. */
export type TemplateId = string
/** A page's URL path, which names it in routes.json. */
export type PagePath = string

export const SCHEMA = '_gratis/schema.json'
export const ROUTES = '_gratis/routes.json'
export const CONTENT = '_gratis/content/'
export const TEMPLATES = '_gratis/templates/'
export const AUTH = '_gratis/auth/'

export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

export const entryKey = (collection: string, id?: string): EntryKey =>
  id == null ? collection : `${collection}/${id}`

export function parseKey(key: EntryKey): { collection: string; id?: string } {
  const slash = key.indexOf('/')
  return slash < 0
    ? { collection: key }
    : { collection: key.slice(0, slash), id: key.slice(slash + 1) }
}

/** Entry ids double as URL segments, so they are slugs. */
export const isEntryId = (id: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)

/** The content file of an entry. */
export const contentKey = (key: EntryKey): ObjectKey => `${CONTENT}${key}.json`

/** The entry key of a content file, or undefined for any other object. */
export const parseContentKey = (key: ObjectKey): EntryKey | undefined =>
  key.startsWith(CONTENT) && key.endsWith('.json')
    ? key.slice(CONTENT.length, -'.json'.length)
    : undefined

/** The folder a collection's entries are listed from. */
export const collectionFolder = (collection: string): ObjectKey =>
  `${CONTENT}${collection}/`

/** The ids in a listing of a collection's folder: its own JSON files, sorted. */
export const entryIds = (folder: ObjectKey, keys: ObjectKey[]) =>
  keys
    .map((key) => key.slice(folder.length))
    .filter((name) => /^[^/]+\.json$/.test(name))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()

/** The template id is the route pattern with the locale segment removed; `/` for the root. */
export const templateId = (pattern: string): TemplateId =>
  pattern.replace(/\/\[(\.\.\.)?lang\]/, '') || '/'

/** Where a template lives: `/` is index.html, `/blog/[slug]` is blog/[slug].html. */
export const templateKey = (id: TemplateId): ObjectKey =>
  `${TEMPLATES}${id === '/' ? 'index' : id.slice(1)}.html`
