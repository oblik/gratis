// The field builders of the content config (notes/content.md), and the zod schema of each field,
// so `astro check` and Astro's generated types keep working.

import { z } from 'astro/zod'

import type { Field } from '../core/schema.ts'

/** A field as declared in the config: the label is optional and defaults to the field's name. */
export type FieldConfig = Field extends infer F
  ? F extends Field
    ? Omit<F, 'label'> & { label?: string }
    : never
  : never

export const text = ({
  label,
  localized,
  multiline,
}: {
  label?: string
  localized?: boolean
  multiline?: boolean
} = {}): FieldConfig => ({ type: 'text', label, localized, multiline })

export const boolean = ({ label }: { label?: string } = {}): FieldConfig => ({
  type: 'boolean',
  label,
})

export const zodSchemas = {
  text: () => z.string(),
  boolean: () => z.boolean(),
}

/** The zod schema of each field, so entries are typed per field rather than as a record. */
export type Shape<F extends Record<string, FieldConfig>> = {
  [K in keyof F]: ReturnType<(typeof zodSchemas)[F[K]['type']]>
}
