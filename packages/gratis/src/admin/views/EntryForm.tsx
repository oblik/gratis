// The form of one entry. The base is the saved version with its ETag; the draft is the editor's
// changes on top of it, saved conditionally on that ETag (notes/editing.md).

import { useBlocker } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'

import {
  equal,
  validate,
  type Collection,
  type Field,
  type Fields,
} from '../../core/schema.ts'
import type { Entry, OnPage } from '../../core/site.ts'
import { ConflictError } from '../../core/storage.ts'
import { Button } from '../ui/Button.tsx'
import { Checkbox } from '../ui/Checkbox.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Status, type StatusMessage } from '../ui/Status.tsx'
import { TextField } from '../ui/TextField.tsx'

export interface EntryFormProps {
  title: string
  collection: Collection
  /** The version the edit starts from. */
  entry: Entry
  /** Writes the draft and renders the affected pages; returns them. */
  save(
    fields: Fields,
    etag: string | undefined,
    onPage: OnPage,
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

export function EntryForm({
  title,
  collection,
  entry,
  save,
  reload,
  onSaved,
  header,
  actions,
  requireChanges = true,
}: EntryFormProps) {
  const [base, setBase] = useState(entry)
  const [draft, setDraft] = useState(entry.fields)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<StatusMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const dirty = !equal(draft, base.fields)

  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  })

  const edit = (name: string, value: unknown) => {
    setDraft((draft) => ({ ...draft, [name]: value }))
    setErrors(({ [name]: _, ...rest }) => rest)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const errors = validate(collection, draft)
    setErrors(errors)
    if (Object.keys(errors).length)
      return setMessage({
        text: 'Fix the highlighted fields first.',
        error: true,
      })
    setSaving(true)
    setConflict(false)
    try {
      setMessage({ text: 'Saving…' })
      const pages = await save(draft, base.etag, (path) =>
        setMessage({ text: `Rendered ${path}` }),
      )
      // The draft keeps any edits made meanwhile.
      setBase({ fields: draft, etag: (await reload(false)).etag })
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

  /** Starts over from the latest version, dropping the draft. */
  async function loadLatest() {
    const latest = await reload(true)
    setBase(latest)
    setDraft(latest.fields)
    setErrors({})
    setConflict(false)
    setMessage({ text: 'Loaded the latest version.' })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {header}
      {Object.entries(collection.fields).map(([name, field]) => (
        <FieldInput
          key={name}
          field={field}
          value={draft[name]}
          dirty={!equal(draft[name], base.fields[name])}
          error={errors[name]}
          onChange={(value) => edit(name, value)}
        />
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

function FieldInput({
  field,
  value,
  dirty,
  error,
  onChange,
}: {
  field: Field
  value: unknown
  dirty: boolean
  error?: string
  onChange(value: unknown): void
}) {
  if (field.type === 'boolean')
    return (
      <Checkbox
        label={field.label}
        checked={value === true}
        onChange={onChange}
        dirty={dirty}
        error={error}
      />
    )
  return (
    <TextField
      label={field.label}
      multiline={field.multiline}
      value={value == null ? '' : String(value)}
      onChange={onChange}
      dirty={dirty}
      error={error}
    />
  )
}
