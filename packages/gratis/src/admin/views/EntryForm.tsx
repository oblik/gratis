import { useBlocker } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'

import { EntryProvider, useDirty, useField } from '../entry-context.tsx'
import type { EntryStore } from '../entry.ts'
import { equal } from '../path.ts'
import type { Entry, Field, Fields } from '../site.ts'
import { ConflictError } from '../storage.ts'
import { Button } from '../ui/Button.tsx'
import { Checkbox } from '../ui/Checkbox.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Status, type StatusMessage } from '../ui/Status.tsx'
import { TextField } from '../ui/TextField.tsx'

export interface EntryFormProps {
  store: EntryStore
  title: string
  fields: Record<string, Field>
  /** Writes the draft and renders the affected pages; returns them. */
  save(
    fields: Fields,
    etag: string | undefined,
    onPage: (path: string) => void,
  ): Promise<string[]>
  /** The saved version: the cached one after a save, refetched (`fresh`) after a conflict. */
  reload(fresh: boolean): Promise<Entry>
  /** Called after a save, with the draft now the base. */
  onSaved?(): void
  /** Above the fields, like a new entry's id. */
  header?: ReactNode
  /** Next to the save button, like Delete. */
  actions?: ReactNode
  /** Whether Save needs an edit first; a new entry can be saved as it is. */
  requireChanges?: boolean
}

export function EntryForm(props: EntryFormProps) {
  return (
    <EntryProvider store={props.store}>
      <Form {...props} />
    </EntryProvider>
  )
}

function Form({
  store,
  title,
  fields,
  save,
  reload,
  onSaved,
  header,
  actions,
  requireChanges = true,
}: EntryFormProps) {
  const dirty = useDirty()
  const [message, setMessage] = useState<StatusMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)

  const hasChanges = () => {
    const { draft, base } = store.getState()
    return !equal(draft, base)
  }
  const blocker = useBlocker({
    shouldBlockFn: hasChanges,
    enableBeforeUnload: hasChanges,
    withResolver: true,
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    const state = store.getState()
    if (!state.check())
      return setMessage({
        text: 'Fix the highlighted fields first.',
        error: true,
      })
    const fields = state.draft
    setSaving(true)
    setConflict(false)
    try {
      setMessage({ text: 'Saving…' })
      const pages = await save(fields, state.etag, (path) =>
        setMessage({ text: `Rendered ${path}` }),
      )
      state.commit(fields, (await reload(false)).etag)
      setMessage({
        text: pages.length
          ? `Saved. ${pages.length} page(s) updated.`
          : 'Saved.',
      })
      onSaved?.()
    } catch (error) {
      if (error instanceof ConflictError) {
        setConflict(true)
        setMessage({
          text: 'Someone else saved in the meantime. Load their version, then make your change again.',
          error: true,
        })
      } else {
        setMessage({
          text: `Save failed: ${(error as Error).message}`,
          error: true,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  async function loadLatest() {
    const latest = await reload(true)
    store.getState().reset(latest.fields, latest.etag)
    setConflict(false)
    setMessage({ text: 'Loaded the latest version.' })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {header}
      {Object.entries(fields).map(([key, field]) => (
        <FieldInput key={key} name={key} field={field} />
      ))}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={saving || (requireChanges && !dirty)}
        >
          Save
        </Button>
        {conflict && <Button onClick={loadLatest}>Load their version</Button>}
        {actions}
      </div>
      <Status message={message} />
      <Dialog
        open={blocker.status === 'blocked'}
        onCancel={() => blocker.reset?.()}
      >
        <p className="mb-4">Discard your unsaved changes?</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => blocker.reset?.()}>Keep editing</Button>
          <Button variant="primary" onClick={() => blocker.proceed?.()}>
            Discard
          </Button>
        </div>
      </Dialog>
    </form>
  )
}

function FieldInput({ name, field }: { name: string; field: Field }) {
  const { value, dirty, error, set } = useField([name])
  if (field.type === 'boolean')
    return (
      <Checkbox
        label={field.label}
        checked={value === true}
        onChange={set}
        dirty={dirty}
        error={error}
      />
    )
  if (field.type === 'text') {
    return (
      <TextField
        label={field.label}
        multiline={field.multiline}
        value={value == null ? '' : String(value)}
        onChange={set}
        dirty={dirty}
        error={error}
      />
    )
  }
  return <p className="text-red-600">{name}: unsupported field type</p>
}
