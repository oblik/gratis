import type { Field, RouteBinding, Schema } from '../admin/site.ts'

/** A field as declared in the content config; schema.json fills in the label. */
export type FieldConfig = Field extends infer F
  ? F extends Field
    ? Omit<F, 'label'> & { label?: string }
    : never
  : never
/** A collection as its loader records it: a single's file, or a folder of one JSON file per entry. */
export interface CollectionConfig {
  single: boolean
  fields: Record<string, FieldConfig>
  storage: { file: string } | { folder: string }
}

const readable = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

// schema.json: what the admin renders its forms from, where each collection is stored and which
// dynamic routes are bound to which collection.
export function compileSchema(
  collections: Record<string, CollectionConfig>,
  routes: Record<string, RouteBinding> = {},
): Schema {
  return {
    collections: Object.fromEntries(
      Object.entries(collections).map(([name, { single, fields, storage }]) => [
        name,
        {
          single,
          storage:
            'file' in storage
              ? { path: `${name}.json`, source: storage.file }
              : {
                  path: `${name}/`,
                  source: storage.folder.replace(/\/?$/, '/'),
                },
          fields: Object.fromEntries(
            Object.entries(fields).map(([key, { label, ...field }]) => [
              key,
              JSON.parse(
                JSON.stringify({ ...field, label: label ?? readable(key) }),
              ),
            ]),
          ),
        },
      ]),
    ),
    routes,
  }
}
