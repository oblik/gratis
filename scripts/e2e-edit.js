// The admin's save path end to end against the live bucket, minus the form: log in with the
// published blob, save the `site` single, check the website, then check a stale save conflicts.
// Restores the original title at the end.

import { JSDOM } from 'jsdom';
import { decryptCredentials } from '../packages/gratis/src/admin/auth.js';
import { createStorage, ConflictError } from '../packages/gratis/src/admin/storage.js';
import { loadSite, saveEntry } from '../packages/gratis/src/admin/site.js';
import { websiteOrigin } from './config.js';

const origin = process.argv[2] ?? websiteOrigin;
const { DOMParser } = new JSDOM('').window;

const blob = await (await fetch(`${origin}/_gratis/auth/admin.json`)).json();
const keys = await decryptCredentials(blob, process.env.GRATIS_EDITOR_PASSWORD);
const storage = createStorage({ ...blob.storage, ...keys });

const site = await loadSite(storage);
const original = site.content.site.fields.title;
const title = `Edited ${new Date().toISOString()}`;

const pages = await saveEntry(site, 'site', { title }, { DOMParser });
const html = await (await fetch(`${origin}/`, { cache: 'no-store' })).text();
console.log('rendered', pages, '| live page shows the edit:', html.includes(`<h1>${title}</h1>`) && html.includes(`<title>${title}</title>`));

const stale = await loadSite(storage);
stale.content.site.etag = '"0000"';
await saveEntry(stale, 'site', { title: 'lost' }, { DOMParser }).then(
  () => console.log('stale save: NOT rejected'),
  (e) => console.log('stale save rejected:', e instanceof ConflictError),
);

const fresh = await loadSite(storage);
await saveEntry(fresh, 'site', { title: original }, { DOMParser });
console.log('restored', JSON.stringify(original), '| routes pending:', fresh.routes.data._pending);
