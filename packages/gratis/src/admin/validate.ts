// Checks a draft against the collection's fields in schema.json. Errors are keyed by field path.

import { getAt, pathKey } from './path.ts'
import type { Collection } from './site.ts'

export function validate(
  { fields }: Collection,
  draft: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [key, field] of Object.entries(fields)) {
    const value = getAt(draft, [key])
    if (field.type === 'text') {
      if (value != null && typeof value !== 'string')
        errors[pathKey([key])] = 'Must be text.'
      else if (
        !field.multiline &&
        typeof value === 'string' &&
        value.includes('\n')
      )
        errors[pathKey([key])] = 'Must be a single line.'
    } else if (field.type === 'boolean') {
      if (value != null && typeof value !== 'boolean')
        errors[pathKey([key])] = 'Must be on or off.'
    }
  }
  return errors
}
