'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/primitives';

const EXAMPLES = [
  'Send \u20a6100,000 to Carlos in Bolivia for his logo design.',
  "I owe Maria 80 bucks for the logo. She's in Bolivia. Pay her tomorrow.",
  'Pay Diego KES 5,000 in Bolivia for the September invoice',
];

/**
 * The payment composer.
 *
 * Deliberately not a chat window. A chat invites open ended conversation with
 * a model that has no business being open ended about money. This takes one
 * instruction and hands it to the parser. The examples are there because the
 * fastest way to teach an input is to let someone click one.
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
          className={cn(
            'rounded-xl border bg-paper transition-colors',
            error ? 'border-ink' : 'border-rule focus-within:border-ink',
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
            placeholder="Send &#8358;100,000 to Carlos in Bolivia for his design work."
            aria-label="Describe the payment"
            className="w-full resize-none bg-transparent px-5 pt-5 pb-2 text-[17px] leading-relaxed text-ink outline-none placeholder:text-ink-ghost disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-3 px-4 pb-4">
            <span className="text-[11px] text-ink-faint">
              Enter to send, Shift and Enter for a new line
            </span>
            <Button type="submit" disabled={!text.trim()} busy={busy}>
              {busy ? 'Reading' : 'Plan this payment'}
              {!busy && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
            </Button>
          </div>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-ink">{error}</p>}

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
            className="rounded-lg border border-rule bg-paper px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {example.length > 52 ? example.slice(0, 52) + '\u2026' : example}
          </button>
        ))}
      </div>
    </div>
  );
}
