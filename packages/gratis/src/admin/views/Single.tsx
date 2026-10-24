import { useState, type FormEvent } from 'react';
import { getRouteApi, useBlocker, type ErrorComponentProps } from '@tanstack/react-router';
import { collectionLabel, readEntry, saveEntry, type Field, type Site } from '../site.ts';
import { ConflictError } from '../storage.ts';
import { createEntryStore, type EntryStore } from '../entry.ts';
import { EntryProvider, useDirty, useField } from '../entry-context.tsx';
import { equal } from '../path.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Status, type StatusMessage } from '../ui/Status.tsx';
import { TextField } from '../ui/TextField.tsx';

const route = getRouteApi('/_app/singles/$name');

export function Single() {
  const { name } = route.useParams();
  const { site } = route.useRouteContext();
  const entry = route.useLoaderData();
  const [store] = useState(() => createEntryStore(site.schema.collections[name], entry.fields, entry.etag));
  return (
    <EntryProvider store={store}>
      <EntryForm site={site} name={name} store={store} />
    </EntryProvider>
  );
}

function EntryForm({ site, name, store }: { site: Site; name: string; store: EntryStore }) {
  const collection = site.schema.collections[name];
  const dirty = useDirty();
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const hasChanges = () => {
    const { draft, base } = store.getState();
    return !equal(draft, base);
  };
  const blocker = useBlocker({ shouldBlockFn: hasChanges, enableBeforeUnload: hasChanges, withResolver: true });

  async function save(event: FormEvent) {
    event.preventDefault();
    const state = store.getState();
    if (!state.check()) return setMessage({ text: 'Fix the highlighted fields first.', error: true });
    const fields = state.draft;
    setSaving(true);
    setConflict(false);
    try {
      setMessage({ text: 'Saving…' });
      const pages = await saveEntry(site, name, fields, { DOMParser, etag: state.etag }, (path) => setMessage({ text: `Rendered ${path}` }));
      state.commit(fields, (await readEntry(site, name)).etag);
      setMessage({ text: pages.length ? `Saved. ${pages.length} page(s) updated.` : 'Saved.' });
    } catch (error) {
      if (error instanceof ConflictError) {
        setConflict(true);
        setMessage({ text: 'Someone else saved in the meantime. Load their version, then make your change again.', error: true });
      } else {
        setMessage({ text: `Save failed: ${(error as Error).message}`, error: true });
      }
    } finally {
      setSaving(false);
    }
  }

  async function loadLatest() {
    const latest = await readEntry(site, name, { fresh: true });
    store.getState().reset(latest.fields, latest.etag);
    setConflict(false);
    setMessage({ text: 'Loaded the latest version.' });
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <h2 className="text-lg font-semibold">{collectionLabel(name, collection)}</h2>
      {Object.entries(collection.fields).map(([key, field]) => <FieldInput key={key} name={key} field={field} />)}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={saving || !dirty}>Save</Button>
        {conflict && <Button onClick={loadLatest}>Load their version</Button>}
      </div>
      <Status message={message} />
      <Dialog open={blocker.status === 'blocked'} onCancel={() => blocker.reset?.()}>
        <p className="mb-4">Discard your unsaved changes?</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => blocker.reset?.()}>Keep editing</Button>
          <Button variant="primary" onClick={() => blocker.proceed?.()}>Discard</Button>
        </div>
      </Dialog>
    </form>
  );
}

function FieldInput({ name, field }: { name: string; field: Field }) {
  const { value, dirty, error, set } = useField([name]);
  if (field.type !== 'text') return <p className="text-red-600">{name}: unsupported field type</p>;
  return (
    <TextField
      label={field.label}
      multiline={field.multiline}
      value={value == null ? '' : String(value)}
      onChange={set}
      dirty={dirty}
      error={error}
    />
  );
}

export function EntryError({ error }: ErrorComponentProps) {
  return <Status message={{ text: `Couldn't open this entry: ${(error as Error).message}`, error: true }} />;
}
