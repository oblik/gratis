import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { entryKey, isEntryId } from '../../core/bucket.ts'
import { emptyFields } from '../../core/schema.ts'
import {
  affectedBy,
  createEntry,
  deleteEntry,
  readEntry,
  saveEntry,
} from '../../core/site.ts'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Status, type StatusMessage } from '../ui/Status.tsx'
import { TextField } from '../ui/TextField.tsx'
import { EntryForm } from './EntryForm.tsx'

const editRoute = getRouteApi('/_app/collections/$name/$id')
const newRoute = getRouteApi('/_app/collections/$name/new')

export function CollectionEntry() {
  const { name, id } = editRoute.useParams()
  const { site } = editRoute.useRouteContext()
  const navigate = useNavigate()
  const key = entryKey(name, id)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<StatusMessage | null>(null)

  const { own, others } = affectedBy(site, key)
  async function remove() {
    setConfirming(false)
    try {
      setMessage({ text: 'Deleting…' })
      await deleteEntry(site, key, { DOMParser }, (path) =>
        setMessage({ text: `Rendered ${path}` }),
      )
      await navigate({
        to: '/collections/$name',
        params: { name },
        ignoreBlocker: true,
      })
    } catch (error) {
      setMessage({
        text: `Delete failed: ${(error as Error).message}`,
        error: true,
      })
    }
  }

  return (
    <>
      <EntryForm
        title={key}
        collection={site.schema.collections[name]}
        entry={editRoute.useLoaderData()}
        save={(fields, etag, onPage) =>
          saveEntry(site, key, fields, { DOMParser, etag }, onPage)
        }
        reload={(fresh) => readEntry(site, key, { fresh })}
        actions={
          <Button
            onClick={() => setConfirming(true)}
            className="ml-auto text-red-600"
          >
            Delete
          </Button>
        }
      />
      <Status message={message} />
      <Dialog open={confirming} onCancel={() => setConfirming(false)}>
        <p className="mb-2">Delete {key}?</p>
        <p className="mb-4 text-sm text-gray-500">
          {own.length
            ? `Its page${own.length > 1 ? 's' : ''} ${own.join(', ')} will be deleted. `
            : ''}
          {others.length
            ? `${others.length} other page(s) will be re-rendered without it.`
            : ''}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="primary" onClick={remove}>
            Delete
          </Button>
        </div>
      </Dialog>
    </>
  )
}

export function NewEntry() {
  const { name } = newRoute.useParams()
  const { site } = newRoute.useRouteContext()
  const navigate = useNavigate()
  const collection = site.schema.collections[name]
  const [id, setId] = useState('')

  const idError =
    id && !isEntryId(id)
      ? 'Use lowercase letters, digits and dashes.'
      : site.entries[name].includes(id)
        ? `There is already an entry "${id}".`
        : undefined

  return (
    <EntryForm
      title={`New ${name} entry`}
      collection={collection}
      entry={{ fields: emptyFields(collection) }}
      requireChanges={false}
      header={
        <TextField
          label="Id (in the URL)"
          value={id}
          onChange={setId}
          error={idError}
        />
      }
      save={async (fields, _etag, onPage) => {
        if (!id || idError)
          throw new Error(idError ?? 'Give the entry an id first.')
        return createEntry(site, name, id, fields, { DOMParser }, onPage)
      }}
      reload={(fresh) => readEntry(site, entryKey(name, id), { fresh })}
      // The saved draft is the entry's page now; nothing is left to discard.
      onSaved={() =>
        navigate({
          to: '/collections/$name/$id',
          params: { name, id },
          replace: true,
          ignoreBlocker: true,
        })
      }
    />
  )
}
