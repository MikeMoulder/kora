'use client';

import { cx, Pill } from './ui';
import { Flag } from './Flag';

export type LegState = 'idle' | 'active' | 'done' | 'blocked';

export interface RouteNode {
  key: string;
  /** ISO 3166-1 alpha-2. Rendered as an image, not an emoji. */
  countryCode?: string;
  title: string;
  subtitle?: string;
  value?: string;
  /** Which side owns this node. Drives the accent colour. */
  owner: 'kora' | 'pollar' | 'boundary';
  state: LegState;
  /** Shown as a badge. Used for the deliberately-simulated Bolivian payout. */
  tag?: string;
}

/**
 * The corridor, drawn.
 *
 * The visual argument of the whole project: everything amber is the leg KORA
 * built, everything cyan is the leg Pollar owns, and the seam between them is
 * the hand-off. Someone who never reads the README should still be able to
 * point at the screen and say which half we are claiming.
 */
export function RouteRail({ nodes }: { nodes: RouteNode[] }) {
  return (
    <div className="relative">
      {/* Desktop: horizontal rail. Below lg the nodes get too narrow for the
          country names, so tablets take the vertical rail instead. */}
      <ol className="hidden items-stretch gap-0 lg:flex">
        {nodes.map((node, i) => (
          <li key={node.key} className="flex min-w-0 flex-1 items-center">
            <NodeCard node={node} />
            {i < nodes.length - 1 && (
              <Connector
                from={node}
                to={nodes[i + 1]}
                active={node.state === 'done' || node.state === 'active'}
              />
            )}
          </li>
        ))}
      </ol>

      {/* Mobile + tablet: vertical rail */}
      <ol className="flex flex-col gap-0 lg:hidden">
        {nodes.map((node, i) => (
          <li key={node.key}>
            <NodeCard node={node} />
            {i < nodes.length - 1 && (
              <VerticalConnector
                from={node}
                to={nodes[i + 1]}
                active={node.state === 'done' || node.state === 'active'}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ownerClasses(owner: RouteNode['owner'], state: LegState) {
  const dim = state === 'idle';

  if (owner === 'kora') {
    return {
      ring: dim ? 'seam' : 'border-amber-core/40',
      text: dim ? 'text-ink-500' : 'text-amber-glow',
      glow: dim ? '' : 'shadow-[0_0_28px_-14px_var(--color-amber-core)]',
      bg: dim ? 'bg-ink-900/40' : 'bg-amber-wash/50',
    };
  }
  if (owner === 'pollar') {
    return {
      ring: dim ? 'seam' : 'border-flow-core/40',
      text: dim ? 'text-ink-500' : 'text-flow-glow',
      glow: dim ? '' : 'shadow-[0_0_28px_-14px_var(--color-flow-core)]',
      bg: dim ? 'bg-ink-900/40' : 'bg-flow-wash/50',
    };
  }
  return {
    ring: dim ? 'seam' : 'seam-strong',
    text: dim ? 'text-ink-500' : 'text-ink-100',
    glow: '',
    bg: dim ? 'bg-ink-900/40' : 'bg-ink-850',
  };
}

function NodeCard({ node }: { node: RouteNode }) {
  const s = ownerClasses(node.owner, node.state);

  return (
    <div
      className={cx(
        'flex h-full min-w-0 flex-1 flex-col rounded-xl border px-3 py-3 transition-all duration-500',
        s.ring,
        s.bg,
        s.glow,
      )}
    >
      <div className="flex items-center gap-2">
        {node.countryCode && <Flag code={node.countryCode} size={15} />}
        <span className={cx('truncate text-[11px] font-semibold uppercase tracking-wider', s.text)}>
          {node.title}
        </span>
        {node.state === 'active' && (
          <span className={cx('ml-auto h-1.5 w-1.5 shrink-0 rounded-full pulse-soft', s.text.replace('text-', 'bg-'))} />
        )}
        {node.state === 'done' && (
          <svg className={cx('ml-auto h-3.5 w-3.5 shrink-0', s.text)} viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {node.value && (
        <div className={cx('tabular mt-1.5 truncate text-sm font-semibold', node.state === 'idle' ? 'text-ink-600' : 'text-ink-100')}>
          {node.value}
        </div>
      )}

      {node.subtitle && (
        <div className="mt-0.5 truncate text-[11px] text-ink-500">{node.subtitle}</div>
      )}

      {node.tag && (
        <div className="mt-2">
          <Pill tone="warn">{node.tag}</Pill>
        </div>
      )}
    </div>
  );
}

/** The seam. Gradient from one owner's colour to the next. */
function Connector({ from, to, active }: { from: RouteNode; to: RouteNode; active: boolean }) {
  const isHandoff = from.owner !== to.owner && to.owner === 'pollar';

  return (
    <div className="relative h-px w-6 shrink-0 xl:w-8">
      <svg className="absolute inset-0 h-px w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`grad-${from.key}`} x1="0" x2="1">
            <stop offset="0%" stopColor={colorFor(from.owner)} stopOpacity={active ? 0.8 : 0.18} />
            <stop offset="100%" stopColor={colorFor(to.owner)} stopOpacity={active ? 0.8 : 0.18} />
          </linearGradient>
        </defs>
        <line x1="0" y1="0.5" x2="100%" y2="0.5" stroke={`url(#grad-${from.key})`} strokeWidth="1.5" />
        {active && (
          <line
            x1="0"
            y1="0.5"
            x2="100%"
            y2="0.5"
            stroke={colorFor(to.owner)}
            strokeWidth="1.5"
            className="flow-line"
            opacity="0.9"
          />
        )}
      </svg>

      {isHandoff && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-flow-core/40 bg-ink-950 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-flow-glow">
          ⇥
        </span>
      )}
    </div>
  );
}

function VerticalConnector({ from, to, active }: { from: RouteNode; to: RouteNode; active: boolean }) {
  const isHandoff = from.owner !== to.owner && to.owner === 'pollar';

  return (
    <div className="relative ml-6 h-6 w-px">
      <div
        className="h-full w-px"
        style={{
          background: `linear-gradient(to bottom, ${colorFor(from.owner)}, ${colorFor(to.owner)})`,
          opacity: active ? 0.75 : 0.18,
        }}
      />
      {isHandoff && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-flow-glow">
          hand-off
        </span>
      )}
    </div>
  );
}

function colorFor(owner: RouteNode['owner']) {
  return owner === 'kora'
    ? 'var(--color-amber-core)'
    : owner === 'pollar'
      ? 'var(--color-flow-core)'
      : 'var(--color-ink-500)';
}
