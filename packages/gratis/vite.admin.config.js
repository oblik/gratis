import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/admin',
  base: '/admin/',
  build: { outDir: '../../dist/admin', emptyOutDir: true },
});
