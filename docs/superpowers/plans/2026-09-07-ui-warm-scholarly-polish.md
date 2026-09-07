# Warm Scholarly UI Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved warm-scholarly design system (spec: `docs/superpowers/specs/2026-09-07-ui-polish-design.md`) to every screen — landing, session (all phases), report, /demo — as a visual-only change.

**Architecture:** Design tokens in `tailwind.config.ts` + `globals.css`, five small primitives in `src/components/ui/`, then restyle each screen with them. No flow/logic changes; every `data-testid` and every visible string stays byte-identical so the existing Vitest + Playwright suites guard the refactor.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS v3, `next/font/google` (Fraunces) + existing local Geist fonts. No new npm dependencies.

**Testing note:** This is presentation-only work — no new unit tests (nothing testable beyond rendering; the existing 61 unit tests + 2 e2e specs assert the unchanged testids/copy). Each task verifies with `pnpm exec tsc --noEmit`, `pnpm test`, and finally `pnpm e2e`.

**IMPORTANT:** `src/hooks/useVoiceAgent.ts` and `src/components/SessionClient.tsx` contain UNCOMMITTED voice-fix work (gapless playback, voice "jane"). Commit steps below must `git add` only the exact files listed — never `git add -A`.

---

### Task 1: Foundation — tokens, fonts, metadata

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update `tailwind.config.ts`** (fonts mapped to CSS vars; cream/warm/coral tokens; warm shadow). Full replacement:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F2",
        warm: "#E7E0D4",
        coral: "#E76F51",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      boxShadow: {
        warm: "0 1px 3px rgba(28,25,23,0.06), 0 4px 12px rgba(28,25,23,0.05)",
      },
    },
  },
  plugins: [],
};
export default config;
```

(No component used `bg-background`/`text-foreground` — verified across all pages/components — so those CSS-var colors are dropped.)

- [ ] **Step 2: Replace `src/app/globals.css`** — remove the Arial override and the dark-mode block; lock warm light theme:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  color: #292524; /* stone-800 */
  background: #faf7f2; /* cream */
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
```

- [ ] **Step 3: Update `src/app/layout.tsx`** — add Fraunces, apply `font-sans`, real metadata. Full replacement:

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReadPulse — 1-minute reading check-in",
  description:
    "A voice agent that listens to a child read aloud for one minute, scores it by the book, and benchmarks against national norms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; 61/61 tests pass. (Fraunces downloads on first `next dev`/`build` — network required; fallback Georgia.)

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): warm scholarly design tokens, Fraunces + Geist fonts, real metadata"
```

---

### Task 2: UI primitives (`src/components/ui/`)

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Card.tsx`
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/StatTile.tsx`
- Create: `src/components/ui/ProgressBar.tsx`

- [ ] **Step 1: Create `src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "rounded-xl bg-teal-700 px-4 py-2.5 font-semibold text-white shadow-warm hover:bg-teal-800 disabled:opacity-50",
  secondary:
    "rounded-xl border border-warm bg-white px-4 py-2.5 font-semibold text-stone-800 shadow-warm hover:bg-cream disabled:opacity-50",
  ghost:
    "rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

