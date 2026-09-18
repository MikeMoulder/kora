'use client';

import { cn } from '@/lib/utils';

/**
 * Country flags as images rather than emoji.
 *
 * Regional-indicator emoji do not render as flags on Windows — Chrome there
 * shows the bare letter pair. A demo that is judged on whichever machine a
 * judge happens to open it on cannot afford a visual that works on one OS and
 * degrades to "NG" on another.
 */
export function Flag({
  code,
  className,
  size = 16,
}: {
  code: string;
  className?: string;
  size?: number;
}) {
  const lower = code.toLowerCase();

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${lower}.svg`}
      alt=""
      aria-hidden
      width={size}
      height={Math.round(size * 0.75)}
      loading="lazy"
      className={cn('inline-block shrink-0 rounded-[2px] object-cover align-[-2px]', className)}
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  );
}
