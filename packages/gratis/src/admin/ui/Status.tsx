import type { ReactNode } from 'react';

export interface StatusMessage { text: string; error?: boolean }

export function Status({ message, children }: { message?: StatusMessage | null; children?: ReactNode }) {
  return (
    <p role="status" className={`min-h-6 ${message?.error ? 'text-red-600' : 'text-gray-500'}`}>
      {message?.text} {children}
    </p>
  );
}
