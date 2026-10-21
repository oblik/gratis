import { decryptCredentials } from './auth.js';
import { createStorage, ConflictError } from './storage.js';
import { loadSite, saveEntry, renderPending } from './site.js';

const SESSION_KEY = 'gratis.session';
const $ = (selector) => document.querySelector(selector);
const status = (message, error = false) => {
  $('#status').textContent = message;
  $('#status').classList.toggle('error', error);
};
const readable = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

let site;

async function start(session) {
  status('Loading…');
  site = await loadSite(createStorage(session));
  $('#login').hidden = true;
  $('#editor').hidden = false;
  showCollections();
  const finished = await renderPending(site, { DOMParser }, (path) => status(`Finishing an interrupted save: ${path}`));
  status(finished.length ? `Finished an interrupted save (${finished.length} page(s)).` : '');
}

function showCollections() {
  const container = $('#collections');
  container.replaceChildren();
  for (const [name, collection] of Object.entries(site.schema.collections)) {
    if (!collection.single) continue;
    const form = document.createElement('form');
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = collection.label ?? readable(name);
    fieldset.append(legend);
    for (const [key, field] of Object.entries(collection.fields)) {
      const label = document.createElement('label');
      const input = document.createElement(field.multiline ? 'textarea' : 'input');
      input.name = key;
      input.value = site.content[name].fields[key] ?? '';
      label.append(field.label ?? readable(key), input);
      fieldset.append(label);
    }
    const button = document.createElement('button');
    button.textContent = 'Save';
    form.append(fieldset, button);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save(name, form, button);
    });
    container.append(form);
  }
}

async function save(name, form, button) {
  const fields = { ...site.content[name].fields, ...Object.fromEntries(new FormData(form)) };
  button.disabled = true;
  try {
    status('Saving…');
    const pages = await saveEntry(site, name, fields, { DOMParser }, (path) => status(`Rendered ${path}`));
    status(`Saved. ${pages.length} page(s) updated.`);
  } catch (error) {
    status(error instanceof ConflictError
      ? 'Someone else saved this in the meantime. Reload to see their version, then make your change again.'
      : `Save failed: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

$('#login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { username, password } = Object.fromEntries(new FormData(event.target));
  status('Unlocking…');
  const res = await fetch(`/_gratis/auth/${encodeURIComponent(username)}.json`, { cache: 'no-store' });
  if (!res.ok) return status('Wrong username or password.', true);
  const blob = await res.json();
  let keys;
  try {
    keys = await decryptCredentials(blob, password);
  } catch {
    return status('Wrong username or password.', true);
  }
  const session = { ...blob.storage, ...keys };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  start(session).catch((error) => status(`Couldn't load the site: ${error.message}`, true));
});

$('#logout').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

$('#rerender').addEventListener('click', async (event) => {
  event.target.disabled = true;
  try {
    const pages = await renderPending(site, { DOMParser, all: true }, (path) => status(`Rendered ${path}`));
    status(`Re-rendered ${pages.length} page(s).`);
  } catch (error) {
    status(`Re-render failed: ${error.message}`, true);
  } finally {
    event.target.disabled = false;
  }
});

const saved = sessionStorage.getItem(SESSION_KEY);
if (saved) {
  start(JSON.parse(saved)).catch((error) => {
    $('#login').hidden = false;
    status(`Couldn't load the site: ${error.message}`, true);
  });
} else {
  $('#login').hidden = false;
}

// WebCrypto, which both unlocking and request signing need, exists only on HTTPS.
if (!crypto.subtle) {
  $('#login').hidden = true;
  status('The admin needs HTTPS. Open it through the site’s https:// address.', true);
}
