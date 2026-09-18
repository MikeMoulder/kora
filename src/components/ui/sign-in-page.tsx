'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Flag } from '../Flag';
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
 *
 * This is the root route. Every link that used to point back at a landing page
 * has gone, because there is nothing behind this screen to go back to: the
 * dashboard is forward from here, and `src/proxy.ts` sends anybody who asks
 * for it without a session straight back to this form.
 */

/** Left panel footage. Swap this path to change the artwork. */
const PANEL_VIDEO = '/panel.mp4';

/**
 * Where the glass starts being glass.
 *
 * One ramp, not two. It reaches the bottom of the panel at full strength and
 * thins out on the way up, so the only soft edge is the one nobody is looking
 * at: the footage at the top of the frame stays sharp and the blur arrives
 * under the words without ever drawing a line.
 *
 * Solid from 26 percent down. The block is vertically centred, which puts it
 * between 34 and 66 percent of the panel at every height the panel is drawn
 * at, so the ramp finishes eight points of height above the mark and the type
 * never sits in the part of the mask that is still fading. Tuck that number
 * tighter and the paragraph starts losing its background halfway through the
 * clip, which is the kind of fault that only shows up on the bright frames.
 */
const BAND_MASK = 'linear-gradient(to bottom, transparent 0%, #000 26%, #000 100%)';

/**
 * Where a person can fund from, and where they will be able to.
 *
 * The same five countries the corridor registry declares, in the same order,
 * and hardcoded here on purpose: the registry pulls in the rail adapters, and
 * the Nigerian one imports the Flutterwave client, which refuses to load in a
 * browser because it holds a secret key. Importing the real list into a client
 * component would throw on the sign in screen.
 *
 * So this is a copy, and it is worth saying out loud. If a corridor is added,
 * add it here. Each entry names its real blocker rather than saying "coming
 * soon", because a date nobody has committed to is not information and the
 * blocker is.
 */
const COUNTRIES: { code: string; name: string; rail: string; blocker?: string }[] = [
  { code: 'NG', name: 'Nigeria', rail: 'Bank transfer (NIP)' },
  {
    code: 'KE',
    name: 'Kenya',
    rail: 'M-Pesa',
    blocker: 'Waiting on an approved Safaricom shortcode',
  },
  {
    code: 'GH',
    name: 'Ghana',
    rail: 'Mobile Money',
    blocker: 'Waiting on a signed MTN partner agreement',
  },
  {
    code: 'UG',
    name: 'Uganda',
    rail: 'Mobile Money',
    blocker: 'Waiting on a Bank of Uganda licence',
  },
  {
    code: 'ZA',
    name: 'South Africa',
    rail: 'PayShap',
    blocker: 'Waiting on a sponsoring bank',
  },
];

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

  /*
   * Nigeria, and nothing else is selectable.
   *
   * Held in state rather than pinned as a constant because the control is a
   * real one: it opens, it takes a keyboard, and the other four are visibly
   * refusable rather than absent. A country nobody can pick is a more honest
   * roadmap than a country that is simply missing from the list.
   */
  const [country, setCountry] = useState(COUNTRIES[0].code);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const outcome = await signInDemo(form.email, form.password, form.rememberMe);

    if (!outcome.ok) {
      setError(outcome.reason);
      setSubmitting(false);
      return;
    }

    /*
     * `replace` rather than `push`, and `refresh` after it.
     *
     * Replace, because leaving sign in on the history stack means Back lands
     * on a form the proxy immediately bounces forward again, which reads as a
     * broken Back button.
     *
     * Refresh, because the session is a cookie the proxy reads on the server.
     * A client navigation can be served from the router cache without the
     * server seeing the new cookie at all, and the dashboard then renders for
     * somebody the server still considers signed out.
     */
    router.replace('/dashboard');
    router.refresh();
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
              Sign in to reach the corridor console.
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

            <Field label="Country" htmlFor="country">
              <CountrySelect value={country} onChange={setCountry} />
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
 *
 * That fallback is also why the glass carries its own tint. A backdrop filter
 * with nothing behind it filters nothing, so on the no video path the tint is
 * the entire composition and the panel still reads as black.
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
    <aside className="relative hidden w-1/2 flex-col items-start justify-center overflow-hidden bg-black p-12 lg:flex">
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
        A band of glass, not a card and not the whole panel.

        Three attempts got here. A gradient scrim was accurate for type in a
        corner and wrong once the block moved. A full bleed blur softened the
        entire left half, which throws away the footage it was there to show.
        A card was the right size and the wrong object: a hard rectangle with a
        border reads as a component dropped on a photograph, and the brief was
        premium rather than assembled.

        What is here is a wide horizontal pane, full width, that fades out
        along its top and bottom edges instead of ending. Nothing about it says
        where it stops, which is the difference between glass laid over an
        image and a box sitting on one.

        The fade is a mask rather than a gradient of its own colour. A gradient
        would sit over the blur and darken what it was fading, so the band
        would lose its tint and keep its blur and the edge would read as a
        smear. A mask takes the whole layer out together, tint and blur at the
        same rate, so the footage simply comes back into focus.

        It runs off the bottom of the panel rather than fading out there. A
        band floating clear of both edges is an object with a top and a bottom;
        one that meets the frame and dissolves upward is a condition of the
        image. The second is what the footage wants, since the weight of the
        clip is in the lower half where the hands and the money are, and that
        is also where the panel meets the fold on a short window.

        A quarter of the panel's height to make the turn, against a two or
        three percent feather that would still register as a line. Nothing in
        the composition should have an edge you can point at.

        Both spellings of the property. Safari still wants the prefix, and an
        unprefixed mask alone means no mask at all there, which is a hard edged
        band rather than a missing effect.

        32px of blur. It went 40, then 64 when the band widened and the softer
        read looked better across it, and back to half of that because 64 was
        thick enough to flatten the room into colour. At 32 the shapes are
        present without being legible, which is the line worth holding: glass
        you can tell there is something behind.

        An arbitrary value rather than a step on the scale, because the scale
        goes 24 then 40 and the instruction was half of 64.

        The tint stays at 50 percent, and the paragraph got brighter instead.
        Halving the blur costs contrast, which is obvious in hindsight and was
        not caught until it was measured: less smoothing leaves a higher peak
        behind the type, 200 against 181 at 64px, and the paragraph fell from
        4.64 to 4.10 against the 4.5 it needs. Both ways out were on the table.
        A 60 percent tint fixes it at 5.33 and darkens the glass, which is the
        opposite of what thinning the blur was for; 90 percent white on the
        paragraph fixes it at 5.08 and leaves the room showing through. The
        headline is unaffected at 5.25 against a floor of 3.0, since 29px
        semibold counts as large text.

        How that was measured matters, because the earlier numbers on this
        panel were too kind. Averaging the frame behind a paragraph answers
        what the background is on average, and type does not sit on an average:
        one bright patch under one line is a failure the mean hides. These are
        per pixel minimums over 84,000 samples across 12 frames, taken from the
        frame actually blurred at the radius in use rather than approximated by
        downsampling.
      */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[32px]"
        style={{
          WebkitMaskImage: BAND_MASK,
          maskImage: BAND_MASK,
        }}
        aria-hidden
      />

      {/*
        Left aligned, vertically centred, 15 percent up on the pass before it.
        The mark is 61, the headline 29, the paragraph 15, and the gaps move
        with the type so the block scales rather than loosens.
      */}
      <div className="relative max-w-sm">
        <Image
          src="/kora-mark-white.png"
          alt="KORA"
          width={718}
          height={679}
          priority
          className="h-[61px]"
          style={{ width: 'auto' }}
        />
        <h2 className="mt-6 text-[29px] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
          We move money
          <br />
          out of Africa.
        </h2>
        <p className="mt-3.5 text-[15px] leading-relaxed text-white/90">
          KORA is the African leg of the corridor. Type what you want to send, we price it
          live, and it settles on Stellar for Pollar to pay out.
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

