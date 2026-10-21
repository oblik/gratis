import { readFile } from 'node:fs/promises';
import { z } from 'astro/zod';
import { isTemplateMode, state, sentinel } from './mode.js';
export { default as Each } from './Each.astro';
export { default as If } from './If.astro';

const fieldSchemas = {
  text: () => z.string(),
};

export const text = ({ label, localized, multiline } = {}) => ({ type: 'text', label, localized, multiline });

export const file = (path) => ({ kind: 'file', path });

export function defineCollection({ single = false, loader, schema: fields }) {
  if (!single) throw new Error('gratis: only singles are supported so far');
  if (loader?.kind !== 'file') throw new Error('gratis: a single needs file()');

  // In template mode the entry holds sentinels, so every field accepts anything.
  const schema = isTemplateMode()
    ? z.object(Object.fromEntries(Object.keys(fields).map((k) => [k, z.any()])))
    : z.object(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, fieldSchemas[f.type]()])));

  return {
    // What Astro's own defineCollection sets for a collection with a loader.
    type: 'content_layer',
    schema,
    loader: {
      name: 'gratis',
      async load({ collection, store, parseData, config }) {
        state().collections[collection] = { single, fields, storage: { file: loader.path } };
        store.clear();
        const data = isTemplateMode()
          ? Object.fromEntries(Object.keys(fields).map((k) => [k, sentinel('entry', collection, k)]))
          : JSON.parse(await readFile(new URL(loader.path, config.root), 'utf8'));
        store.set({ id: collection, data: await parseData({ id: collection, data }) });
      },
    },
  };
}

export async function getEntry(collection, id = collection) {
  const { getEntry } = await import('astro:content');
  const entry = await getEntry(collection, id);
  return entry && { id: entry.id, collection, ...entry.data };
}
