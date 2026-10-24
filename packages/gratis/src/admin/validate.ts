// Checks a draft against the collection's fields in schema.json. Errors are keyed by field path.

import type { Collection } from './site.ts';
import { getAt, pathKey } from './path.ts';

export function validate({ fields }: Collection, draft: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = getAt(draft, [key]);
    if (field.type === 'text') {
      if (value != null && typeof value !== 'string') errors[pathKey([key])] = 'Must be text.';
      else if (!field.multiline && typeof value === 'string' && value.includes('\n')) errors[pathKey([key])] = 'Must be a single line.';
    }
  }
  return errors;
}
