// The emulator's backend in `astro dev`: entries are the loaders' files, the schema is compiled
// from the content config on each read, and the admin is served from the package's build. No page
// is listed in routes.json, so a save writes only the entry and Astro re-renders on its own.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { memoryBackend, type Backend } from '../emulator/index.ts';
import { state } from './mode.ts';
import { compileSchema } from './schema.ts';

const ROUTES = '_gratis/routes.json';
const CONTENT = '_gratis/content/';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const encode = (text: string) => new TextEncoder().encode(text);

// Tells the admin to skip the login and use this origin as its endpoint (see admin/session.ts).
const LOCAL_META = '<meta name="gratis-storage" content="local">';

export function devBackend({ root, adminDist }: { root: URL; adminDist: URL }): Backend {
  const memory = memoryBackend({ [ROUTES]: json({ pages: {}, _pending: [] }) });
  const schema = () => compileSchema(state().collections);
  // The repo file behind a content key: a single's file, or an entry's file in its collection's folder.
  const sourceOf = (key: string) => {
    if (!key.startsWith(CONTENT)) return undefined;
    const path = key.slice(CONTENT.length);
    for (const { storage } of Object.values(schema().collections)) {
      if (path === storage.path) return new URL(storage.source, root);
      const id = path.startsWith(storage.path) && storage.path.endsWith('/') && path.slice(storage.path.length);
      if (id && /^[^/]+\.json$/.test(id)) return new URL(storage.source + id, root);
    }
    return undefined;
  };
  const orNull = <T>(promise: Promise<T>) =>
    promise.catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' || error.code === 'EISDIR' ? null : Promise.reject(error)));

  return {
    async read(key) {
      if (key === '_gratis/schema.json') return encode(json(schema()));
      if (key === ROUTES) return memory.read(key);
      const source = sourceOf(key);
      if (source) return orNull(readFile(source));
      if (key === 'admin/index.html') {
        const html = await orNull(readFile(new URL('index.html', adminDist), 'utf8'));
        return html == null ? null : encode(html.replace('<head>', `<head>\n  ${LOCAL_META}`));
      }
      if (key.startsWith('admin/')) return orNull(readFile(new URL(key.slice('admin/'.length), adminDist)));
      return null;
    },
    async write(key, body) {
      if (key === ROUTES) return memory.write(key, body);
      const source = sourceOf(key);
      if (source) {
        await mkdir(new URL('.', source), { recursive: true });
        return writeFile(source, body);
      }
      // Page writes: nothing to do, Astro renders the pages in dev.
    },
    async remove(key) {
      const source = sourceOf(key);
      if (source) return rm(source, { force: true });
      return memory.remove(key);
    },
    // Only collection folders are listed: the admin lists nothing else.
    async list(prefix) {
      const keys: string[] = [];
      for (const { storage } of Object.values(schema().collections)) {
        const folder = CONTENT + storage.path;
        if (!storage.path.endsWith('/') || !(folder.startsWith(prefix) || prefix.startsWith(folder))) continue;
        const names = (await orNull(readdir(new URL(storage.source, root)))) ?? [];
        keys.push(...names.filter((name) => name.endsWith('.json')).map((name) => folder + name).filter((key) => key.startsWith(prefix)));
      }
      return keys.sort();
    },
  };
}
