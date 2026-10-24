import type { ComponentProps } from 'react';

const icon = (path: string) => (props: ComponentProps<'svg'>) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden {...props}>
    <path d={path} />
  </svg>
);

export const ExternalIcon = icon('M11 4h5v5M16 4l-7 7M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4');
export const ChevronIcon = icon('M8 5l5 5-5 5');
