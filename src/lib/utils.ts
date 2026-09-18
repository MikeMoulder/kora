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

/**
 * Copy text to the clipboard, with the old path as a fallback.
 *
 * The async Clipboard API is refused in more places than it first looks:
 * insecure origins, embedded webviews, Firefox without the permission, and any
 * context that has not been granted `clipboard-write`. `execCommand('copy')`
 * is deprecated and still works in every one of those, which is why it is the
 * fallback rather than the primary.
 *
 * Returns whether the text actually reached the clipboard, so a caller can
 * tell the user the truth instead of flashing a tick either way. Callers must
 * be client side; nothing here runs at module load.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Refused. Fall through to the legacy path rather than giving up.
  }

  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    // Parked off screen rather than hidden, because a display:none element
    // cannot hold a selection and the copy would silently do nothing.
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
