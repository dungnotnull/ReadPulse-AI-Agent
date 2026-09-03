# ReadPulse Methodology

ReadPulse is an automated oral reading fluency (ORF) screener built on the
AssemblyAI Voice Agent API. This document specifies the scientific basis of
its measurement model: what is being measured, which published scoring rules
the software implements, where each rule lives in the code, and where the
implementation deviates from manual administration. It contains no product
claims — only sources, rules, and disclosed limitations.

## 1. What ORF screening is, and why WCPM

Oral Reading Fluency measured as Words Correct Per Minute (WCPM) descends
from Curriculum-Based Measurement (CBM), which established the 1-minute
oral reading probe as a repeatable, economically administerable indicator of
reading competence (Deno 1985). The National Reading Panel identified oral
reading fluency and its guided development as a central component of reading
instruction (National Reading Panel 2000), and WCPM remains the standard
Tier-1 universal screening metric in US schools. The conventional
administration is fixed: a student reads a graded passage aloud for one
minute; the examiner marks errors per a published convention; WCPM is the
count of words read correctly within that minute. The 1-minute duration and
error convention are what make scores comparable across students, passages,
and time points — which is why ReadPulse reproduces them exactly rather than
inventing its own metric.

ReadPulse automates the entire loop: a conversational voice agent
administers the probe, automatic speech recognition (ASR) transcribes the
reading with word-level timestamps, and a deterministic scoring engine
applies the same rules a trained examiner applies by hand. The result is
benchmarked against national norms (Hasbrouck & Tindal 2017).

## 2. Scoring rules

The table below maps each scoring rule to its implementation location and
source. The scoring engine (`src/lib/scoring/`) is pure TypeScript with no
I/O, so every rule is individually unit-tested.

