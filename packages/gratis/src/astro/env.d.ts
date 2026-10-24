// `.astro` components and `astro:content`, which Vite resolves when it loads `gratis/astro`.
/// <reference types="astro/client" />

declare module '*.astro' {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}
