const readable = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

// schema.json: what the admin renders its forms from and where each collection is stored.
export function compileSchema(collections) {
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