| # | Rule | Implementation | Source |
|---|------|----------------|--------|
| 1 | Normalization: lowercase; strip punctuation; split hyphens on both passage and transcript | `src/lib/scoring/normalizer.ts` | Standard preprocessing for alignment-based ORF scoring (Molenaar et al. 2023) |
| 2 | Alignment: word-level Levenshtein dynamic programming with backtrace; passage words classified match / substitution / omission; transcript-only words classified insertion | `src/lib/scoring/aligner.ts` | Standard approach in ASR-based ORF scoring literature (Molenaar et al. 2023; Henkel et al. 2024) |
| 3 | 60-second window: WCPM counts correct words whose end timestamp falls within 60 s of reading onset (completion of the first spoken word, per batch STT timestamps — never a client timer). Early finish: WCPM = correct / elapsed seconds x 60 | `src/lib/scoring/cbmScorer.ts` (`WINDOW_MS`, window filter, elapsed normalization) | CBM-R 1-minute probe (Deno 1985); DIBELS 8 Administration & Scoring Guide |
| 4 | Self-correction: a misread word corrected within 3 seconds counts as correct. Implemented as an insertion of a non-passage token immediately followed by a match of the target word, with inter-word gap <= 3 s | `src/lib/scoring/cbmScorer.ts` (`SELF_CORRECTION_GAP_MS` collapse pass) | DIBELS 8 Administration & Scoring Guide; Acadience ORF; AIMSweb R-CBM |
| 5 | Hesitation: a silence gap > 3 s before a word is recorded as a hesitation error; the agent supplies the word (TTS: "The word is X"), replicating examiner behavior. The hesitation is recorded in addition to the word's own accuracy classification (fluency and accuracy are tracked separately) | `src/lib/scoring/cbmScorer.ts` (`HESITATION_GAP_MS`), practice loop in the session client | DIBELS 8: hesitations > 3 s are errors and the word is supplied |
| 6 | Accuracy: correct / (correct + substitutions + omissions + insertions) within the window. Accuracy < 95% is flagged as below the traditional instructional-level criterion; the report notes the CBM literature debates accuracy criteria and treats WCPM as primary | `src/lib/scoring/cbmScorer.ts` (`accuracyPct`), report view | Instructional-level criterion from the IRI tradition ("95% accuracy, 75% comprehension"; Validating Craft Knowledge); accuracy-criteria debate per Shinn (Best Practices in CBM) |
| 7 | Norm-referencing: linear interpolation of WCPM between the published Hasbrouck & Tindal 2017 anchor percentiles (10/25/50/75/90 per grade and season). WCPM outside the tabulated range is clamped and reported as "<10th" or ">90th", never extrapolated. Tiers: < 10th percentile At Risk; 10th-25th Below Benchmark; > 25th On Track. These bands mirror DIBELS-style benchmark logic but are our own percentile bands because official DIBELS cut scores are commercial and not reproduced here | `src/lib/scoring/norms.ts` (`estimatePercentile`, `tierFromPercentile`) | Hasbrouck & Tindal 2017 (Technical Report No. 1702); tier logic per DIBELS-style benchmarking convention |
| 8 | Single-passage caveat: DIBELS ORF uses the median of 3 passages; this screener uses 1 passage for session brevity and is reported as a screening indicator, not a diagnosis | Report UI disclosure | DIBELS 8 Administration & Scoring Guide (median-of-3 administration) |
| 9 | RAN paradigm: 40-stimulus continuous naming grid (8 rows x 5; color and object variants), items per second from word timestamps aligned to the stimulus sequence. An abbreviated adaptation: the original used 50 items in 5 rows of 10; 40 keeps the task under 30 seconds. Colors and objects are used so pre-literate children can attempt the task. No age norms are embedded (RAN/RAS and CTOPP norms are commercial); the output is raw speed plus a qualitative flag, and the report labels RAN "additional signal, not a diagnosis" | `src/lib/scoring/ranAnalyzer.ts`, `RanGrid` UI | Denckla & Rudel 1976; naming-speed deficit link per Araujo & Faisca 2019 meta-analysis |
| 10 | Passage leveling: original passages authored for this project, grade assigned offline by the Flesch-Kincaid Grade Level formula and verified by a test band (FK within +/-1.5 of the declared grade); readability score and source note shown with each passage | `src/lib/scoring/readability.ts`, `src/lib/data/passages.ts` | Kincaid et al. 1975 (grade formula, derived from Flesch 1948) |
| 11 | Known ASR limitation: speech language models auto-correct mispronunciations toward expected words, under-counting errors. Mitigations: (a) per-word confidence from batch STT — matched words with confidence below a flag threshold are re-flagged for review; (b) a validation study quantifying the actual bias (Section 6); (c) the report labels all scores as estimates | `src/lib/scoring/cbmScorer.ts` (`LOW_CONFIDENCE`, `lowConfidenceWords`), report view | Molenaar et al. 2023; Henkel et al. 2024 |
| 12 | Hyphenated-word counting deviation: manual CBM convention counts a hyphenated word as ONE correct word; this engine normalizes hyphens to token separators (rule 1) and therefore counts the tokens. Shipped passages contain no hyphenated words, so WCPM on the shipped passage set is unaffected; the deviation is documented for any future passage addition | `src/lib/scoring/cbmScorer.ts` (`mapTokensToSources` comment), `normalizer.ts` | Deviation from manual CBM convention, disclosed |

Practice loop rationale (rule 12 of the spec's product flow): agent-led echo
practice of missed words and error sentences implements guided repeated oral
reading, the fluency intervention with the strongest evidence base
(National Reading Panel 2000; Samuels 1979; Therrien 2004).

## 3. Norms source and transcription

All benchmarking uses Hasbrouck, J., & Tindal, G. (2017). *An Update to
Compiled ORF Norms* (Technical Report No. 1702), University of Oregon — the
standard public ORF norm reference in US schools. The percentile tables
(grades 1-6, seasons fall/winter/spring, percentiles 10/25/50/75/90) were
transcribed from the public Reading Rockets "Fluency Norms Chart (2017
Update)" and cross-checked against the Read Naturally republication of the
same table. Transcription occurred in 2026-09; every cell was copied from
the fetched table at transcription time.

