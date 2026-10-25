import { access } from 'node:fs/promises'

import type { AstroIntegration } from 'astro'

import { createEmulator } from '../emulator/index.ts'
import { ADMIN_MISSING, adminDist, finishBuild } from './build.ts'
import { devBackend } from './dev.ts'
import { isTemplateMode, state } from './template.ts'

export default function gratis(): AstroIntegration {
  let root: URL
  return {
    name: 'gratis',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        root = config.root
        // The getters import astro:content, so Vite has to process the package.
        updateConfig({ vite: { ssr: { noExternal: ['gratis'] } } })
      },
      // The admin at /admin/ and the storage emulator over the content files, on the dev server's origin.
      'astro:server:setup': async ({ server, logger }) => {
        await access(adminDist).catch(() => logger.warn(ADMIN_MISSING))
        const handle = createEmulator(devBackend({ root, adminDist }), {
          website: true,
        })
        server.middlewares.use((req, res, next) => {
          const [path, query = ''] = req.url!.split('?')
          // ListObjectsV2 goes to the path-style endpoint's root, which is the site's `/` here.
          const list =
            path === '/' && new URLSearchParams(query).get('list-type') === '2'
          if (
            list ||
            path.startsWith('/_gratis/') ||
            path === '/admin' ||
            path.startsWith('/admin/')
          )
            return handle(req, res, next)
          next()
        })
      },
      'astro:build:done': async ({ dir, assets, logger }) => {
        // The template pass is a nested build: it only reports its routes back.
        if (isTemplateMode()) state().templateRoutes = assets
        else await finishBuild({ root, dir, assets, logger })
      },
    },
  }
}
