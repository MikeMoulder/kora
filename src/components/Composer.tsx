'use client';

import { useState } from 'react';
import { Button, Spinner, cx } from './ui';

const EXAMPLES = [
  'Send ₦100,000 to Carlos in Bolivia for his logo design.',
  "I owe Maria 80 bucks for the logo. She's in Bolivia. Pay her tomorrow.",
  'Pay Diego KES 5,000 in Bolivia for the September invoice',
];

/**
 * The payment composer.
 *
 * Deliberately not a chat window. A chat invites open-ended conversation with
 * a model that has no business being open-ended about money — this takes one
 * instruction and hands it to a parser. The examples are there because the
 * fastest way to teach the input is to let someone click one.
 */
export function Composer({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (text: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [text, setText] = useState('');

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed && !busy) onSubmit(trimmed);
  }

  return (
    <div className="rise">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <div
          className={cx(
            'group relative rounded-2xl border bg-ink-900/70 backdrop-blur transition-colors',
            error ? 'border-danger/40' : 'seam focus-within:border-amber-core/50',
          )}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            rows={3}
            maxLength={500}
            disabled={busy}
            placeholder="Send ₦100,000 to Carlos in Bolivia for his design work."
            aria-label="Describe the payment"
            className="w-full resize-none bg-transparent px-5 pt-5 pb-2 text-lg leading-relaxed text-ink-100 outline-none placeholder:text-ink-600 disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-3 px-4 pb-4">
            <span className="text-[11px] text-ink-600">
              Enter to send · Shift+Enter for a new line
            </span>
            <Button type="submit" disabled={!text.trim()} busy={busy}>
              {busy ? 'Reading' : 'Plan this payment'}
            </Button>
          </div>

          {busy && (
            <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden rounded-b-2xl">
              <div className="h-full w-1/3 animate-[flow-dash_1.2s_linear_infinite] bg-amber-core" />
            </div>
          )}
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => {
              setText(example);
              submit(example);
            }}
            className="rounded-lg border seam bg-ink-900/40 px-3 py-1.5 text-left text-xs text-ink-400 transition-colors hover:border-amber-core/30 hover:text-ink-200 disabled:opacity-50"
          >
            {example.length > 52 ? example.slice(0, 52) + '…' : example}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-400">
      <Spinner />
      {label}
    </div>
  );
}
