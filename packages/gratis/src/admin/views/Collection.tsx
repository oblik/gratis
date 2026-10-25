import { getRouteApi, Link } from '@tanstack/react-router'

import { contentKey, entryKey } from '../../core/bucket.ts'
import { ChevronIcon } from '../ui/icons.tsx'

const route = getRouteApi('/_app/collections/$name/')

const list =
  'divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700'
const row =
  'flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800'

export function Collection() {
  const { name } = route.useParams()
  const { site } = route.useRouteContext()
  const collection = site.schema.collections[name]
  const ids = site.entries[name]
  // An entry is shown by its first text field, like a title, and its id.
  const titleField = Object.keys(collection.fields).find(
    (key) => collection.fields[key].type === 'text',
  )
  const title = (id: string) => {
    const file = site.objects.peek(contentKey(entryKey(name, id)))
    const value =
      titleField && file ? JSON.parse(file.text)[titleField] : undefined
    return typeof value === 'string' && value ? value : id
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{collection.label}</h2>
        <Link
          to="/collections/$name/new"
          params={{ name }}
          className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
        >
          New entry
        </Link>
      </div>
      {ids.length ? (
        <ul className={list}>
          {ids.map((id) => (
            <li key={id}>
              <Link
                to="/collections/$name/$id"
                params={{ name, id }}
                className={row}
              >
                <span className="grid">
                  {title(id)}
                  <span className="text-sm text-gray-500">
                    {entryKey(name, id)}
                  </span>
                </span>
                <ChevronIcon />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No entries yet.</p>
      )}
    </div>
  )
}
