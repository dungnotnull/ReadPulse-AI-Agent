# ReadPulse — Design Document

Date: 2026-09-03
Event: AssemblyAI Voice Agent Hackathon (lablab.ai), Sep 1-30 2026
Status: Approved design, pending implementation plan

## 1. Pitch

ReadPulse is a conversational voice agent that administers a 1-minute oral reading probe, scores it with the same psychometric rules a reading specialist applies by hand (Curriculum-Based Measurement), and instantly benchmarks the result against US national norms (Hasbrouck & Tindal 2017). It then drills the child on exactly the words they missed.

One line: "A virtual reading specialist that listens, scores by the book, and benchmarks against national norms — in one 5-minute voice session."

## 2. Problem and Evidence Base

- Oral Reading Fluency (ORF), measured as Words Correct Per Minute (WCPM), is the most widely used Tier-1 reading screener in US schools (CBM tradition, Deno 1985).
- Manual administration requires a trained examiner, one-on-one time, and stopwatch-and-paper scoring. Schools screen 2-3 times per year; many children at risk are noticed late. Commercial ASR-based solutions exist (Amira Learning; Moby.Read, IES-funded) proving market demand, but none run as a conversational voice agent, and none expose their scoring methodology.
- ASR-based ORF scoring is an active research area with established validation methodology (Molenaar et al. 2023; Henkel et al. 2024; SERDA 2025), including its known limitation: ASR language models tend to auto-correct misread words, under-counting errors. This project implements published mitigations and reports its own validation numbers.

Differentiators vs. typical hackathon voice agents:
1. Every metric, threshold, and rule traces to a citable source (Section 5).
2. A mini-validation study quantifying system-vs-human agreement (Section 7), replicating the methodology of SERDA 2025.
3. Fully transparent scoring engine (pure TypeScript, unit-tested against CBM rules) instead of a black box.

## 3. Product Flow (single ~5-minute session)

| # | Step | Actor | Tech |
|---|------|-------|------|
| 1 | Agent greets, collects first name, grade (1-6), and season (fall/winter/spring) | Voice Agent | Voice Agent API |
| 2 | UI displays a leveled passage (public domain; grade assigned via Flesch Reading Ease) | UI | Next.js |
| 3 | Agent: "Start reading when you're ready. I'll listen." | Voice Agent (stays silent via prompt rules) | Client tees PCM16 into buffer |
| 4 | Child reads aloud; after 60s of reading (or when child finishes), agent gives stop cue and praise | Voice Agent | Word timestamps define the window, not the client timer |
| 5 | Client uploads reading audio to server; server runs batch STT, then scoring | Backend | AssemblyAI STT (word timestamps + confidence) |
| 6 | Agent speaks the summary naturally ("You read 72 words correct per minute...") | Voice Agent tool call | `score_reading` tool |
| 7 | UI report: WCPM vs national percentile bands, accuracy, error table, missed-word list | UI | Charts |
| 8 | RAN task (30s): screen shows 40 stimuli (colors/objects), child names them fast; system measures naming speed | UI + Voice | Batch/Realtime STT timestamps |
| 9 | Practice loop: agent drills each missed word (model -> echo), then re-reads error sentences | Voice Agent | Tool calling |
| 10 | Teacher/parent report page with shareable link | UI | DB |

User receives: WCPM, national percentile (interpolated), risk tier (At Risk / Below Benchmark / On Track), accuracy %, error taxonomy (substitution / omission / insertion / hesitation), self-corrections, missed-word drill list, RAN naming speed.

## 4. Architecture and Components

```
Browser (Next.js App Router + TypeScript + Tailwind)
 |- AudioWorklet: mic -> PCM16 24kHz
 |    |- WS -> Voice Agent API (temporary token; API key never leaves server)
 |    |- tee -> ArrayBuffer capture (reading phase + RAN phase only)
 |- UI: passage display, RAN stimuli grid, report dashboard, share page

Next.js API routes (server)
 |- POST /api/session-token  -- mint Voice Agent temporary token
 |- POST /api/score-reading   -- upload audio -> AssemblyAI batch STT -> ScoringEngine -> result
 |- POST /api/score-ran       -- upload RAN audio -> batch STT -> RAN analyzer -> result
 |- POST /api/report          -- persist session report, return share slug

ScoringEngine (pure TypeScript, zero I/O, 100% unit-tested)
 |- normalizer.ts    -- lowercase, strip punctuation (both sides)
 |- aligner.ts       -- Levenshtein word-level DP alignment with backtrace
 |- cbmScorer.ts     -- WCPM (60s window), accuracy, error taxonomy, self-corrections, 3s hesitation rule
 |- norms.ts         -- Hasbrouck & Tindal 2017 tables (grades 1-8 x seasons x percentiles) + interpolation
 |- ranAnalyzer.ts   -- stimuli detected / elapsed -> items per second
 |- readability.ts   -- Flesch Reading Ease for passage grading (offline utility)
```