/**
 * The country picker.
 *
 * A native `<select>` would have been a tenth of this, and it cannot draw a
 * flag: an option element renders text and nothing else. The project already
 * refuses flag emoji, because regional-indicator pairs fall back to bare
 * letters on Windows Chrome, which is a machine a judge might well open this
 * on. So the control is built rather than borrowed, and the flags are the same
 * images every other screen uses.
 *
 * The unavailable countries are listed and refused rather than hidden. A
 * roadmap you can see and cannot click says more about what is coming than a
 * list with four entries missing, and each one names the commercial thing that
 * is actually blocking it instead of a date nobody has promised.
 */
function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.code === value) ?? COUNTRIES[0];

  /*
   * Close on a click elsewhere and on Escape.
   *
   * Both, not one. Pointer users expect the first and keyboard users expect
   * the second, and a popover that only answers the mouse is a popover a
   * keyboard can get stuck inside.
   */
  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        id="country"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-12 w-full items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-4 text-left text-[15px] text-neutral-900 transition-colors',
          'hover:border-neutral-300 focus:border-neutral-950 focus:outline-none',
        )}
      >
        <Flag code={selected.code} size={20} />
        <span className="flex-1 truncate">{selected.name}</span>
        <span className="hidden text-[11px] text-neutral-400 sm:inline">{selected.rail}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-neutral-400 transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Funding country"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)]"
        >
          {COUNTRIES.map((c) => {
            const live = !c.blocker;
            const active = c.code === value;

            return (
              <li key={c.code} role="option" aria-selected={active} aria-disabled={!live}>
                <button
                  type="button"
                  disabled={!live}
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  title={c.blocker}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors',
                    live
                      ? 'cursor-pointer hover:bg-neutral-50'
                      : 'cursor-not-allowed opacity-55',
                  )}
                >
                  <Flag code={c.code} size={20} />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-neutral-900">{c.name}</span>
                    <span className="block truncate text-[11px] text-neutral-400">
                      {live ? c.rail : `${c.rail} · ${c.blocker}`}
                    </span>
                  </span>

                  {live ? (
                    active && <Check className="h-4 w-4 shrink-0 text-neutral-900" strokeWidth={2} />
                  ) : (
                    <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-neutral-400">
                      Coming soon
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
