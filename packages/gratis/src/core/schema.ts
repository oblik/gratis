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

export type Fields = Record<string, unknown>

export interface Collection {
  single: boolean
  label: string
  /**
   * In the repo: a single's file, or a folder (ending in `/`) with one JSON
   * file per entry.
   */
  source: string
  fields: Record<string, Field>
}

/**
 * A dynamic route bound to a collection: one page per entry, the entry id in
 * `param`.
 */
export interface RouteBinding {
  collection: string
  param: string
  /** The object key of the page, with `[param]` where the id goes. */
  file: string
}

export interface Schema {
  collections: Record<string, Collection>
  /**
   * How to make the page for a new entry, by template. Static routes have none:
   * their pages already exist, in routes.json.
   */
  bindings: Record<string, RouteBinding>
}

/** Every field is present, so the build's schema accepts the new entry. */
export const emptyFields = ({ fields }: Collection): Fields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      field.type === 'boolean' ? false : '',
    ]),
  )

/** Errors by field name. */
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

export const changedFields = (before: Fields, after: Fields) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (field) => !equal(before[field], after[field]),
  )

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