Why this architecture:
- Voice Agent API handles the hard real-time conversational layer (turn-taking, VAD, barge-in, TTS, 30+ voices) — not feasible for a solo dev to rebuild well in 4 weeks.
- The Voice Agent API transcripts are plain text without word timestamps; therefore precise scoring runs offline via AssemblyAI batch STT (word timestamps + per-word confidence). Two AssemblyAI products in one pipeline, each used where it is strongest.
- ScoringEngine is a pure module so every CBM rule is a unit test (evidence of rigor for judges reading the repo).

Tool calling contract (client-side execution per Voice Agent API spec):
- `score_reading(audioBase64)` — execution_mode hold; client uploads, scores, returns JSON; agent then speaks the result.
- `start_ran_task`, `get_missed_words` — support the RAN and practice steps.

## 5. Scoring Rules — every rule mapped to a source

5.1 Normalization: lowercase; strip punctuation and hyphen-splitting on both passage and transcript (standard preprocessing for alignment-based ORF scoring; Molenaar et al. 2023).

5.2 Alignment: word-level Levenshtein DP with backtrace over (passage, transcript). Each passage word classified: match / substitution / omission; transcript-only words: insertion. (Alignment is the standard approach in ASR-based ORF scoring literature.)

5.3 The 60-second window: WCPM counts words read correctly within the first 60s of reading onset. Reading onset and word inclusion are determined by batch STT word timestamps (never by client timers). If the child finishes the passage before 60s, WCPM = correct words / elapsed seconds x 60 (standard per-minute normalization). (CBM-R standard administration: 1-minute probe; Deno 1985; Administration & Scoring Guide DIBELS 8.)

5.4 Self-correction: a word initially misread then corrected within 3 seconds is scored as correct. Implemented via adjacent substitution+match pairs with inter-word gap <= 3s. (DIBELS 8 Admin & Scoring Guide; Acadience ORF; AIMSweb R-CBM.)

5.5 Hesitation rule: a gap > 3s mid-reading counts as a hesitation error; the agent supplies the word (TTS prompt "The word is X"), replicating examiner behavior. (DIBELS 8: hesitations > 3s are errors and the word is supplied.)

5.6 Accuracy: correct / (correct + substitutions + omissions + insertions) within the window. Flag accuracy < 95%: the traditional instructional-level criterion (IRI tradition, "95% accuracy, 75% comprehension"; see Validating Craft Knowledge). The report notes that CBM literature debates accuracy criteria and treats WCPM as primary (Shinn, Best Practices in CBM).

5.7 Benchmarking: linearly interpolate percentile between the published Hasbrouck & Tindal 2017 points (percentiles 10/25/50/75/90 per grade and season; Technical Report No. 1702, University of Oregon — public tables). WCPM outside the tabulated range is clamped and reported as "<10th" or ">90th" rather than extrapolated. Tiers: <10th percentile At Risk; 10th-25th Below Benchmark; >25th On Track. Report states tiers mirror DIBELS-style benchmark logic but are our own percentile bands because official DIBELS cut scores are commercial.

5.8 Single-passage caveat: DIBELS ORF uses the median of 3 passages; this screener uses 1 passage for demo feasibility and reports it as a screening indicator, not a diagnosis. Stated on the report.

5.9 RAN module: 40-stimulus continuous naming grid (8 rows x 5), color and object variants — an abbreviated adaptation of the original paradigm (Denckla & Rudel 1976 used 50 items in 5 rows of 10; we use 40 to keep the session under 30 seconds). Colors and objects are chosen over letters/digits so pre-literate children can attempt it. Output: items named correctly per second (from word timestamps + alignment to stimulus sequence). Interpretation: raw speed + qualitative flag, citing the meta-analytic finding that dyslexic readers show large naming-speed deficits (Araujo & Faísca 2019). No age norms embedded (RAN/RAS and CTOPP norms are commercial); the report says so explicitly and labels RAN as "additional signal, not a diagnosis". Screen-based serial naming is disclosed as an adaptation (standard RAN is examiner-administered).

