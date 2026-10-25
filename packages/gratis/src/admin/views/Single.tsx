import { getRouteApi, type ErrorComponentProps } from '@tanstack/react-router'

import { readEntry, saveEntry } from '../../core/site.ts'
import { Status } from '../ui/Status.tsx'
import { EntryForm } from './EntryForm.tsx'

const route = getRouteApi('/_app/singles/$name')

export function Single() {
  const { name } = route.useParams()
  const { site } = route.useRouteContext()
  const collection = site.schema.collections[name]
  return (
    <EntryForm
      title={collection.label}
      collection={collection}
      entry={route.useLoaderData()}
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
