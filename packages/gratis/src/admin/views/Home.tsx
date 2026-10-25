import { getRouteApi, Link } from '@tanstack/react-router'

import { ChevronIcon } from '../ui/icons.tsx'

const route = getRouteApi('/_app/')

const row =
  'flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800'

export function Home() {
  const { site } = route.useRouteContext()
  const collections = Object.entries(site.schema.collections)
  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
      {collections.map(([name, collection]) => (
        <li key={name}>
          {collection.single ? (
            <Link to="/singles/$name" params={{ name }} className={row}>
              {collection.label} <ChevronIcon />
            </Link>
          ) : (
            <Link to="/collections/$name" params={{ name }} className={row}>
              <span>
                {collection.label}{' '}
                <span className="text-gray-500">
                  ({site.entries[name].length})
                </span>
              </span>
              <ChevronIcon />
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