5.10 Passage selection: public domain texts (Aesop, Project Gutenberg early readers). Grade assignment computed offline via Flesch Reading Ease (Flesch 1948), cross-checked against published grade bands. Readability score and source shown with each passage.

5.11 Known limitation, stated openly: ASR language models auto-correct mispronunciations toward expected words, under-counting errors (documented in Molenaar et al. 2023, Henkel et al. 2024). Mitigations: (a) per-word confidence from AssemblyAI batch STT; low-confidence matches are re-flagged for review; (b) validation study (Section 7) quantifies the actual bias; (c) the report labels scores as estimates.

5.12 Practice loop rationale: agent-led echo practice of missed words and error sentences implements guided repeated oral reading, the fluency intervention with the strongest evidence base (National Reading Panel 2000; Samuels 1979; Therrien 2004 meta-analysis).

## 6. Data Contracts (key shapes)

```ts
interface SttWord { text: string; start_ms: number; end_ms: number; confidence: number }

interface AlignmentItem {
  passageIndex: number | null
  transcriptIndex: number | null
  classification: 'match' | 'substitution' | 'omission' | 'insertion' | 'selfCorrected' | 'hesitation'
}

interface ReadingScore {
  wcpm: number
  accuracyPct: number
  windowSeconds: number          // actual scored window (<= 60)
  counts: { correct: number; substitutions: number; omissions: number; insertions: number; hesitations: number; selfCorrections: number }
  missedWords: Array<{ expected: string; got: string | null; type: string; sentenceIndex: number }>
  percentile: { estimated: number; tier: 'at_risk' | 'below_benchmark' | 'on_track'; source: 'Hasbrouck & Tindal 2017' }
  lowConfidenceWords: Array<{ word: string; confidence: number }>
}

interface RanScore {
  stimuliTotal: number
  stimuliNamed: number
  secondsElapsed: number
  itemsPerSecond: number
  flag: 'typical' | 'slow'        // qualitative, no embedded norms
  source: 'Denckla & Rudel 1976 paradigm'
}
```

Passage store (JSON): id, text, sentences[], grade, fleschScore, sourceUrl, wordCount.

## 7. Mini-Validation Study (protocol)

Replicates the agreement-analysis methodology of SERDA 2025 and Molenaar et al. 2023:
1. Stimuli: 4-6 leveled passages; scripts with planted errors at realistic rates (substitutions, omissions, insertions, self-corrections, hesitations).
2. Recordings: ~20 readings by adult volunteers simulating grade 2-4 reading (strong, average, weak; varied voices/pace).
3. Human scoring: two passes with stopwatch and error-marking per the DIBELS 8 rules above; discrepancies re-checked (serves as ground truth).
4. System scoring: same audio through the full pipeline.
5. Report: Pearson r and MAE for WCPM and accuracy; confusion counts per error type; analysis of ASR auto-correction bias (errors missed by ASR). Target r >= 0.85, consistent with published ASR-ORF agreement.
6. Publish results in `VALIDATION.md`, slides, and the demo UI ("validated against human scoring: r = ...").
Small N is acknowledged; this is a transparency artifact, not a clinical claim.

## 8. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui | One repo, Vercel deploy |
| Voice | AssemblyAI Voice Agent API (server-minted temp token) | Full conversational stack managed |
| Scoring input | AssemblyAI batch STT (Universal; word timestamps + confidence) | More accurate than realtime; has timestamps |
| Scoring engine | Pure TypeScript + Vitest | Every CBM rule unit-tested |
| DB | SQLite via Prisma for sessions/reports; share links by slug | Simple, portable; Supabase only if share links need public scale |
| Charts | Recharts | Percentile bands, error tables |
| Hosting | Vercel (Next.js) | Browser talks to AssemblyAI directly; no long-lived server needed |

## 9. Scope

P0 (must ship): session flow steps 1-7; ScoringEngine complete (5.1-5.11); H&T 2017 norms for grades 1-6; report UI; tool calling; mini-validation study; METHODOLOGY.md; README with citations.
P1 (should ship): RAN task; practice loop; shareable report link.
P2 (explicitly out): multilingual passages; multi-session progress monitoring; adaptive passage leveling; grades 7-8 norms; any diagnostic claims.

