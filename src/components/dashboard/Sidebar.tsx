'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Globe2, LayoutGrid, Send, Settings, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Monogram } from './parts';
import { ACCOUNT } from '@/lib/demo-data';

/**
 * The workspace rail.
 *
 * Overview is the resting state. The account, the balance and the activity
 * are what the dashboard is for, so they hold the whole width until someone
 * asks for something else.
 *
 * The other three items open a workspace panel beside the account rather than
 * replacing the page, because none of them make sense without the balance in
 * view: you want to see what you are spending from while you compose a send,
 * and Kora Agent is reading a sentence about that same money.
 */

export type PanelMode = 'send' | 'agent' | 'beneficiaries';

export const PANEL_TITLES: Record<PanelMode, string> = {
  send: 'Send money',
  agent: 'Kora Agent',
  beneficiaries: 'Beneficiaries',
};

interface RailItem {
  mode: PanelMode;
  icon: React.ReactNode;
}

const ITEMS: RailItem[] = [
  { mode: 'send', icon: <Send className="h-[18px] w-[18px]" strokeWidth={1.8} /> },
  { mode: 'agent', icon: <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} /> },
  { mode: 'beneficiaries', icon: <Users className="h-[18px] w-[18px]" strokeWidth={1.8} /> },
];

export function Sidebar({
  panel,
  onSelect,
}: {
  panel: PanelMode | null;
  onSelect: (panel: PanelMode | null) => void;
}) {
  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center py-5">
      <Link href="/" aria-label="KORA home" className="mb-7">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink">
          <Image
            src="/kora-mark-white.png"
            alt=""
            width={718}
            height={679}
            className="h-4"
            style={{ width: 'auto' }}
          />
        </span>
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-2">
        <RailButton
          label="Overview"
          active={panel === null}
          icon={<LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          onClick={() => onSelect(null)}
        />

        <span className="my-1 h-px w-6 bg-rule" aria-hidden />

        {ITEMS.map((item) => (
          <RailButton
            key={item.mode}
            label={PANEL_TITLES[item.mode]}
            icon={item.icon}
            active={panel === item.mode}
            onClick={() => onSelect(panel === item.mode ? null : item.mode)}
          />
        ))}

        <span className="my-1 h-px w-6 bg-rule" aria-hidden />

        <RailLink
          href="/corridors"
          label="Corridor registry"
          icon={<Globe2 className="h-[18px] w-[18px]" strokeWidth={1.8} />}
        />
        <RailLink
          href="/operator"
          label="Operator console"
          icon={<Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />}
        />
      </nav>

      <Monogram name={ACCOUNT.fullName} size={36} className="mt-4" />
    </aside>
  );
}

/**
 * Rail buttons carry a visible label on hover rather than relying on the
 * title attribute alone. An icon only rail is a guessing game otherwise, and
 * "which one is the agent" is exactly the question a first time viewer has.
 */
function RailButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
          active
            ? 'bg-ink text-paper'
            : 'text-ink-faint hover:bg-paper-sunk hover:text-ink',
        )}
      >
        {icon}
      </button>
      <Tooltip>{label}</Tooltip>
    </div>
  );
}

function RailLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink"
      >
        {icon}
      </Link>
      <Tooltip>{label}</Tooltip>
    </div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper opacity-0 transition-opacity group-hover:opacity-100"
    >
      {children}
    </span>
  );
}
