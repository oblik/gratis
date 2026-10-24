import { useId } from 'react'

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
  dirty?: boolean
  error?: string
}

export function Checkbox({
  label,
  checked,
  onChange,
  dirty,
  error,
}: CheckboxProps) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex items-center gap-2 font-medium">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="size-4 accent-blue-600"
        />
        {label}
        {dirty && (
          <span
            className="size-1.5 rounded-full bg-amber-500"
            title="Unsaved change"
          />
        )}
      </label>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
