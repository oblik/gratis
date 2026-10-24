import { getRouteApi, Link } from '@tanstack/react-router';
import { collectionLabel } from '../site.ts';
import { ChevronIcon } from '../ui/icons.tsx';

const route = getRouteApi('/_app/');

export function Home() {
  const { site } = route.useRouteContext();
  const singles = Object.entries(site.schema.collections).filter(([, collection]) => collection.single);
  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
      {singles.map(([name, collection]) => (
        <li key={name}>
          <Link to="/singles/$name" params={{ name }} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
            {collectionLabel(name, collection)} <ChevronIcon />
          </Link>
        </li>
      ))}
    </ul>
  );
}
