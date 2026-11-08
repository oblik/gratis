import { defineConfig } from 'astro/config'
import gratis from 'gratis'

export default defineConfig({
  integrations: [gratis()],
})
