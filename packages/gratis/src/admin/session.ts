// The editor's session: the decrypted keys in sessionStorage, and the site loaded with them.

import { decryptCredentials, type AuthBlob } from './auth.ts';
import { createCache, createStorage, type Session } from './storage.ts';
import { loadSite, renderPending, type Site } from './site.ts';

const SESSION_KEY = 'gratis.session';

export class LoginError extends Error {}

export interface Opened {
  site: Site;
  /** Pages of an interrupted save that opening the site finished rendering. */
  finished: string[];
}

let opened: Promise<Opened> | null = null;

export const hasSession = () => sessionStorage.getItem(SESSION_KEY) != null;

/** Loads the site once per session, finishing any interrupted save. Null when logged out. */
export function openSite(): Promise<Opened> | null {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  opened ??= (async () => {
    const site = await loadSite(createCache(createStorage(JSON.parse(saved) as Session)));
    return { site, finished: await renderPending(site, { DOMParser }) };
  })();
  opened.catch(() => (opened = null));
  return opened;
}

export async function logIn(username: string, password: string) {
  const res = await fetch(`/_gratis/auth/${encodeURIComponent(username)}.json`, { cache: 'no-store' });
  if (!res.ok) throw new LoginError('Wrong username or password.');
  const blob: AuthBlob = await res.json();
  let keys;
  try {
    keys = await decryptCredentials(blob, password);
  } catch {
    throw new LoginError('Wrong username or password.');
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...blob.storage, ...keys } satisfies Session));
}

export function logOut() {
  sessionStorage.removeItem(SESSION_KEY);
  opened = null;
}