// Shared button primitive so every screen's call-to-action looks the same.
// Spread after `type` so callers can override with type="submit".
export default function Button({ variant = "primary", children, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} className={`${VARIANTS[variant]} ${rest.className ?? ""}`}>
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create `src/components/ui/Card.tsx`**

```tsx
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

// Warm white surface: the base container for every content block.
export default function Card({ children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-warm bg-white p-6 shadow-warm ${rest.className ?? ""}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/ui/Badge.tsx`**

```tsx
import type { ReactNode } from "react";

const TONES = {
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  teal: "bg-teal-50 text-teal-700",
} as const;

export default function Badge({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Create `src/components/ui/StatTile.tsx`**

```tsx
import type { ReactNode } from "react";

interface StatTileProps {
  value: ReactNode;
  label: string;
  footnote?: ReactNode;
  testId?: string;
}

// Big-number metric tile (WCPM, accuracy, reading time, RAN speed).
export default function StatTile({ value, label, footnote, testId }: StatTileProps) {
  return (
    <div className="rounded-2xl border border-warm bg-white p-4 text-center shadow-warm">
      <p className="font-serif text-4xl font-semibold text-stone-900" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1 text-sm text-stone-500">{label}</p>
      {footnote ? <p className="mt-1 text-xs">{footnote}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/ui/ProgressBar.tsx`**

```tsx
interface ProgressBarProps {
  value: number;
  max: number;
}

// Slim progress track for the reading countdown (fill shrinks as time runs out).
export default function ProgressBar({ value, max }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full bg-teal-700 transition-[width] duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; 61/61 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): Button, Card, Badge, StatTile, ProgressBar primitives"
```

---

### Task 3: Shared display components

**Files:**
- Modify: `src/components/PassageCard.tsx` (full replacement)
- Modify: `src/components/RanGrid.tsx` (one className change)
- Modify: `src/components/PercentileChart.tsx` (band tints + marker color)

- [ ] **Step 1: Replace `src/components/PassageCard.tsx`** — storybook serif styling:

```tsx
import type { Passage } from "@/lib/data/passages";

// Storybook-style passage display: large serif type with relaxed leading for
// on-screen reading by early readers.
export default function PassageCard({ passage }: { passage: Passage }) {
  return (
    <section aria-label={`Passage: ${passage.title}`}>
      <h2 className="mb-4 font-serif text-xl font-semibold text-stone-900">{passage.title}</h2>
      <div className="space-y-5 font-serif text-2xl leading-relaxed text-stone-800">
        {passage.sentences.map((sentence, i) => (
          <p key={i}>{sentence.trim()}</p>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: In `src/components/RanGrid.tsx`** change the item container className from
`"flex h-16 w-16 items-center justify-center rounded-lg border-2 border-gray-200 text-4xl"`
to
`"flex h-16 w-16 items-center justify-center rounded-xl border border-warm bg-white text-4xl shadow-warm"`.
Stimulus swatch colors (`COLORS`) stay untouched — they are test stimuli.

- [ ] **Step 3: In `src/components/PercentileChart.tsx`** update the three `ReferenceArea` fills and the `ReferenceLine`:

```tsx
          <ReferenceArea x1={0} x2={10} y1={0} y2={1} fill="#DC2626" fillOpacity={0.1} />
          <ReferenceArea x1={10} x2={25} y1={0} y2={1} fill="#D97706" fillOpacity={0.1} />
          <ReferenceArea x1={25} x2={100} y1={0} y2={1} fill="#16A34A" fillOpacity={0.1} />
          <ReferenceLine
            x={x}
            stroke="#0F766E"
            strokeWidth={2}
            label={{ value: label, position: "top", fontSize: 12, fill: "#292524" }}
          />
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; 61/61 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/PassageCard.tsx src/components/RanGrid.tsx src/components/PercentileChart.tsx
git commit -m "feat(ui): storybook passage, warm RAN grid, muted percentile bands"
```

---

### Task 4: Landing, session invalid state, demo page

**Files:**
- Modify: `src/app/page.tsx` (full replacement)
- Modify: `src/app/session/page.tsx` (invalid-state block only)
- Modify: `src/app/demo/page.tsx` (styling only)

- [ ] **Step 1: Replace `src/app/page.tsx`** — centered card, serif wordmark, styled form (all copy identical):

```tsx
// Setup form: server component; a plain GET form navigates to /session with query params.
export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <main className="space-y-6 rounded-2xl border border-warm bg-white p-8 shadow-warm">
        <header className="space-y-2 text-center">
          <h1 className="font-serif text-3xl font-semibold text-stone-900">ReadPulse</h1>
          <p className="text-sm text-stone-500">
            Read a short passage aloud and get an instant reading report.
          </p>
        </header>

        <form action="/session" method="get" className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="childName" className="block text-sm font-semibold">
              Child&apos;s first name
            </label>
            <input
              id="childName"
              name="childName"
              type="text"
              className="w-full rounded-xl border border-warm bg-white px-3 py-2.5 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              placeholder="Optional"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="grade" className="block text-sm font-semibold">
              Grade
            </label>
            <select
              id="grade"
              name="grade"
              defaultValue="3"
              className="w-full rounded-xl border border-warm bg-white px-3 py-2.5 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            >
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="season" className="block text-sm font-semibold">
              Season
            </label>
            <select
              id="season"
              name="season"
              defaultValue="winter"
              className="w-full rounded-xl border border-warm bg-white px-3 py-2.5 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            >
              <option value="fall">Fall</option>
              <option value="winter">Winter</option>
              <option value="spring">Spring</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white shadow-warm hover:bg-teal-800"
          >
            Start session
          </button>

          <p className="text-center text-xs text-stone-400">
            Grade 1 fall has no published norms - choose winter or spring.
          </p>
        </form>
      </main>
    </div>
  );
}
```

Note: all copy stays identical — the wordmark h1 simply becomes serif; no test depends on the landing page.

- [ ] **Step 2: In `src/app/session/page.tsx`** replace the invalid-link block (keep text identical):

```tsx
      <div className="mx-auto max-w-md p-6">
        <div className="space-y-4 rounded-2xl border border-warm bg-white p-6 shadow-warm">
          <p className="text-stone-700">
            That session link is missing or invalid. Grade 1 fall is not supported.
          </p>
          <a href="/" className="text-sm font-semibold text-teal-700 underline">
            Back to setup
          </a>
        </div>
      </div>
```

- [ ] **Step 3: Restyle `src/app/demo/page.tsx`** (styling only — all handlers, ids, options, copy identical):
  - `main`: `className="mx-auto max-w-2xl space-y-8 p-6"`
  - Wrap the `<form>` in `<div className="space-y-4 rounded-2xl border border-warm bg-white p-6 shadow-warm">` ... `</div>`
  - Header h1: add `font-serif` and `text-stone-900`; sub-paragraph: `text-sm text-stone-500`
  - All `input`/`select` elements: `className="w-full rounded-xl border border-warm bg-white px-3 py-2.5 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"` (file input keeps `id="audio"`, `accept`, `onChange` unchanged)
  - Submit button: `className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white shadow-warm hover:bg-teal-800 disabled:opacity-50"` (keep `disabled={!file || submitting}` and the label logic)
  - Error paragraph: `className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"`
  - Result section wrapper: keep `<section className="space-y-4">`; result card already comes from the redesigned ReportView (Task 6)
  - e2e anchors (unchanged): h1 contains "score a recording"; submit button name /score reading/i; disabled until file chosen

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; 61/61 pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/session/page.tsx src/app/demo/page.tsx
git commit -m "feat(ui): warm card styling for landing, session invalid state, demo form"
```

---

### Task 5: SessionClient — all phases

**Files:**
- Modify: `src/components/SessionClient.tsx` (JSX return block + imports only; all logic/hooks untouched)

- [ ] **Step 1: Add imports** at the top (after existing component imports):

```tsx
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ProgressBar from "@/components/ui/ProgressBar";
```

- [ ] **Step 2: Replace the entire `return (...)` JSX** of SessionClient. Every `data-testid`, every visible string, every `onClick` stays identical — only classes/wrappers change:

```tsx
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <p className="font-serif text-lg font-bold text-stone-900">ReadPulse</p>
        <p className="flex items-center gap-1.5 text-xs text-stone-500" data-testid="status-line">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-amber-400"}`}
            aria-hidden="true"
          />
          {connected ? "connected" : statusLine}
        </p>
      </header>

      {transcript && (
        <p className="truncate text-sm italic text-stone-400" data-testid="transcript">
          {transcript.length > 120 ? `${transcript.slice(-120)}` : transcript}
        </p>
      )}

      {phase === "intro" && (
        <Card className="space-y-6">
          <PassageCard passage={passage} />
          <Button onClick={startSession} className="w-full">
            Start session
          </Button>
        </Card>
      )}

      {phase === "greeting" && (
        <Card className="space-y-6">
          <PassageCard passage={passage} />
          <p className="text-sm text-stone-500" data-testid="greeting-hint">
            Listen to ReadPulse, then read the passage aloud.
          </p>
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-teal-700"
              aria-hidden="true"
            />
            Listening...
          </div>
          <div>
            <Button variant="ghost" onClick={skipGreeting}>
              Skip greeting and read now
            </Button>
          </div>
        </Card>
      )}

      {phase === "reading" && (
        <Card className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-stone-500">Time left</p>
              <p className="font-mono text-3xl font-bold text-stone-900">
                <span data-testid="countdown">{countdown ?? 60}</span>s
              </p>
            </div>
            <ProgressBar value={countdown ?? 60} max={60} />
          </div>
          <PassageCard passage={passage} />
          <Button onClick={() => void submitReading()} className="w-full">
            I&apos;m done reading
          </Button>
        </Card>
      )}

      {phase === "scoring" && (
        <Card className="flex flex-col items-center gap-3 py-12">
          <span
            className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-teal-700"
            aria-hidden="true"
          />
          <p className="font-serif text-lg font-semibold text-stone-900">Scoring your reading...</p>
        </Card>
      )}

      {phase === "result" && score && (
        <Card className="space-y-6">
          <ReportView
            childName={childName || null}
            grade={grade}
            season={season}
            passageTitle={passage.title}
            score={score}
            ran={ranScore}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPracticeIndex(0);
                setPracticed([]);
                goPhase("practice");
              }}
            >
              Practice words
            </Button>
            <Button variant="secondary" onClick={() => goPhase("ran")}>
              Try the naming game
            </Button>
            <Button variant="secondary" onClick={() => goPhase("done")}>
              Finish and get report link
            </Button>
          </div>
        </Card>
      )}

      {phase === "result" && !score && (
        <Card className="space-y-2">
          <p className="font-semibold text-red-600">Scoring failed</p>
          <p className="text-sm text-stone-600">{error}</p>
          <a href="/" className="text-sm font-semibold text-teal-700 underline">
            Start over
          </a>
        </Card>
      )}

      {phase === "practice" && (
        <Card className="space-y-6">
          <div>
            <Button variant="ghost" onClick={() => goPhase("result")}>
              Back
            </Button>
          </div>
          {drillWords.length === 0 ? (
            <p className="text-stone-600">No missed words - great reading!</p>
          ) : practiceIndex < drillWords.length ? (
            <>
              <h2 className="font-serif text-lg font-semibold text-stone-900">Echo practice</h2>
              <p className="text-sm text-stone-500" data-testid="practice-progress">
                Word {practiceIndex + 1} of {drillWords.length} - Practiced {practiced.length}
              </p>
              <p
                className="py-6 text-center font-serif text-6xl font-semibold text-stone-900"
                data-testid="drill-word"
              >
                {drillWords[practiceIndex].expected}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={sayWord}>
                  ReadPulse says the word
                </Button>
                <Button onClick={markPracticed} data-testid="mark-practiced">
                  Mark as practiced
                </Button>
                <Button variant="secondary" onClick={skipWord} data-testid="skip-word">
                  Skip
                </Button>
              </div>
              <p className="text-center text-xs text-stone-400">
                Say the word out loud after your coach - or a grown-up - says it. ReadPulse
                listens and marks it practiced automatically.
              </p>
            </>
          ) : (
            <>
              <h2
                className="font-serif text-lg font-semibold text-stone-900"
                data-testid="practice-complete"
              >
                Practice complete! Practiced {practiced.length} of {drillWords.length} words.
              </h2>
              <p className="text-stone-600">Great work - rereading words out loud makes them stick!</p>
              <Button variant="secondary" onClick={() => goPhase("result")}>
                Back
              </Button>
            </>
          )}
        </Card>
      )}

      {phase === "ran" && (
        <Card className="space-y-6">
          <h2 className="font-serif text-lg font-semibold text-stone-900">Rapid Naming Game</h2>
          <p className="text-sm text-stone-600">
            Name each color out loud, left to right, top to bottom, as fast as you can.
          </p>
          <RanGrid variant="colors" />
          <Button onClick={startRanCapture} className="w-full">
            Start naming
          </Button>
        </Card>
      )}

      {phase === "ranScoring" && (
        <Card className="space-y-6">
          <RanGrid variant="colors" />
          <p className="text-sm text-stone-500">Take your time, then press Done.</p>
          <Button onClick={() => void finishRan()} disabled={ranBusy} className="w-full">
            Done
          </Button>
        </Card>
      )}

      {phase === "ranResult" && (
        <Card className="space-y-6">
          <h2 className="font-serif text-lg font-semibold text-stone-900">Naming game result</h2>
          {ranScore ? (
            <div className="space-y-2" data-testid="ran-result">
              <div className="flex items-center gap-3">
                <span className="text-sm text-stone-700">
                  Items named: {ranScore.stimuliNamed} of {ranScore.stimuliTotal}
                </span>
                <Badge tone={ranScore.flag === "typical" ? "green" : "amber"}>
                  {ranScore.flag === "typical" ? "Typical" : "Slow"}
                </Badge>
              </div>
              <p className="font-serif text-2xl font-bold text-stone-900">
                {ranScore.itemsPerSecond.toFixed(2)}{" "}
                <span className="font-sans text-sm font-normal text-stone-500">items/sec</span>
              </p>
              <p className="text-xs text-stone-400">
                Naming speed is an additional signal linked to reading development - not a
                diagnosis.
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-600">{error ?? "RAN scoring unavailable."}</p>
          )}
          <Button variant="secondary" onClick={() => goPhase("result")}>
            Back
          </Button>
        </Card>
      )}

      {phase === "done" && (
        <Card className="space-y-6">
          <h2 className="font-serif text-lg font-semibold text-stone-900">Your report link</h2>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={shareLink}
              className="flex-1 rounded-xl border border-warm bg-cream px-3 py-2.5 text-sm"
              data-testid="share-link"
            />
            <Button onClick={copyLink}>{copied ? "Copied!" : "Copy"}</Button>
          </div>
          <a href="/" className="inline-block text-sm font-semibold text-teal-700 underline">
            Start a new session
          </a>
        </Card>
      )}
    </div>
  );
```

Do NOT touch anything above the `return` (state, hooks, callbacks — including the uncommitted voice config).

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; 61/61 pass.

- [ ] **Step 4: Commit** (adds ONLY the SessionClient change together with the pending voice fix, as one coherent voice+UI session commit — see note at plan top; voice fix is already user-approved)

```bash
git add src/components/SessionClient.tsx src/hooks/useVoiceAgent.ts
git commit -m "feat(ui+voice): warm session phases; gapless agent playback, voice jane"
```

---

### Task 6: ReportView redesign

**Files:**
- Modify: `src/components/ReportView.tsx` (full replacement)

- [ ] **Step 1: Replace `src/components/ReportView.tsx`** — uses Badge + StatTile; all metrics, citations, and testids identical:

```tsx
import type { ReadingScore, RanScore, Tier } from "@/lib/scoring/types";
import PercentileChart from "@/components/PercentileChart";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";

interface ReportViewProps {
  childName: string | null;
  grade: number;
  season: string;
  passageTitle: string;
  score: ReadingScore;
  ran: RanScore | null;
}

const TIER_BADGE: Record<Tier, { label: string; tone: "green" | "amber" | "red" }> = {
  on_track: { label: "On Track", tone: "green" },
  below_benchmark: { label: "Below Benchmark", tone: "amber" },
  at_risk: { label: "At Risk", tone: "red" },
};

// Rows shown only when the count is nonzero, so the table reflects actual results.
const ERROR_ROWS: Array<{
  key: keyof ReadingScore["counts"];
  label: string;
  meaning: string;
}> = [
  { key: "substitutions", label: "Substitutions", meaning: "read a different word" },
  { key: "omissions", label: "Omissions", meaning: "skipped a word" },
  { key: "insertions", label: "Insertions", meaning: "added an extra word" },
  { key: "hesitations", label: "Hesitations", meaning: "stuck on a word for over 3 seconds" },
  { key: "selfCorrections", label: "Self-corrections", meaning: "caught and fixed - counts as correct" },
];

export default function ReportView({ childName, grade, season, passageTitle, score, ran }: ReportViewProps) {
  const tier = TIER_BADGE[score.percentile.tier];
  const { counts, missedWords, lowConfidenceWords } = score;
  const hasErrors = ERROR_ROWS.some((row) => counts[row.key] > 0);

  return (
    <section className="w-full space-y-6">
      {/* 1. Header */}
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-stone-900">
            {childName ?? "Reader"} - Reading Report
          </h1>
          <Badge tone={tier.tone}>{tier.label}</Badge>
        </div>
        <p className="text-sm text-stone-500">
          {passageTitle} - Grade {grade} ({season} benchmark)
        </p>
      </header>

      {/* 2. Headline metrics */}
      <div className="grid grid-cols-3 gap-4">
        <StatTile testId="wcpm" value={score.wcpm} label="words correct per minute" />
        <StatTile
          value={`${score.accuracyPct}%`}
          label="accuracy"
          footnote={
            score.accuracyPct < 95 ? (
              <span className="text-amber-700">&lt; 95% suggests instructional-level support</span>
            ) : undefined
          }
        />
        <StatTile value={`${score.windowSeconds.toFixed(1)}s`} label="reading time scored" />
      </div>

      {/* 3. Percentile band chart */}
      <div className="space-y-2 rounded-2xl border border-warm bg-white p-4 shadow-warm">
        <PercentileChart estimated={score.percentile.estimated} tier={score.percentile.tier} />
        <p className="text-xs text-stone-400">
          Compared with US national ORF norms (Hasbrouck &amp; Tindal 2017, University of Oregon,
          Technical Report No. 1702)
        </p>
      </div>

      {/* 4. Error breakdown */}
      {hasErrors && (
        <div className="space-y-2 rounded-2xl border border-warm bg-white p-4 shadow-warm">
          <h2 className="font-serif text-lg font-semibold text-stone-900">Error breakdown</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-warm text-stone-400">
                <th className="py-2 font-medium">Error type</th>
                <th className="py-2 font-medium">Count</th>
                <th className="py-2 font-medium">What it means</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_ROWS.filter((row) => counts[row.key] > 0).map((row) => (
                <tr key={row.key} className="border-b border-warm last:border-0">
                  <td className="py-2 text-stone-800">{row.label}</td>
                  <td className="py-2 font-semibold text-stone-900">{counts[row.key]}</td>
                  <td className="py-2 text-stone-500">{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-stone-400">
            Scoring rules follow DIBELS-style oral reading fluency conventions.
          </p>
        </div>
      )}

      {/* 5. Missed words chips */}
      {missedWords.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-serif text-lg font-semibold text-stone-900">Words to practice</h2>
          <div className="flex flex-wrap gap-2">
            {missedWords.map((missed, index) => {
              let text: string;
              if (missed.type === "substitution") {
                text = `${missed.expected} → ${missed.got ?? "?"}`;
              } else if (missed.type === "hesitation") {
                text = `${missed.expected} (hesitated)`;
              } else {
                text = missed.expected;
              }
              return (
                <span
                  key={`${missed.expected}-${index}`}
                  className="rounded-full border border-warm bg-cream px-3 py-1 text-sm text-stone-800"
                >
                  {text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. RAN card */}
      {ran && (
        <div className="space-y-2 rounded-2xl border border-warm bg-white p-4 shadow-warm">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-lg font-semibold text-stone-900">Rapid naming speed</h2>
            <Badge tone={ran.flag === "typical" ? "green" : "amber"}>
              {ran.flag === "typical" ? "Typical" : "Slow"}
            </Badge>
          </div>
          <p className="font-serif text-2xl font-bold text-stone-900">
            {ran.itemsPerSecond.toFixed(2)}{" "}
            <span className="font-sans text-sm font-normal text-stone-500">items/sec</span>
          </p>
          <p className="text-xs text-stone-400">
            Naming speed is an additional signal linked to reading development (Denckla &amp;
            Rudel 1976; Araujo &amp; Faisca 2019). No age norms are embedded - this is not a
            diagnosis.
          </p>
        </div>
      )}

      {/* 7. Low-confidence disclosure */}
      {lowConfidenceWords.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Automated transcription was uncertain about:{" "}
          {lowConfidenceWords.map((item) => item.word).join(", ")}. These may need a human check.
        </p>
      )}

      {/* 8. Citations footer */}
      <footer className="border-t border-warm pt-4 text-xs text-stone-400">
        <p>
          Norms: Hasbrouck &amp; Tindal (2017) An Update to Compiled ORF Norms, Technical Report
          No. 1702, University of Oregon (public tables via Reading Rockets). Fluency scoring: CBM
          oral reading conventions (Deno 1985; DIBELS 8 administration rules).
        </p>
        <p className="mt-1">Single-passage screening indicator - not a diagnosis. Generated by ReadPulse.</p>
      </footer>
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 0 type errors; 61/61 pass. (e2e `wcpm` testid and "Reading Report" text preserved.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportView.tsx
git commit -m "feat(ui): warm scholarly report view with stat tiles and tier badges"
```

---

### Task 7: Full verification + screenshots

**Files:** none (verification only)

- [ ] **Step 1: Run all checks**

```bash
pnpm exec tsc --noEmit && pnpm test && pnpm e2e
```

Expected: 0 type errors; 61/61 unit tests; 2/2 Playwright specs. (Note: `pnpm e2e` runs `pnpm seed && playwright test` and starts its own dev server — stop any running `pnpm dev` first to avoid a port clash.)

- [ ] **Step 2: Manual visual walk-through** — `pnpm dev`, then check every screen in Chrome at 1920x1080:
  - `/` card layout, focus rings on inputs
  - `/session?grade=3&season=winter&childName=Lily`: all phases (intro → greeting → reading with countdown/progress → scoring → result → practice → ran → done)
  - `/demo`: form + seeded file scoring
  - `/report/readpulse-seed`: report page (this is the cover-image shot — screenshot at 16:9)
  - Confirm browser tab title reads "ReadPulse — 1-minute reading check-in"

- [ ] **Step 3: Capture submission cover image** from the report page (16:9 crop per `docs/submission/lablab-form.md`).

- [ ] **Step 4: Final status**

```bash
git status && git log --oneline -6
```

Expected: clean tree except intentionally untracked artifacts (screenshots saved outside the repo or in `docs/submission/assets/` if the user wants them tracked).
