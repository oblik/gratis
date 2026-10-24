import { mkdir, copyFile, cp, rm, readdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import type { AstroIntegration } from 'astro';
import { isTemplateMode, state, PLACEHOLDER_ID } from './mode.ts';
import { render, type Content, type Deps } from '../renderer/index.ts';
import { templateId, templateFile } from '../renderer/paths.ts';
import { compileSchema, type CollectionConfig } from './schema.ts';
import type { RouteBinding } from '../admin/site.ts';
import { devBackend } from './dev.ts';
import { createEmulator } from '../emulator/index.ts';

const adminDist = new URL('../../dist/admin/', import.meta.url);
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

async function write(url: URL, text: string | Uint8Array) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  await writeFile(url, text);
}

// The ids of a collection's entries, its folder's JSON files, and where each one is.
async function entryIds(root: URL, storage: CollectionConfig['storage']) {
  if (!('folder' in storage)) return [];
  const names = await readdir(new URL(storage.folder, root)).catch(() => []);
  return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).sort();
}
const entryFile = (root: URL, storage: CollectionConfig['storage'], id: string) =>
  new URL('file' in storage ? storage.file : `${storage.folder.replace(/\/?$/, '/')}${id}.json`, root);

export default function gratis(): AstroIntegration {
  let root: URL;
  return {
    name: 'gratis',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        root = config.root;
        // The getters import astro:content lazily, so Vite has to process the package.
        updateConfig({ vite: { ssr: { noExternal: ['gratis'] } } });
      },
      // The admin at /admin/ and the storage emulator over the content files, on the dev server's origin.
      'astro:server:setup': async ({ server, logger }) => {
        await access(adminDist).catch(() => logger.warn('the admin SPA is not built; run `pnpm build` in packages/gratis'));
        const handle = createEmulator(devBackend({ root, adminDist }), { website: true });
        server.middlewares.use((req, res, next) => {
          const [path, query = ''] = req.url!.split('?');
          // ListObjectsV2 goes to the path-style endpoint's root, which is the site's `/` here.
          const list = path === '/' && new URLSearchParams(query).get('list-type') === '2';
          if (list || path.startsWith('/_gratis/') || path === '/admin' || path.startsWith('/admin/')) return handle(req, res, next);
          next();
        });
      },
      'astro:build:done': async ({ dir, assets, logger }) => {
        if (isTemplateMode()) {
          state().templateRoutes = assets;
          return;
        }

        // 1. The template pass.
        const scratch = new URL('.gratis/', root);
        process.env.GRATIS_MODE = 'template';
        try {
          const { build } = await import('astro');
          await build({
            root: fileURLToPath(root),
            outDir: fileURLToPath(scratch),
            cacheDir: fileURLToPath(new URL('node_modules/.astro/gratis/', root)),
            logLevel: 'warn',
          });
        } finally {
          delete process.env.GRATIS_MODE;
        }

        // 2. Templates, by template id. A dynamic route was built once, at its collection's
        // placeholder id, which binds the route to that collection.
        const templates = new URL('_gratis/templates/', dir);
        await rm(templates, { recursive: true, force: true });
        const bindings: Record<string, RouteBinding> = {};
        for (const [pattern, [url]] of state().templateRoutes!) {
          const id = templateId(pattern);
          await write(new URL(templateFile(id), templates), await readFile(url));
          const file = relative(fileURLToPath(scratch), fileURLToPath(url)).split('\\').join('/');
          const collection = file.match(PLACEHOLDER_ID)?.[1];
          const param = id.match(/\[(\w+)\]/)?.[1];
          if (collection && param) bindings[id] = { collection, param, file: file.replace(PLACEHOLDER_ID, `[${param}]`) };
        }

        // 3. schema.json.
        const { collections } = state();
        await write(new URL('_gratis/schema.json', dir), json(compileSchema(collections, bindings)));

        // 4. routes.json, from rendering every page with the Node renderer. A page that renders
        // differently from the real build derives something from a read the editor can't reproduce.
        const content: Content = {};
        const ids: Record<string, string[]> = {};
        for (const [name, { storage }] of Object.entries(collections)) {
          if ('file' in storage) content[name] = JSON.parse(await readFile(new URL(storage.file, root), 'utf8'));
          ids[name] = await entryIds(root, storage);
          for (const id of ids[name]) content[`${name}/${id}`] = JSON.parse(await readFile(entryFile(root, storage, id), 'utf8'));
        }
        const { DOMParser } = new JSDOM('').window;
        const normalize = (html: string) => render(html, { content: {} }, { DOMParser }).html;
        const pages: Record<string, { template: string; file: string; entry?: string; deps: Deps; updated: string }> = {};
        const updated = new Date().toISOString();
        const add = async (path: string, template: string, file: string, entry?: string) => {
          const { html, deps } = render(await readFile(new URL(templateFile(template), templates), 'utf8'), { content, entry }, { DOMParser });
          const built = await readFile(new URL(file, dir), 'utf8').catch(() => null);
          if (built == null) logger.warn(`${path}: the build has no ${file}`);
          else if (html !== normalize(built)) {
            logger.warn(`${path}: rendering the template doesn't reproduce the built page; edits to it may differ from a build`);
          }
          pages[path] = { template, file, ...(entry && { entry }), deps, updated };
        };
        for (const [pattern, urls] of assets) {
          const id = templateId(pattern);
          const binding = bindings[id];
          if (binding) {
            for (const entry of ids[binding.collection]) {
              const at = (s: string) => s.replace(`[${binding.param}]`, entry);
              await add(at(id), id, at(binding.file), `${binding.collection}/${entry}`);
            }
          } else if (pattern.includes('[')) {
            logger.warn(`${pattern}: only dynamic routes over a Gratis collection's ids are supported; it won't be editable`);
          } else {
            await add(pattern, id, relative(fileURLToPath(dir), fileURLToPath(urls[0])));
          }
        }
        await write(new URL('_gratis/routes.json', dir), json({ pages, _pending: [] }));

        // 5. The admin SPA.
        try {
          await access(adminDist);
          await cp(adminDist, new URL('admin/', dir), { recursive: true });
        } catch {
          logger.warn('the admin SPA is not built; run `pnpm build` in packages/gratis');
        }

        // 6. Content files in the bucket layout, so dist/ is a complete site.
        for (const [name, { storage }] of Object.entries(collections)) {
          if ('file' in storage) {
            await mkdir(new URL('_gratis/content/', dir), { recursive: true });
            await copyFile(new URL(storage.file, root), new URL(`_gratis/content/${name}.json`, dir));
          }
          for (const id of ids[name]) {
            await write(new URL(`_gratis/content/${name}/${id}.json`, dir), await readFile(entryFile(root, storage, id)));
          }
        }

        logger.info(`${state().templateRoutes!.size} template(s), ${Object.keys(pages).length} page(s)`);
      },
    },
  };
}
