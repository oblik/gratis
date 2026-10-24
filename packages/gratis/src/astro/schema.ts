import type { Field, Schema } from '../admin/site.ts';

/** A field as declared in the content config; schema.json fills in the label. */
export type FieldConfig = Omit<Field, 'label'> & { label?: string };
/** A collection as its loader records it. */
export interface CollectionConfig { single: boolean; fields: Record<string, FieldConfig>; storage: { file: string } }

const readable = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

// schema.json: what the admin renders its forms from and where each collection is stored.
export function compileSchema(collections: Record<string, CollectionConfig>): Schema {
  return {
    collections: Object.fromEntries(Object.entries(collections).map(([name, { single, fields, storage }]) => [name, {
      single,
      storage: { path: `${name}.json`, source: storage.file },
      fields: Object.fromEntries(Object.entries(fields).map(([key, { label, ...field }]) => [
        key,
        JSON.parse(JSON.stringify({ ...field, label: label ?? readable(key) })),
      ])),
    }])),
  };
}
