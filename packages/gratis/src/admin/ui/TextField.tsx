import { useId } from 'react'

const control =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 dark:border-gray-600 dark:bg-gray-900 aria-invalid:border-red-600'

export interface TextFieldProps {
  label: string
  value: string
  onChange(value: string): void
  multiline?: boolean
  dirty?: boolean
  error?: string
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  dirty,
  error,
}: TextFieldProps) {
  const id = useId()
  const props = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    className: control,
  }
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex items-center gap-2 font-medium">
        {label}
        {dirty && (
          <span
            className="size-1.5 rounded-full bg-amber-500"
            title="Unsaved change"
          />
        )}
      </label>
      {multiline ? (
        <textarea
          {...props}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input {...props} onChange={(event) => onChange(event.target.value)} />
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
