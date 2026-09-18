import Link from 'next/link';
import { Flag } from '@/components/Flag';
import {
  POLLAR_CORRIDORS,
  POLLAR_RAILS,
  adapters,
  corridorsByCountry,
  coverageSummary,
  isExecutable,
  koraRails,
} from '@/lib/corridor/registry';
import type { CorridorReadiness } from '@/lib/corridor/types';

export const metadata = {
  title: 'Corridor registry — KORA',
  description:
    'Pollar’s ramp registry covers Brazil, Colombia, Mexico and Bolivia. This is the African side, declared against the same contract.',
};

const READINESS_STYLE: Record<CorridorReadiness, string> = {
  live: 'text-live border-live/30 bg-live/10',
  sandbox: 'text-sandbox border-sandbox/30 bg-sandbox/10',
  planned: 'text-ink-400 seam bg-ink-850',
};

export default function CorridorsPage() {
  const countries = corridorsByCountry();
  const coverage = coverageSummary();
  const added = koraRails();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          KORA
        </Link>
        <Link
          href="/"
          className="rounded-lg border seam px-3 py-1.5 text-xs text-ink-300 transition-colors hover:border-amber-core/30 hover:text-ink-100"
        >
          ← Back to the composer
        </Link>
      </header>

      <section className="pt-6 pb-10">
        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          The corridor registry
        </h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-ink-400">
          Pollar defines the unit of a ramp as{' '}
          <em className="text-ink-200 not-italic">
            direction + country + fiat + rail + the on-chain asset
          </em>
          , and holds itself to a rule: the dashboard can never enable a route with no code behind
          it. KORA adopts both — the model and the rule. Everything below is declared by an
          adapter, and anything not marked executable will refuse to run.
        </p>
      </section>

      {/* ── Rail enums, side by side ─────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
          Rails
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-flow-core/25 bg-flow-wash/30 p-5">
            <div className="text-xs font-semibold text-flow-glow">
              Pollar&rsquo;s rail enum · @pollar/core 0.11.3
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {POLLAR_RAILS.map((rail) => (
                <span
                  key={rail}
                  className="rounded-md border border-flow-core/30 bg-ink-950/40 px-2 py-1 font-mono text-xs text-flow-glow"
                >
                  {rail}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-400">
              Six rails. SPEI is Mexican, PIX Brazilian, PSE and BreB Colombian, ACH and QR
              Bolivian. There is no African rail in the type system.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-core/25 bg-amber-wash/40 p-5">
            <div className="text-xs font-semibold text-amber-glow">KORA adds</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {added.map((rail) => (
                <span
                  key={rail}
                  className="rounded-md border border-amber-core/30 bg-ink-950/40 px-2 py-1 font-mono text-xs text-amber-glow"
                >
                  {rail}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-400">
              Extending the enum rather than replacing it. A corridor typed{' '}
              <code className="text-ink-300">KoraRail</code> can be either, which is what lets one
              renderer serve both registries.
            </p>
          </div>
        </div>
      </section>

      {/* ── Coverage ─────────────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
          Coverage
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat
            value={String(coverage.pollarCountries)}
            label="Pollar countries"
            note="BR · CO · MX · BO"
            tone="pollar"
          />
          <Stat
            value={String(coverage.pollarAfricanCorridors)}
            label="African corridors in Pollar"
            note="The gap"
            tone="pollar"
          />
          <Stat
            value={String(coverage.koraCountries)}
            label="KORA countries"
            note="Declared through adapters"
            tone="kora"
          />
          <Stat
            value={`${coverage.koraExecutable}/${coverage.koraCorridors}`}
            label="Executable today"
            note="The rest refuse to run"
            tone="kora"
          />
        </div>
      </section>

      {/* ── KORA corridors ───────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
          KORA · African corridors
        </h2>

        <div className="mt-4 space-y-3">
          {countries.map((group) => (
            <div key={group.country} className="rounded-2xl border seam bg-ink-900/50 p-4">
              <div className="flex items-center gap-2.5">
                <Flag code={group.country} size={20} />
                <span className="text-sm font-semibold text-ink-100">{group.countryName}</span>
                <span className="font-mono text-xs text-ink-500">{group.fiat}</span>
                {group.corridors.some(isExecutable) && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-live">
                    executable
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {group.corridors.map((corridor) => (
                  <div
                    key={corridor.id}
                    className="rounded-xl border seam bg-ink-950/40 px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">
                          {corridor.rail}
                        </span>
                        <span className="text-sm text-ink-200">{corridor.railLabel}</span>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${READINESS_STYLE[corridor.readiness]}`}
                      >
                        {corridor.readiness}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
                      <span className="font-mono">{corridor.id}</span>
                      <span>
                        {corridor.limits.min.toLocaleString()}–
                        {corridor.limits.max.toLocaleString()} {corridor.fiat}
                      </span>
                      <span>{corridor.estimatedTime}</span>
                    </div>

                    {corridor.readinessNote && (
                      <p className="mt-2 text-xs leading-relaxed text-ink-500">
                        {corridor.readinessNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pollar corridors ─────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
          Pollar · live corridors
        </h2>
        <p className="mt-2 text-xs text-ink-500">
          Transcribed from Pollar&rsquo;s operator docs (Integrations → Ramps) on 2026-09-17.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-flow-core/20">
          <table className="w-full text-left text-sm">
            <thead className="bg-flow-wash/40 text-[10px] uppercase tracking-wider text-flow-glow/80">
              <tr>
                <th className="px-3 py-2.5 font-medium">Provider</th>
                <th className="px-3 py-2.5 font-medium">Country</th>
                <th className="px-3 py-2.5 font-medium">Fiat</th>
                <th className="px-3 py-2.5 font-medium">Rail</th>
                <th className="px-3 py-2.5 font-medium">Direction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-flow-core/10 bg-ink-900/40">
              {POLLAR_CORRIDORS.map((row, i) => (
                <tr key={`${row.provider}-${row.country}-${i}`}>
                  <td className="px-3 py-2.5 text-ink-200">{row.provider}</td>
                  <td className="px-3 py-2.5 text-ink-300">
                    <span className="flex items-center gap-2">
                      <Flag code={row.country} size={15} />
                      {row.countryName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink-400">{row.fiat}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-flow-glow">{row.rail}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-500">{row.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Adapters ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
          Adapters
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-500">
          Each implements the same four verbs Pollar&rsquo;s ramp client exposes — quote, create,
          status, confirm — so the engine above them is rail-agnostic and a real integration drops
          in where a sandbox one sits today.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {adapters.map((adapter) => (
            <div key={adapter.id} className="rounded-2xl border seam bg-ink-900/50 p-4">
              <div className="font-mono text-[11px] text-amber-glow">{adapter.id}</div>
              <div className="mt-1.5 text-sm font-medium text-ink-100">{adapter.displayName}</div>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">{adapter.settlementNote}</p>
              <div className="mt-3 text-[11px] text-ink-600">
                {adapter.corridors.length} corridor{adapter.corridors.length === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({
  value,
  label,
  note,
  tone,
}: {
  value: string;
  label: string;
  note: string;
  tone: 'kora' | 'pollar';
}) {
  const accent = tone === 'kora' ? 'text-amber-glow' : 'text-flow-glow';
  const border = tone === 'kora' ? 'border-amber-core/20' : 'border-flow-core/20';

  return (
    <div className={`rounded-2xl border ${border} bg-ink-900/50 p-4`}>
      <div className={`tabular text-3xl font-bold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-1 text-xs font-medium text-ink-200">{label}</div>
      <div className="mt-0.5 text-[11px] text-ink-600">{note}</div>
    </div>
  );
}