## 10. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| ASR auto-corrects misread words (under-counts errors) | High (documented) | Confidence flagging; validation quantifies bias; honest labeling |
| Agent interrupts during reading | Medium | Prompt rules + hold-mode tools; VAD events monitored client-side |
| Timer drift | Medium | All timing from STT word timestamps; client timer is display-only |
| Children's voices underperform on ASR in live demo | Medium | Demo with adult simulating weak reader (disclosed); batch STT re-score as fallback; validation set covers this |
| Passage leveling disputes | Low | Flesch score + source published per passage |
| Solo bandwidth | Medium | P0/P1/P2 cut lines; validation set kept at 20 recordings |

## 11. Submission Assets (aligned to judging criteria)

- Application of Technology: dual-pass AssemblyAI pipeline (Voice Agent API + batch STT + tool calling) documented in README architecture diagram.
- Presentation: 3-minute video — story (1/3), live demo (1/3), validation numbers + citations (1/3); slide deck with "The Science Behind ReadPulse" page.
- Business Value: tutoring centers, EFL programs, MTSS Tier-1 screening; commercial precedents (Amira Learning; Moby.Read IES award).
- Originality: psychometrically grounded screener + transparent methodology + validation study — rare in hackathon voice agents.

## 12. References (verified 2026-09-03)

1. Deno, S. L. (1985). Curriculum-based measurement: The emerging alternative. Exceptional Children, 52(3), 219-232.
2. Hasbrouck, J., & Tindal, G. (2017). An Update to Compiled ORF Norms (Technical Report No. 1702). University of Oregon. Public tables: Reading Rockets "Fluency Norms Chart (2017 Update)"; NCII resource page.
3. University of Oregon / Dynamic Measurement Group. DIBELS 8th Edition Administration & Scoring Guide (hesitation >3s rule; self-correction within 3s; median of 3 passages). dibels.uoregon.edu.
4. Shaw, R., & Good, R. DIBELS ORF Technical Report (CSAP). dibels.uoregon.edu/sites/default/files/shaw_csap_technical_report.pdf.
5. Acadience Learning. Oral Reading Fluency (ORF) scoring rules. acadiencelearning.org.
6. AIMSweb. R-CBM Administration and Scoring Guide (self-correction within 3s = correct).
7. Denckla, M. B., & Rudel, R. G. (1976). Rapid "automatized" naming of pictured objects, colors, letters and numbers by normal children. Cortex, 12(2), 109-114.
8. Wolf, M., & Bowers, P. G. (1999). The double-deficit hypothesis for the developmental dyslexias. Journal of Educational Psychology, 91(3), 415-438.
9. Araujo, S., & Faisca, L. (2019). A meta-analytic review of naming-speed deficits in developmental dyslexia. Scientific Studies of Reading, 23(5), 349-368.
10. Molenaar, B., et al. (2023). Automatic assessment of oral reading accuracy for children. arXiv:2306.03444.
11. Henkel, O., et al. (2024). Using state-of-the-art speech models to assess oral reading fluency. International Journal of Artificial Intelligence in Education (Springer), s40593-024-00435-9.
12. van der Velde, M., et al. (2025). Speech Enabled Reading Fluency Assessment: A Validation Study (SERDA). PMC12686063.
13. Balogh, J. E., et al. (2012). Improving Oral Reading Fluency Assessment Using VersaReader. WoCCI 2012 (ISCA Archive).
14. Mostow, J., et al. Project LISTEN Reading Tutor (CMU). Multiple publications 1993-2011.
15. National Reading Panel (2000). Teaching Children to Read. Report of the NRP: fluency chapter (guided repeated oral reading).
16. Samuels, S. J. (1979). The method of repeated readings. The Reading Teacher, 32(4), 403-408.
17. Therrien, W. J. (2004). Fluency and comprehension gains as a result of repeated reading: A meta-analysis. Remedial and Special Education, 25(4), 252-261.
18. Flesch, R. F. (1948). A new readability yardstick. Journal of Applied Psychology, 32(3), 221-233.
19. "Validating Craft Knowledge" (instructional-level 95%/75% criterion). JSTOR 10.1086/661522; Shinn, M. R. Best Practices in Using CBM (accuracy-criteria debate).
20. Commercial precedents: Amira Learning (ASR-based ORF, ISIP ORF); Moby.Read (IES SBIR-funded automated basic reading assessment).

Assumption to verify at build time: exact H&T 2017 percentile values are transcribed from the public Reading Rockets/Read Naturally tables into `norms.ts` with a unit test locking each cell.
