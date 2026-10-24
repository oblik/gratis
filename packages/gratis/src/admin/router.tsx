// Code-based routes on hash history (`/admin/#/…`), so the bucket serves only /admin/index.html.

import { createHashHistory, createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { hasSession, openSite } from './session.ts';
import { readEntry } from './site.ts';
import { Status } from './ui/Status.tsx';
import { Home } from './views/Home.tsx';
import { Layout, SiteError } from './views/Layout.tsx';
import { Login } from './views/Login.tsx';
import { EntryError, Single } from './views/Single.tsx';

function Root() {
  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* WebCrypto, which both unlocking and request signing need, exists only on HTTPS. */}
      {crypto.subtle
        ? <Outlet />
        : <Status message={{ text: 'The admin needs HTTPS. Open it through the site’s https:// address.', error: true }} />}
    </main>
  );
}

const root = createRootRoute({ component: Root });

const login = createRoute({
  getParentRoute: () => root,
  path: '/login',
  beforeLoad: () => {
    if (hasSession()) throw redirect({ to: '/' });
  },
  component: Login,
});

// Everything behind the login: the loaded site is in the route context.
const app = createRoute({
  getParentRoute: () => root,
  id: '_app',
  beforeLoad: async () => {
    const opened = openSite();
    if (!opened) throw redirect({ to: '/login' });
    return await opened;
  },
  pendingComponent: () => <Status message={{ text: 'Loading…' }} />,
  errorComponent: SiteError,
  component: Layout,
});

const home = createRoute({ getParentRoute: () => app, path: '/', component: Home });

const single = createRoute({
  getParentRoute: () => app,
  path: '/singles/$name',
  loader: ({ context: { site }, params: { name } }) => readEntry(site, name),
  remountDeps: ({ params }) => params,
  errorComponent: EntryError,
  component: Single,
});

export const router = createRouter({
  routeTree: root.addChildren([login, app.addChildren([home, single])]),
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
