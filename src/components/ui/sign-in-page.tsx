'use client';

import { useEffect, useRef, useState } from 'react';
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

/** Left panel footage. Swap this path to change the artwork. */
const PANEL_VIDEO = '/panel.mp4';

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
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={form.rememberMe}
                  onChange={handleChange}
                  className="h-4 w-4 cursor-pointer rounded-[4px] border-neutral-300 accent-neutral-950"
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
      <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-medium text-neutral-700">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The dark half.
 *
 * The footage is 15.7 MB and cannot be compressed here, so it is layered over
 * a finished black composition rather than replacing it. The panel is fully
 * legible on first paint and the video fades in once it can actually play. If
 * it never loads, on a slow connection or with media blocked, what remains is
 * a deliberate brand panel rather than an empty rectangle.
 */
function BrandPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Two things go wrong if this is left to the markup alone.
    //
    // The file can reach a playable state before React attaches its handler,
    // in which case `canplay` has already fired and never fires again, so the
    // panel stays at zero opacity over a fully loaded video. Check the
    // readyState directly as well as listening.
    //
    // And autoplay is not guaranteed even when muted, so ask explicitly and
    // accept a refusal rather than leaving a frozen first frame on screen.
    const markReady = () => setVideoReady(true);

    const tryPlay = () => {
      void video.play().catch(() => {
        // Autoplay refused. The composition underneath still reads correctly.
      });
    };

    const sync = () => {
      if (video.readyState >= 3) markReady();
    };

    // Several events can be the one that actually arrives, depending on
    // whether the document was hidden while the file loaded. A hidden tab
    // does not decode video, so `canplay` may never be delivered even though
    // the data is there and readyState later reads 4. Listening to one event
    // alone leaves the panel black for good in that case.
    sync();
    for (const event of ['loadeddata', 'canplay', 'playing'] as const) {
      video.addEventListener(event, markReady);
    }
    tryPlay();

    // Browsers throttle media in a backgrounded tab and do not always resume
    // it on return, which leaves a frozen frame behind the sign in form.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      sync();
      if (video.paused) tryPlay();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      for (const event of ['loadeddata', 'canplay', 'playing'] as const) {
        video.removeEventListener(event, markReady);
      }
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-black p-12 lg:flex">
      <video
        ref={videoRef}
        src={PANEL_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-1000',
          videoReady ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/*
        Scrim, in two layers. The footage runs from a dark interior to a
        brightly lit wall, so a single gradient tuned to one frame fails on the
        other. A flat tint holds a floor of contrast everywhere, and the
        gradient weights the lower two thirds where the mark and the type sit.
      */}
      <div className="absolute inset-0 bg-black/35" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10"
        aria-hidden
      />

      <div className="relative flex items-start justify-between">
        <Link
          href="/"
          aria-label="Back to KORA"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/20 text-white/80 backdrop-blur-sm transition-colors hover:border-white/50 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="relative">
        <Image
          src="/kora-mark-white.png"
          alt="KORA"
          width={718}
          height={679}
          priority
          className="h-[88px]"
          style={{ width: 'auto' }}
        />
        <h2 className="mt-8 text-[42px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
          The African
          <br />
          corridor for Pollar.
        </h2>
        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/60">
          Pollar ramps into Brazil, Colombia, Mexico and Bolivia. KORA is the leg it does not
          have yet.
        </p>
      </div>
    </aside>
  );
}

/** Shown in place of the brand panel on narrow screens, which do not get one. */
function MobileMark() {
  return (
    <div className="mb-10 flex items-center gap-3 lg:hidden">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
        <Image
          src="/kora-mark-white.png"
          alt=""
          width={718}
          height={679}
          className="h-[18px]"
          style={{ width: 'auto' }}
        />
      </span>
      <span className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">KORA</span>
    </div>
  );
}
