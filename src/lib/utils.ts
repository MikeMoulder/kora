import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * The shadcn convention. Worth having even though nothing here is a shadcn
 * component yet: without it, passing `className="px-6"` to a component that
 * already sets `px-4` produces two conflicting classes and the winner depends
 * on stylesheet order rather than on what the caller asked for.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
