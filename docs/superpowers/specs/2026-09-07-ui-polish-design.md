# ReadPulse UI Polish — Warm Scholarly Design

**Date:** 2026-09-07
**Status:** Approved (user, 2026-09-07)
**Purpose:** Demo-ready visual polish across all screens before the hackathon submission video.

## Goal

Make every screen the video shows (landing, session, report, /demo fallback) look
like a finished product with one consistent "warm scholarly" design system: warm
and inviting for the child, credible and precise for teachers and judges.
Visual-only change: no flow, logic, copy, or test-selector changes.

## Non-goals

- No behavioral or flow changes. All `data-testid` attributes and visible copy
  stay byte-identical (the Playwright e2e suite depends on them).
- No new npm dependencies. Tailwind utilities + `next/font` only.
- No dark mode. Light (cream) is locked for recording consistency; the
  `prefers-color-scheme` block in globals.css is removed.

## Design tokens

| Token | Value | Use |
|---|---|---|
| bg.cream | `#FAF7F2` | app background |
| surface.card | `#FFFFFF` | cards |
| border.warm | `#E7E0D4` | card borders, dividers |
| ink | stone-900 `#1C1917` | headings |
| body | stone-800 `#292524` | body text |
| muted | stone-500 `#78716C` | labels, captions |
| primary | teal-700 `#0F766E` (hover teal-800 `#115E59`) | primary buttons, links, accents |
| accent | coral `#E76F51` | practice-phase highlights |
| tier.at_risk | red-600 on red-50 | badge |
| tier.below | amber-600 on amber-50 | badge |
| tier.on_track | green-600 on green-50 | badge |

## Typography

- Display serif: Fraunces via `next/font/google` (fallback `Georgia, serif`) for
  page headlines, the passage, and drill words — the "storybook" voice.
- UI sans: existing local Geist applied through Tailwind `font-sans` mapped to
  `--font-geist-sans` (fixes the current Arial body override in globals.css).
- Mono: existing Geist Mono for the countdown and other tabular numbers.

## Primitives (`src/components/ui/`)

- `Button` — variants: primary (teal, white text), secondary (white, warm
  border), ghost (text-only). Sizes md/lg.
- `Card` — white, rounded-2xl, warm border, subtle warm shadow.
- `Badge` — tier and status pills (replaces inline tier classes in ReportView).
- `StatTile` — big number + label + optional footnote (WCPM / accuracy /
  reading time; RAN speed).
- `ProgressBar` — slim track with fill, driven by the countdown seconds.

## Screen applications

- **Landing `/`** — centered Card, serif wordmark + tagline, labeled form
  fields, full-width primary submit, grade-1-fall note as a muted hint.
- **Session `/session` (all phases)** — shared header (wordmark + connection
  status dot); transcript line unchanged in behavior; passage rendered as a
  storybook Card (serif, large, relaxed leading); reading phase: big mono
  countdown + ProgressBar + primary "I'm done reading"; scoring: centered
  spinner card; result: redesigned ReportView embedded + three secondary
  actions; practice: drill word as an oversized serif Card with accent
  underline + progress dots; RAN: warm-bordered grid items (stimulus swatch
  colors unchanged — they are test stimuli); done: share link + copy button.
- **Report (ReportView)** — header (serif name + tier Badge), three StatTiles
  in a Card row, PercentileChart inside a Card with its citation caption,
  error-breakdown table card, missed-word chips, RAN StatTile card,
  low-confidence notice, citations footer. PercentileChart band fills switch
  to muted tints of the tier palette; band semantics unchanged.
- **`/demo`** — same form styling as landing; identical controls and copy.

## Foundation fixes (included)

- `tailwind.config.ts` — map `font-sans` to `--font-geist-sans`, add
  `font-serif` (Fraunces variable), add `cream` / `coral` colors.
- `globals.css` — remove the Arial body override and the dark-mode block; set
  cream background.
- `layout.tsx` — load Fraunces via `next/font/google`; metadata title
  "ReadPulse — 1-minute reading check-in" plus a real description.

## Verification

1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm test` — 61/61 (scoring engine untouched).
3. `pnpm e2e` — selectors unchanged; both specs pass.
4. Manual walk-through of every phase per the pre-video test list; screenshot
   the report page for the submission cover image.
