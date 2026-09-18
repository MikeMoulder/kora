'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signInDemo, DEMO_CREDENTIALS } from '@/lib/demo-auth';

/**
 * Sign in.
 *
 * Adapted from the supplied reference in two ways that were not optional.
 *
 * Routing: the reference used `react-router-dom`. This is a Next.js App Router
 * project, where `useNavigate` only works inside a `<BrowserRouter>` and adding
 * one breaks Next's own routing. Navigation here uses `next/navigation` and
 * `next/link`, which the shipped Next docs give as the equivalent.
 *
 * Authentication: there is none, by request. `signInDemo` accepts anything
 * shaped like a credential and writes a session flag. The panel says so in
 * plain words rather than implying a real account exists.
 */

/**
 * Left panel artwork. Replace this path when the final image lands and the
 * panel switches from the brand composition to the photograph automatically.
 */
const PANEL_IMAGE: string | null = null;

export function SignInPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password,
    rememberMe: true,
  });

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const outcome = await signInDemo(form.email, form.password);

    if (!outcome.ok) {
      setError(outcome.reason);
      setSubmitting(false);
      return;
    }

    router.push('/');
  }

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />

      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-sm">
          <MobileMark />

          <header>
            <h1 className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-neutral-950">
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-neutral-500">
              Don&rsquo;t have an account?{' '}
              <Link
                href="/signin"
                className="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-950"
              >
                Request access
              </Link>
            </p>
          </header>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <Field label="Email address" htmlFor="email">
              <input
                id="email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@company.com"
                autoComplete="email"
                required
                className={inputClass}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className={cn(inputClass, 'pr-11')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </Field>

            <div className="flex items-center justify-between pt-1">
              <label className="group flex cursor-pointer items-center gap-2.5 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={form.rememberMe}
                  onChange={handleChange}
                  className="h-4 w-4 cursor-pointer rounded-[4px] border-neutral-300 text-neutral-950 accent-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:ring-offset-0"
                />
                Remember me
              </label>
              <button
                type="button"
                className="text-sm text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-950 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <p role="alert" className="text-sm text-neutral-950">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Signing in' : 'Sign in'}
            </button>
          </form>

          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs uppercase tracking-[0.14em] text-neutral-400">
                or
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SocialButton label="Google" icon={<GoogleMark />} />
            <SocialButton label="GitHub" icon={<GitHubMark />} />
          </div>

          <p className="mt-8 border-t border-neutral-100 pt-5 text-xs leading-relaxed text-neutral-400">
            Demo build. There is no account system behind this screen, any credentials are
            accepted, and nothing is sent anywhere. The fields are pre-filled so you can go
            straight through.
          </p>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'h-12 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-[15px] text-neutral-950 outline-none transition-colors placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[13px] font-medium text-neutral-700"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SocialButton({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-11 items-center justify-center gap-2.5 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * The dark half.
 *
 * The mark is served from a derived asset, not the supplied file. The original
 * was an opaque PNG with the background baked in at rgb(12,12,12), which shows
 * as a lighter square on a black panel. `npm run prepare:logo` rebuilds it with
 * a real alpha channel and trims the margin. See scripts/prepare-logo.ts.
 */
function BrandPanel() {
  return (
    <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-black p-12 lg:flex">
      {PANEL_IMAGE && (
        <Image
          src={PANEL_IMAGE}
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover opacity-90"
        />
      )}

      <div className="relative flex items-start justify-between">
        <Link
          href="/"
          aria-label="Back to KORA"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      </div>

      {!PANEL_IMAGE && (
        <div className="relative">
          <Image
            src="/kora-mark.png"
            alt="KORA"
            width={560}
            height={489}
            priority
            className="h-[92px]"
            style={{ width: 'auto' }}
          />
          <h2 className="mt-9 text-[42px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            The African
            <br />
            corridor for Pollar.
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/45">
            Pollar ramps into Brazil, Colombia, Mexico and Bolivia. KORA is the leg it does
            not have yet.
          </p>
        </div>
      )}

      <div className="relative flex items-center gap-4 border-t border-white/10 pt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
        <span>NGN</span>
        <Rule />
        <span>USDC</span>
        <Rule />
        <span className="text-white/60">BOB</span>
      </div>
    </aside>
  );
}

function Rule() {
  return <span className="h-px flex-1 bg-white/15" aria-hidden />;
}

/** Shown in place of the brand panel on narrow screens, which do not get one. */
function MobileMark() {
  return (
    <div className="mb-10 flex items-center gap-3 lg:hidden">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
        <Image
          src="/kora-mark.png"
          alt=""
          width={560}
          height={489}
          className="h-[18px]"
          style={{ width: 'auto' }}
        />
      </span>
      <span className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">KORA</span>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
