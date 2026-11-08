import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  // The root is absolute because Vite resolves a relative one from the current
  // folder, and the dev server loads this config from the site's folder.
  root: fileURLToPath(new URL('src/admin/', import.meta.url)),
  base: '/admin/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  build: { outDir: '../../dist/admin', emptyOutDir: true },
})