Two integrity measures protect the transcription:

1. Grade 1 fall has **no published values** in the source table. Those
   anchors are represented as zero, and `estimatePercentile` throws
   `NormsUnavailableError` for grade 1 fall; the UI blocks benchmarking for
   that combination rather than showing a fabricated percentile.
2. Unit tests in `src/lib/scoring/norms.test.ts` lock individual table cells
   so any accidental edit to a transcribed value fails the test suite.

## 4. RAN module

Rapid Automatized Naming (RAN) is the serial naming-speed paradigm of
Denckla & Rudel (1976): a grid of familiar stimuli named aloud, in order, as
fast as possible. Naming speed deficits are among the most robust correlates
of developmental dyslexia (Araujo & Faisca 2019 meta-analysis; see also Wolf
& Bowers 1999 for the double-deficit framing).

ReadPulse's adaptation and its disclosures:

- **40 items, 8 x 5 grid, color and object variants** — abbreviated from the
  original 50-item layout to keep the task under 30 seconds. Colors and
  objects are chosen over letters/digits so pre-literate children can
  attempt the task.
- **Output**: stimuli named correctly per second, computed by aligning the
  STT transcript to the stimulus sequence with the same Levenshtein
  alignment used for passage scoring, then dividing matches by the elapsed
  span between the first and last named stimulus.
- **Slow threshold**: `itemsPerSecond < 0.5` sets a qualitative "slow" flag.
  This is an **operational parameter, not a norm**. Published RAN/RAS and
  CTOPP norms are commercial and are not embedded; the report states this
  explicitly and labels RAN as additional signal, not a diagnosis.
- **Screen-based administration is an adaptation**: standard RAN is
  examiner-administered with printed cards. Screen presentation is disclosed
  as a departure from the standard protocol.
- The shipped session flow administers the color variant; the object variant
  is supported by the data model and scoring API but not exposed in the
  session UI.

## 5. ASR limitation and mitigations

The central known limitation of ASR-based ORF scoring is that speech
language models tend to auto-correct mispronunciations toward the expected
word, under-counting errors (Molenaar et al. 2023; Henkel et al. 2024).
ReadPulse does not hide this; it implements three mitigations:

1. **Confidence flagging**: matched words whose batch-STT confidence is
   below **0.80** (an operational threshold, disclosed as such — not a
   published value) are re-flagged for human review on the report.
2. **Validation study** (Section 6) quantifies the actual bias by comparing
   system error counts against human-scored ground truth on the same audio.
3. **Honest labeling**: the report labels all scores as automated estimates
   and states the single-passage screening caveat.

Architecturally, scoring uses AssemblyAI batch (sync) STT with word
timestamps and per-word confidence rather than the conversational agent's
plain-text transcripts, because precise timing and confidence are required
by rules 3-5 and mitigation 1.

## 6. Validation study

The validation study measures agreement between the ReadPulse pipeline and a
trained human scorer on the same recordings, following the agreement-analysis
methodology of van der Velde et al. 2025 (SERDA) and Molenaar et al. 2023:
15-20 one-minute readings across three graded passages with scripted,
planted errors (substitutions, omissions, insertions, hesitations,
self-corrections) at varied proficiency levels; each recording scored twice,
independently (human per DIBELS 8 conventions; system via the production
pipeline); agreement reported as Pearson's r and mean absolute error for WCPM
and accuracy, plus per-error-type confusion counts to expose ASR
auto-correction bias.

The full protocol is `scripts/validation/PROTOCOL.md`; current status and
results (or the explicit insufficient-data notice) are in `VALIDATION.md`.
This document intentionally does not restate results: numbers appear only
after recordings have been collected and analyzed by
`pnpm validation:run` and `pnpm validation:analyze`. The small sample is
acknowledged up front: this is a transparency artifact, not a clinical claim.

## 7. References

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
