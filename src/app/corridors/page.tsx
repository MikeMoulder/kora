import Link from 'next/link';
import Image from 'next/image';
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

/** Readiness reuses the ownership language: filled, outlined, dashed. */
const READINESS_CLASS: Record<CorridorReadiness, string> = {
  live: 'leg-ours',
  sandbox: 'leg-theirs',
  planned: 'leg-simulated',
};

export default function CorridorsPage() {
  const countries = corridorsByCountry();
  const coverage = coverageSummary();
  const added = koraRails();

  return (
    <div className="min-h-screen bg-paper">
      <PageHeader />

      <main className="mx-auto w-full max-w-4xl px-5 pb-24 sm:px-6">
        <section className="pt-12 pb-10">
          <h1 className="text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[46px]">
            The corridor registry
          </h1>
          <p className="mt-5 max-w-2xl text-pretty leading-relaxed text-ink-muted">
            Pollar defines the unit of a ramp as{' '}
            <span className="text-ink">
              direction plus country plus fiat plus rail plus the on-chain asset
            </span>
            , and holds itself to a rule: the dashboard can never enable a route with no code
            behind it. KORA adopts both, the model and the rule. Everything below is declared
            by an adapter, and anything not marked executable will refuse to run.
          </p>
        </section>

        {/* Rails, side by side */}
        <Section title="Rails">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="leg-theirs rounded-xl p-5">
              <div className="text-xs font-semibold">
                Pollar&rsquo;s rail enum, @pollar/core 0.11.3
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {POLLAR_RAILS.map((rail) => (
                  <span
                    key={rail}
                    className="rounded-md border border-ink px-2 py-1 font-mono text-xs"
                  >
                    {rail}
                  </span>
                ))}
              </div>
              <p className="mt-3.5 text-xs leading-relaxed text-ink-muted">
                Six rails. SPEI is Mexican, PIX Brazilian, PSE and BreB Colombian, ACH and QR
                Bolivian. There is no African rail in the type system.
              </p>
            </div>

            <div className="leg-ours rounded-xl p-5">
              <div className="text-xs font-semibold">KORA adds</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {added.map((rail) => (
                  <span
                    key={rail}
                    className="rounded-md border border-ink/30 px-2 py-1 font-mono text-xs"
                  >
                    {rail}
                  </span>
                ))}
              </div>
              <p className="mt-3.5 text-xs leading-relaxed text-ink/70">
                Extending the enum rather than replacing it. A corridor typed KoraRail can be
                either, which is what lets one renderer serve both registries.
              </p>
            </div>
          </div>
        </Section>

        {/* Coverage */}
        <Section title="Coverage">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(coverage.pollarCountries)} label="Pollar countries" note="BR, CO, MX, BO" owner="theirs" />
            <Stat
              value={String(coverage.pollarAfricanCorridors)}
              label="African corridors in Pollar"
              note="The gap"
              owner="simulated"
            />
            <Stat value={String(coverage.koraCountries)} label="KORA countries" note="Declared through adapters" owner="ours" />
            <Stat
              value={`${coverage.koraExecutable}/${coverage.koraCorridors}`}
              label="Executable today"
              note="The rest refuse to run"
              owner="ours"
            />
          </div>
        </Section>

        {/* KORA corridors */}
        <Section title="KORA, African corridors">
          <div className="space-y-3">
            {countries.map((group) => (
              <div key={group.country} className="rounded-xl border border-rule p-4">
                <div className="flex items-center gap-2.5">
                  <Flag code={group.country} size={18} />
                  <span className="text-sm font-semibold">{group.countryName}</span>
                  <span className="font-mono text-xs text-ink-faint">{group.fiat}</span>
                  {group.corridors.some(isExecutable) && (
                    <span className="ml-auto rounded-full bg-ink px-2 py-[2px] text-[10px] uppercase tracking-[0.1em] text-paper">
                      executable
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {group.corridors.map((corridor) => (
                    <div
                      key={corridor.id}
                      className={`rounded-lg px-3.5 py-3 ${READINESS_CLASS[corridor.readiness]}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="rounded border border-current/30 px-1.5 py-0.5 font-mono text-[10px]">
                            {corridor.rail}
                          </span>
                          <span className="text-sm font-medium">{corridor.railLabel}</span>
                        </div>
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] opacity-70">
                          {corridor.readiness}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-60">
                        <span className="font-mono">{corridor.id}</span>
                        <span>
                          {corridor.limits.min.toLocaleString()}&ndash;
                          {corridor.limits.max.toLocaleString()} {corridor.fiat}
                        </span>
                        <span>{corridor.estimatedTime}</span>
                      </div>

                      {corridor.readinessNote && (
                        <p className="mt-2 text-xs leading-relaxed opacity-75">
                          {corridor.readinessNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Pollar corridors */}
        <Section
          title="Pollar, live corridors"
          subtitle="Transcribed from Pollar's operator docs, Integrations then Ramps, on 2026-09-17."
        >
          <div className="overflow-hidden rounded-xl border-[1.5px] border-ink">
            <table className="w-full text-left text-sm">
              <thead className="border-b-[1.5px] border-ink bg-paper-sunk text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Provider</th>
                  <th className="px-3 py-2.5 font-medium">Country</th>
                  <th className="px-3 py-2.5 font-medium">Fiat</th>
                  <th className="px-3 py-2.5 font-medium">Rail</th>
                  <th className="px-3 py-2.5 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {POLLAR_CORRIDORS.map((row, i) => (
                  <tr key={`${row.provider}-${row.country}-${i}`}>
                    <td className="px-3 py-2.5">{row.provider}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <Flag code={row.country} size={14} />
                        {row.countryName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{row.fiat}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.rail}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{row.direction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Adapters */}
        <Section
          title="Adapters"
          subtitle="Each implements the same four verbs Pollar's ramp client exposes: quote, create, status, confirm. So the engine above them is rail agnostic and a real integration drops in where a sandbox one sits today."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {adapters.map((adapter) => (
              <div key={adapter.id} className="rounded-xl border border-rule p-4">
                <div className="font-mono text-[11px] text-ink-muted">{adapter.id}</div>
                <div className="mt-1.5 text-sm font-medium">{adapter.displayName}</div>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  {adapter.settlementNote}
                </p>
                <div className="mt-3 text-[11px] text-ink-faint">
                  {adapter.corridors.length} corridor{adapter.corridors.length === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}

function PageHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink">
            <Image
              src="/kora-mark.png"
              alt=""
              width={560}
              height={489}
              className="h-[13px]"
              style={{ width: 'auto' }}
            />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">KORA</span>
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink"
        >
          Back to the composer
        </Link>
      </div>
    </header>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-faint">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({
  value,
  label,
  note,
  owner,
}: {
  value: string;
  label: string;
  note: string;
  owner: 'ours' | 'theirs' | 'simulated';
}) {
  const cls =
    owner === 'ours' ? 'leg-ours' : owner === 'theirs' ? 'leg-theirs' : 'leg-simulated';

  return (
    <div className={`rounded-xl p-4 ${cls}`}>
      <div className="tabular text-[32px] font-semibold leading-none tracking-[-0.03em]">
        {value}
      </div>
      <div className="mt-2 text-xs font-medium">{label}</div>
      <div className="mt-0.5 text-[11px] opacity-60">{note}</div>
    </div>
  );
}
