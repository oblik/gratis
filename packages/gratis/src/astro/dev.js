// The emulator's backend in `astro dev`: entries are the loaders' files, the schema is compiled
// from the content config on each read, and the admin is served from the package's build. No page
// is listed in routes.json, so a save writes only the entry and Astro re-renders on its own.

import { readFile, writeFile } from 'node:fs/promises';
import { memoryBackend } from '../emulator/index.ts';
import { state } from './mode.js';
import { compileSchema } from './schema.js';

const ROUTES = '_gratis/routes.json';
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const encode = (text) => new TextEncoder().encode(text);

// Tells the admin to skip the login and use this origin as its endpoint (see admin/session.ts).
const LOCAL_META = '<meta name="gratis-storage" content="local">';

export function devBackend({ root, adminDist }) {
  const memory = memoryBackend({ [ROUTES]: json({ pages: {}, _pending: [] }) });
  const schema = () => compileSchema(state().collections);
  const sourceOf = (key) => {
    const collection = Object.values(schema().collections).find(({ storage }) => key === `_gratis/content/${storage.path}`);
    return collection && new URL(collection.storage.source, root);
  };
  const orNull = (promise) => promise.catch((error) => (error.code === 'ENOENT' || error.code === 'EISDIR' ? null : Promise.reject(error)));

  return {
    async read(key) {
      if (key === '_gratis/schema.json') return encode(json(schema()));
      if (key === ROUTES) return memory.read(key);
      const source = sourceOf(key);
      if (source) return orNull(readFile(source));
      if (key === 'admin/index.html') {
        const html = await orNull(readFile(new URL('index.html', adminDist), 'utf8'));
        return html && encode(html.replace('<head>', `<head>\n  ${LOCAL_META}`));
      }
      if (key.startsWith('admin/')) return orNull(readFile(new URL(key.slice('admin/'.length), adminDist)));
      return null;
    },
    async write(key, body) {
      if (key === ROUTES) return memory.write(key, body);
      const source = sourceOf(key);
      if (source) return writeFile(source, body);
      // Page writes: nothing to do, Astro renders the pages in dev.
    },
    async remove(key) {
      const source = sourceOf(key);
      if (source) throw new Error(`deleting ${key} in dev isn't supported`);
      return memory.remove(key);
    },
  };
}
