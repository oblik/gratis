import { useState } from 'react';
import { getRouteApi, Link, Outlet, type ErrorComponentProps } from '@tanstack/react-router';
import { renderPending } from '../site.ts';
import { isLocal, logOut } from '../session.ts';
import { Button } from '../ui/Button.tsx';
import { ExternalIcon } from '../ui/icons.tsx';
import { Status, type StatusMessage } from '../ui/Status.tsx';

const route = getRouteApi('/_app');

function logOutAndReload() {
  logOut();
  location.replace(location.pathname);
}

export function Layout() {
  const { site, finished } = route.useRouteContext();
  const [message, setMessage] = useState<StatusMessage | null>(
    finished.length ? { text: `Finished an interrupted save (${finished.length} page(s)).` } : null,
  );
  const [busy, setBusy] = useState(false);

  async function rerender() {
    setBusy(true);
    try {
      const pages = await renderPending(site, { DOMParser, all: true }, (path) => setMessage({ text: `Rendered ${path}` }));
      setMessage({ text: `Re-rendered ${pages.length} page(s).` });
    } catch (error) {
      setMessage({ text: `Re-render failed: ${(error as Error).message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
        <Link to="/" className="mr-auto text-xl font-semibold">Gratis</Link>
        <a href="/" target="_blank" className="inline-flex items-center gap-1 hover:underline">View site <ExternalIcon /></a>
        {!isLocal() && <Button onClick={rerender} disabled={busy}>Re-render everything</Button>}
        {isLocal()
          ? <span className="rounded-md bg-amber-100 px-2 py-1 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100" title="Saves write the content files in this project">Local</span>
          : <Button onClick={logOutAndReload}>Log out</Button>}
      </header>
      <Status message={message} />
      <Outlet />
    </>
  );
}

export function SiteError({ error }: ErrorComponentProps) {
  return (
    <div className="grid justify-items-start gap-3">
      <Status message={{ text: `Couldn't load the site: ${(error as Error).message}`, error: true }} />
      <Button onClick={logOutAndReload}>Log out</Button>
    </div>
  );
}
