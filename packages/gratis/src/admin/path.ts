// Field paths into an entry's fields: `['title']`, `['nav', 0, 'label']`.

export type Path = readonly (string | number)[];

export const pathKey = (path: Path) => path.join('.');

export function getAt(value: unknown, path: Path): unknown {
  for (const segment of path) {
    if (value == null || typeof value !== 'object') return undefined;
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}

/** Copies only the objects along the path, so every other value keeps its identity. */
export function setAt<T>(value: T, path: Path, next: unknown): T {
  if (!path.length) return next as T;
  const [head, ...rest] = path;
  const copy: any = Array.isArray(value) ? [...value] : { ...(value as object) };
  copy[head] = setAt(copy[head], rest, next);
  return copy;
}

export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => equal((a as any)[key], (b as any)[key]));
}
