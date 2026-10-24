import type { ComponentProps } from 'react';

const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-600/50',
  secondary: 'border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800',
};

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
