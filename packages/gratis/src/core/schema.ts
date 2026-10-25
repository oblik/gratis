// The shape of _gratis/schema.json: the collections the admin edits, their fields, where their
// files are in the repo, and which dynamic routes are bound to which collection. The build compiles
// it from the content config (see notes/content.md).

export interface TextField {
  type: 'text'
  label: string
  localized?: boolean
  multiline?: boolean
}
export interface BooleanField {
  type: 'boolean'
  label: string
}
export type Field = TextField | BooleanField

/** An entry's fields, by name. */
export type Fields = Record<string, unknown>

export interface Collection {
  single: boolean
  label: string
  /** In the repo: a single's file, or a folder (ending in `/`) with one JSON file per entry. */
  source: string
  fields: Record<string, Field>
}

/** A dynamic route bound to a collection: one page per entry, the entry id in `param`. */
export interface RouteBinding {
  collection: string
  param: string
  /** The object key of the page, with `[param]` where the id goes. */
  file: string
}

export interface Schema {
  collections: Record<string, Collection>
  routes: Record<string, RouteBinding>
}

/** The repo path of an entry's file: the single's file, or `<id>.json` in the collection's folder. */
export const sourcePath = ({ single, source }: Collection, id?: string) =>
  single ? source : `${source}${id}.json`

/** A new entry's fields: every field present, so the build's schema accepts it. */
export const emptyFields = ({ fields }: Collection): Fields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      field.type === 'boolean' ? false : '',
    ]),
  )

/** Checks a draft against the collection's fields. Errors are keyed by field name. */
export function validate(
  { fields }: Collection,
  draft: Fields,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [key, field] of Object.entries(fields)) {
    const value = draft[key]
    if (field.type === 'text') {
      if (value != null && typeof value !== 'string')
        errors[key] = 'Must be text.'
      else if (
        !field.multiline &&
        typeof value === 'string' &&
        value.includes('\n')
      )
        errors[key] = 'Must be a single line.'
    } else if (field.type === 'boolean') {
      if (value != null && typeof value !== 'boolean')
        errors[key] = 'Must be on or off.'
    }
  }
  return errors
}

/** Structural equality of field values. */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null)
    return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) =>
    equal(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  )
}
