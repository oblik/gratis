import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { logIn, LoginError } from '../session.ts';
import { Button } from '../ui/Button.tsx';
import { Status, type StatusMessage } from '../ui/Status.tsx';

const input = 'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 font-normal dark:border-gray-600 dark:bg-gray-900';

export function Login() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { username, password } = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    setMessage({ text: 'Unlocking…' });
    try {
      await logIn(username, password);
      await navigate({ to: '/' });
    } catch (error) {
      setMessage({ text: error instanceof LoginError ? error.message : `Couldn't log in: ${(error as Error).message}`, error: true });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 grid max-w-xs gap-3">
      <h1 className="text-2xl font-semibold">Gratis</h1>
      <label className="grid gap-1 font-medium">Username <input name="username" autoComplete="username" required className={input} /></label>
      <label className="grid gap-1 font-medium">Password <input name="password" type="password" autoComplete="current-password" required className={input} /></label>
      <Button type="submit" variant="primary" disabled={busy} className="justify-self-start">Log in</Button>
      <Status message={message} />
    </form>
  );
}
