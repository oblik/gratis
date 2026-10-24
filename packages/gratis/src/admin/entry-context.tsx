import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'

import type { EntryState, EntryStore } from './entry.ts'
import { equal, getAt, pathKey, type Path } from './path.ts'

const EntryContext = createContext<EntryStore | null>(null)

export function EntryProvider({
  store,
  children,
}: {
  store: EntryStore
  children: ReactNode
}) {
  return <EntryContext value={store}>{children}</EntryContext>
}

export function useEntryStore() {
  const store = useContext(EntryContext)
  if (!store) throw new Error('useEntry outside an EntryProvider')
  return store
}

/** Selectors must return values, not new objects, or every change re-renders the caller. */
export const useEntry = <T,>(selector: (state: EntryState) => T) =>
  useStore(useEntryStore(), selector)

/** One field's value, whether it differs from the base, and its error. Re-renders only when those change. */
export function useField(path: Path) {
  const value = useEntry((s) => getAt(s.draft, path))
  const dirty = useEntry(
    (s) => !equal(getAt(s.draft, path), getAt(s.base, path)),
  )
  const error = useEntry((s) => s.errors[pathKey(path)])
  const edit = useEntry((s) => s.edit)
  return { value, dirty, error, set: (next: unknown) => edit(path, next) }
}

export const useDirty = () => useEntry((s) => !equal(s.draft, s.base))
