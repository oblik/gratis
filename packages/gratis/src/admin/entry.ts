// Form state of one open entry: the base snapshot with its ETag, and the draft. A Zustand vanilla
// store per entry, provided to the form through context (see EntryProvider).

import { createStore } from 'zustand/vanilla';
import type { Collection, Fields } from './site.ts';
import { validate } from './validate.ts';
import { pathKey, setAt, type Path } from './path.ts';

export interface EntryState {
  base: Fields;
  etag?: string;
  draft: Fields;
  errors: Record<string, string>;
  edit(path: Path, value: unknown): void;
  /** Validates the draft; false when it has errors. */
  check(): boolean;
  /** Makes `fields`, now saved as `etag`, the new base. The draft keeps any edits made meanwhile. */
  commit(fields: Fields, etag?: string): void;
  /** Starts over from another version, dropping the draft. */
  reset(base: Fields, etag?: string): void;
}

export type EntryStore = ReturnType<typeof createEntryStore>;

export const createEntryStore = (collection: Collection, base: Fields, etag?: string) =>
  createStore<EntryState>()((set, get) => ({
    base,
    etag,
    draft: base,
    errors: {},
    edit: (path, value) => set(({ draft, errors }) => {
      const { [pathKey(path)]: _, ...rest } = errors;
      return { draft: setAt(draft, path, value), errors: rest };
    }),
    check: () => {
      const errors = validate(collection, get().draft);
      set({ errors });
      return !Object.keys(errors).length;
    },
    commit: (fields, etag) => set({ base: fields, etag }),
    reset: (base, etag) => set({ base, etag, draft: base, errors: {} }),
  }));
