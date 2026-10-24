import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'astro/zod';
import type { Loader } from 'astro/loaders';
import type { CollectionEntry, CollectionKey } from 'astro:content';
import { isTemplateMode, state, sentinel } from './mode.ts';
import type { FieldConfig } from './schema.ts';
export { default as Each } from './Each.astro';
export { default as If } from './If.astro';

const fieldSchemas = {
  text: () => z.string(),
};

export const text = ({ label, localized, multiline }: { label?: string; localized?: boolean; multiline?: boolean } = {}): FieldConfig =>
  ({ type: 'text', label, localized, multiline });

export const file = (path: string) => ({ kind: 'file' as const, path });

// The zod schema of each field, so entries are typed per field rather than as a record.
type Shape<F extends Record<string, FieldConfig>> = { [K in keyof F]: ReturnType<(typeof fieldSchemas)[F[K]['type']]> };

export function defineCollection<F extends Record<string, FieldConfig>>({ single = false, loader, schema: fields }: {
  single?: boolean;
  loader: ReturnType<typeof file>;
  schema: F;
}) {
  if (!single) throw new Error('gratis: only singles are supported so far');
  if (loader?.kind !== 'file') throw new Error('gratis: a single needs file()');

  // In template mode the entry holds sentinels, so every field accepts anything. The type is the
  // real one either way: pages are written against real entries.
  const schema = (isTemplateMode()
    ? z.object(Object.fromEntries(Object.keys(fields).map((k) => [k, z.any()])))
    : z.object(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, fieldSchemas[f.type]()])))) as unknown as z.ZodObject<Shape<F>>;

  return {
    // What Astro's own defineCollection sets for a collection with a loader.
    type: 'content_layer' as const,
    schema,
    loader: {
      name: 'gratis',
      async load({ collection, store, parseData, config, watcher }) {
        state().collections[collection] = { single, fields, storage: { file: loader.path } };
        const path = fileURLToPath(new URL(loader.path, config.root));
        const sync = async () => {
          const data = isTemplateMode()
            ? Object.fromEntries(Object.keys(fields).map((k) => [k, sentinel('entry', collection, k)]))
            : JSON.parse(await readFile(path, 'utf8'));
          store.clear();
          store.set({ id: collection, data: await parseData({ id: collection, data }) });
        };
        await sync();
        // In dev, an admin save (or a hand edit) rewrites the file; reload it like Astro's file() does.
        watcher?.add(path);
        watcher?.on('change', (changed) => changed === path && sync());
      },
    } satisfies Loader,
  };
}

// Typed by the site's generated astro:content: `collection` is one of its collections and the
// entry has its fields.
export async function getEntry<C extends CollectionKey>(collection: C, id?: string): Promise<{ id: string; collection: C } & CollectionEntry<C>['data']> {
  const { getEntry } = await import('astro:content');
  const entry = await getEntry(collection, id ?? collection);
  if (!entry) throw new Error(`gratis: no entry ${id ?? collection} in ${collection}`);
  return { id: entry.id, collection, ...entry.data };
}
