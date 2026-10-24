// Shared across the config's module graph and the content config's, which Vite may load as separate
// instances in the same process, so the state lives on globalThis.

import type { CollectionConfig } from './schema.ts';

interface State { collections: Record<string, CollectionConfig>; templateRoutes?: Map<string, URL[]> }

declare global {
  var __gratis: State | undefined;
}

export const isTemplateMode = () => process.env.GRATIS_MODE === 'template';

export function state(): State {
  return (globalThis.__gratis ??= { collections: {} });
}

export const sentinel = (...path: string[]) => `{{gratis:${path.join(':')}}}`;
