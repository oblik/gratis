// The kinds of names, all plain strings:
//
//   collection      `posts`
//   entry id        `hello`
//   entry key       `site` (a single), `posts/hello`
//   content key     `_gratis/content/posts/hello.json`
//   source path     `src/data/posts/hello.json`, in the repo (astro/repo.ts)
//   route pattern   `/[lang]/blog/[slug]`, from Astro
//   template id     `/blog/[slug]`
//   template key    `_gratis/templates/blog/[slug].html`
//   page path       `/blog/hello`, which names a page in routes.json
//   page file       `blog/hello/index.html`

export type EntryKey = string
export type ObjectKey = string
export type TemplateId = string
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

export const contentKey = (key: EntryKey): ObjectKey => `${CONTENT}${key}.json`

export const parseContentKey = (key: ObjectKey): EntryKey | undefined =>
  key.startsWith(CONTENT) && key.endsWith('.json')
    ? key.slice(CONTENT.length, -'.json'.length)
    : undefined

export const collectionFolder = (collection: string): ObjectKey =>
  `${CONTENT}${collection}/`

export const entryIds = (folder: ObjectKey, keys: ObjectKey[]) =>
  keys
    .map((key) => key.slice(folder.length))
    .filter((name) => /^[^/]+\.json$/.test(name))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()

/** `/[lang]/blog/[slug]` is `/blog/[slug]`, and `/[lang]` is `/`. */
export const templateId = (pattern: string): TemplateId =>
  pattern.replace(/\/\[(\.\.\.)?lang\]/, '') || '/'

/** `/` is index.html, `/blog/[slug]` is blog/[slug].html. */
export const templateKey = (id: TemplateId): ObjectKey =>
  `${TEMPLATES}${id === '/' ? 'index' : id.slice(1)}.html`
