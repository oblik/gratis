// Loading the site and saving an entry, per docs/edit-flow.md. No DOM UI here: `DOMParser` is
// passed in so this runs in the browser and in Node alike.

import { render } from '../renderer/index.js';
import { templateFile } from '../renderer/paths.js';

const json = (value) => JSON.stringify(value, null, 2) + '\n';
const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json';

export async function loadSite(storage) {
  const schema = JSON.parse((await storage.get('_gratis/schema.json')).text);
  const routes = await storage.get('_gratis/routes.json');
  const content = {};
  await Promise.all(Object.entries(schema.collections).map(async ([name, collection]) => {
    const file = await storage.get(`_gratis/content/${collection.storage.path}`);
    content[name] = { fields: file ? JSON.parse(file.text) : {}, etag: file?.etag };
  }));
  return { storage, schema, routes: { data: JSON.parse(routes.text), etag: routes.etag }, content, templates: new Map() };
}

async function template(site, id) {
  if (!site.templates.has(id)) site.templates.set(id, (await site.storage.get(`_gratis/templates/${templateFile(id)}`)).text);
  return site.templates.get(id);
}

/** Renders and writes the given pages, recording their new dependencies in site.routes. */
export async function renderPages(site, paths, { DOMParser }, onPage = () => {}) {
  const content = Object.fromEntries(Object.entries(site.content).map(([key, { fields }]) => [key, fields]));
  for (const path of paths) {
    const page = site.routes.data.pages[path];
    const { html, deps } = render(await template(site, page.template), { content }, { DOMParser });
    await site.storage.put(page.file, html, { type: HTML });
    Object.assign(page, { deps, updated: new Date().toISOString() });
    onPage(path);
  }
}

async function writeRoutes(site, pending) {
  site.routes.data._pending = pending;
  site.routes.etag = await site.storage.put('_gratis/routes.json', json(site.routes.data), { type: JSON_TYPE, ifMatch: site.routes.etag });
}

/** Saves a single's fields, then re-renders every page that depends on it. Content before HTML. */
export async function saveEntry(site, key, fields, { DOMParser }, onPage) {
  const affected = Object.keys(site.routes.data.pages).filter((path) => site.routes.data.pages[path].deps.entries.includes(key));
  const pending = [...new Set([...site.routes.data._pending, ...affected])];
  await writeRoutes(site, pending);

  const entry = site.content[key];
  entry.etag = await site.storage.put(`_gratis/content/${site.schema.collections[key].storage.path}`, json(fields), { type: JSON_TYPE, ifMatch: entry.etag });
  entry.fields = fields;

  await renderPages(site, pending, { DOMParser }, onPage);
  await writeRoutes(site, []);
  return pending;
}

/** Finishes an interrupted save, or regenerates every page when `all` is set. */
export async function renderPending(site, { DOMParser, all = false }, onPage) {
  const paths = all ? Object.keys(site.routes.data.pages) : site.routes.data._pending;
  if (!paths.length) return [];
  await writeRoutes(site, paths);
  await renderPages(site, paths, { DOMParser }, onPage);
  await writeRoutes(site, []);
  return paths;
}
