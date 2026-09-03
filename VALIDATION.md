# ReadPulse Validation Study

## Methods

Recordings of oral reading were collected per the protocol in
`scripts/validation/PROTOCOL.md`: 15-20 one-minute readings across three
graded passages (g1/g3/g5) with planted errors (substitutions, omissions,
insertions, hesitations, self-corrections) and varied reader proficiency.
Each recording was scored twice, independently:

1. **Human ground truth** — a human scorer marked errors live per DIBELS 8
   conventions (1-minute window from first word; self-correction within 3 s
   counts correct; hesitation > 3 s counts as an error) and computed WCPM
   and accuracy by hand.
2. **System** — the production ReadPulse pipeline: AssemblyAI sync STT
   (universal-3-5-pro, word timestamps) followed by the CBM scoring engine
   (word alignment, self-correction collapse, 60 s window).

Agreement was assessed with Pearson's r and mean absolute error (MAE) for
WCPM and reading accuracy. Error totals (substitutions + omissions +
insertions, and self-corrections separately) are compared to expose ASR
auto-correction bias: speech models can "fix" reader errors, so the system
is expected to under-count errors relative to the human scorer. This
agreement-analysis methodology replicates van der Velde et al. 2025 (SERDA,
PMC12686063) and Molenaar et al. 2023 (arXiv:2306.03444).

Rows whose filename starts with `r00-` are TTS smoke recordings, not human
readings; they are excluded from headline metrics.

Insufficient data (n=0) - collect recordings first. See `scripts/validation/PROTOCOL.md`.

## Limitations

- Small sample size (n at most ~20): correlation estimates carry wide
  confidence intervals and are sensitive to single readings.
- Adult voices simulating child readers, including simulated error patterns;
  genuine child speech (smaller vocal tracts, disfluencies) is harder for ASR
  and may depress agreement.
- Errors were scripted and planted, so the error distribution is not that of
  natural oral reading.
- Multiple recordings may come from the same reader and the passage set is
  small, so readings are not fully independent observations.
- ASR auto-correction bias is expected to push system accuracy upward relative
  to human scoring; the error-count comparison quantifies the direction.
