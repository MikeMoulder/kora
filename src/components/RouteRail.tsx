'use client';

import { cn } from '@/lib/utils';
import { Flag } from './Flag';
import type { Owner } from './ui/primitives';

export type LegState = 'idle' | 'active' | 'done';

export interface RouteNode {
  key: string;
  /** ISO 3166-1 alpha-2. Rendered as an image, not an emoji. */
  countryCode?: string;
  title: string;
  subtitle?: string;
  value?: string;
  /** Who owns this step. Drives fill and weight, never hue. */
  owner: Owner;
  state: LegState;
  /** Extra line under the node, used for the simulated payout caveat. */
  tag?: string;
}

/**
 * The corridor, drawn.
 *
 * The visual argument of the project, now carried without colour. A step KORA
 * built is a solid black block. A step Pollar owns is outlined. A simulated
 * step is dashed. A step not yet reached is a faint hairline, whatever its
 * owner, so progress reads as each block resolving into its true treatment.
 */
export function RouteRail({ nodes }: { nodes: RouteNode[] }) {
  return (
    <div className="relative">
      {/* Horizontal only from lg. Below that the nodes are too narrow for the
          country names, which was measured rather than guessed. */}
      <ol className="hidden items-stretch lg:flex">
        {nodes.map((node, i) => (
          <li key={node.key} className="flex min-w-0 flex-1 items-center">
            <NodeCard node={node} />
            {i < nodes.length - 1 && (
              <Connector from={node} to={nodes[i + 1]} active={node.state !== 'idle'} />
            )}
          </li>
        ))}
      </ol>

      <ol className="flex flex-col lg:hidden">
        {nodes.map((node, i) => (
          <li key={node.key}>
            <NodeCard node={node} />
            {i < nodes.length - 1 && (
              <VerticalConnector from={node} to={nodes[i + 1]} active={node.state !== 'idle'} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A node not yet reached shows as idle regardless of owner. Only once it is
 * active or done does it resolve into the treatment that says who owns it, so
 * progress and ownership are legible from the same drawing.
 */
function treatment(node: RouteNode): Owner {
  return node.state === 'idle' ? 'idle' : node.owner;
}

const OWNER_CLASS: Record<Owner, string> = {
  ours: 'leg-ours',
  theirs: 'leg-theirs',
  simulated: 'leg-simulated',
  idle: 'leg-idle',
};

function NodeCard({ node }: { node: RouteNode }) {
  const owner = treatment(node);
  const filled = owner === 'ours';

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-1 flex-col rounded-lg px-3.5 py-3 transition-all duration-500',
        OWNER_CLASS[owner],
      )}
    >
      <div className="flex items-center gap-2">
        {node.countryCode && <Flag code={node.countryCode} size={14} />}
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em]">
          {node.title}
        </span>

        {node.state === 'active' && (
          <span
            className={cn(
              'pulse-soft ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
              'bg-ink',
            )}
            aria-label="in progress"
          />
        )}
        {node.state === 'done' && (
          <svg className="ml-auto h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 8.5l3.2 3.2L13 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {node.value && (
        <div className="tabular mt-1.5 truncate text-sm font-semibold">{node.value}</div>
      )}

      {node.subtitle && (
        <div
          className={cn('mt-0.5 truncate text-[11px]', filled ? 'text-ink/60' : 'text-ink-faint')}
        >
          {node.subtitle}
        </div>
      )}

      {node.tag && (
        <div
          className={cn(
            'mt-2 text-[10px] font-medium uppercase tracking-[0.1em]',
            filled ? 'text-ink/70' : 'text-ink-muted',
          )}
        >
          {node.tag}
        </div>
      )}
    </div>
  );
}

/**
 * The seam. Solid while the value is still inside KORA, dashed once it enters
 * a simulated step, so the boundary shows in the line itself and not only in
 * the blocks either side of it.
 */
function Connector({ from, to, active }: { from: RouteNode; to: RouteNode; active: boolean }) {
  const isHandoff = from.owner !== to.owner && to.owner === 'theirs';
  const dashed = to.owner === 'simulated';

  return (
    <div className="relative h-px w-7 shrink-0 xl:w-9">
      <div
        className={cn(
          'absolute inset-x-0 top-0 border-t',
          dashed ? 'border-dashed' : 'border-solid',
          active ? 'border-ink' : 'border-rule',
        )}
      />
      {isHandoff && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-paper px-1 text-[9px] font-bold text-ink">
          &#8677;
        </span>
      )}
    </div>
  );
}

function VerticalConnector({
  from,
  to,
  active,
}: {
  from: RouteNode;
  to: RouteNode;
  active: boolean;
}) {
  const isHandoff = from.owner !== to.owner && to.owner === 'theirs';
  const dashed = to.owner === 'simulated';

  return (
    <div className="relative ml-6 h-7">
      <div
        className={cn(
          'h-full border-l',
          dashed ? 'border-dashed' : 'border-solid',
          active ? 'border-ink' : 'border-rule',
        )}
      />
      {isHandoff && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.14em] text-ink">
          hand-off
        </span>
      )}
    </div>
  );
}

/** The key to the language, shown beside the rail. */
export function RouteLegend() {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-muted">
      <span className="flex items-center gap-2">
        <span className="h-3 w-5 rounded-[3px] border-[1.5px] border-ink bg-accent" />
        KORA built this leg
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-5 rounded-[3px] border-[1.5px] border-ink bg-paper" />
        Pollar owns this leg
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-5 rounded-[3px] border-[1.5px] border-dashed border-ink-faint bg-paper" />
        Simulated, and labelled as such
      </span>
    </div>
  );
}
