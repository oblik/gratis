import { mkdir, copyFile, cp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { isTemplateMode, state } from './mode.js';
import { render } from '../renderer/index.js';
import { templateId, templateFile } from '../renderer/paths.js';

const adminDist = new URL('../../dist/admin/', import.meta.url);
const readable = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const json = (value) => JSON.stringify(value, null, 2) + '\n';

async function write(url, text) {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  await writeFile(url, text);
}

// schema.json: what the admin renders its forms from and where each collection is stored.
function compileSchema(collections) {
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

export default function gratis() {
  let root;
  return {
    name: 'gratis',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        root = config.root;
        // The getters import astro:content lazily, so Vite has to process the package.
        updateConfig({ vite: { ssr: { noExternal: ['gratis'] } } });
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
            root,
            outDir: fileURLToPath(scratch),
            cacheDir: fileURLToPath(new URL('node_modules/.astro/gratis/', root)),
            logLevel: 'warn',
          });
        } finally {
          delete process.env.GRATIS_MODE;
        }

        // 2. Templates, by template id.
        const templates = new URL('_gratis/templates/', dir);
        await rm(templates, { recursive: true, force: true });
        for (const [pattern, [url]] of state().templateRoutes) {
          await write(new URL(templateFile(templateId(pattern)), templates), await readFile(url));
        }

        // 3. schema.json.
        const { collections } = state();
        await write(new URL('_gratis/schema.json', dir), json(compileSchema(collections)));

        // 4. routes.json, from rendering every page with the Node renderer. A page that renders
        // differently from the real build derives something from a read the editor can't reproduce.
        const content = {};
        for (const [name, { storage }] of Object.entries(collections)) {
          content[name] = JSON.parse(await readFile(new URL(storage.file, root), 'utf8'));
        }
        const { DOMParser } = new JSDOM('').window;
        const normalize = (html) => render(html, { content: {} }, { DOMParser }).html;
        const pages = {};
        const updated = new Date().toISOString();
        for (const [pattern, urls] of assets) {
          if (pattern.includes('[')) {
            logger.warn(`${pattern}: dynamic routes aren't supported yet; it won't be editable`);
            continue;
          }
          const id = templateId(pattern);
          const template = await readFile(new URL(templateFile(id), templates), 'utf8');
          const { html, deps } = render(template, { content }, { DOMParser });
          if (html !== normalize(await readFile(urls[0], 'utf8'))) {
            logger.warn(`${pattern}: rendering the template doesn't reproduce the built page; edits to it may differ from a build`);
          }
          pages[pattern] = { template: id, file: relative(fileURLToPath(dir), fileURLToPath(urls[0])), deps, updated };
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
          const target = new URL(`_gratis/content/${name}.json`, dir);
          await mkdir(dirname(fileURLToPath(target)), { recursive: true });
          await copyFile(new URL(storage.file, root), target);
        }

        logger.info(`${state().templateRoutes.size} template(s), ${Object.keys(pages).length} page(s)`);
      },
    },
  };
}
