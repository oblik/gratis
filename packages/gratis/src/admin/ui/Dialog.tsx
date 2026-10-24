import { useEffect, useRef, type ReactNode } from 'react';

/** A modal `<dialog>`: the browser traps focus and closes it on Esc, which calls `onCancel`. */
export function Dialog({ open, onCancel, children }: { open: boolean; onCancel(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto max-w-sm rounded-lg bg-white p-5 text-inherit shadow-xl backdrop:bg-black/40 dark:bg-gray-900"
    >
      {children}
    </dialog>
  );
}
