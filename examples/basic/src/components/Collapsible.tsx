import { useState, type ReactNode } from 'react'

// Rendered on the server too, so it gets content only as children.
export default function Collapsible({
  summary,
  children,
}: {
  summary: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {summary}
      </button>
      <div hidden={!open}>{children}</div>
    </section>
  )
}
