import { getRouteApi, type ErrorComponentProps } from '@tanstack/react-router'
import { useState } from 'react'

import { createEntryStore } from '../entry.ts'
import { collectionLabel, readEntry, saveEntry } from '../site.ts'
import { Status } from '../ui/Status.tsx'
import { EntryForm } from './EntryForm.tsx'

const route = getRouteApi('/_app/singles/$name')

export function Single() {
  const { name } = route.useParams()
  const { site } = route.useRouteContext()
  const entry = route.useLoaderData()
  const collection = site.schema.collections[name]
  const [store] = useState(() =>
    createEntryStore(collection, entry.fields, entry.etag),
  )
  return (
    <EntryForm
      store={store}
      title={collectionLabel(name, collection)}
      fields={collection.fields}
      save={(fields, etag, onPage) =>
        saveEntry(site, name, fields, { DOMParser, etag }, onPage)
      }
      reload={(fresh) => readEntry(site, name, { fresh })}
    />
  )
}

export function EntryError({ error }: ErrorComponentProps) {
  return (
    <Status
      message={{
        text: `Couldn't open this entry: ${(error as Error).message}`,
        error: true,
      }}
    />
  )
}
