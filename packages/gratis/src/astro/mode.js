// Shared across the config's module graph and the content config's, which Vite may load as separate
// instances in the same process, so the state lives on globalThis.

export const isTemplateMode = () => process.env.GRATIS_MODE === 'template';

/** @returns {{ collections: Record<string, object>, templateRoutes?: Map<string, URL[]> }} */
export function state() {
  return (globalThis.__gratis ??= { collections: {} });
}

export const sentinel = (...path) => `{{gratis:${path.join(':')}}}`;
