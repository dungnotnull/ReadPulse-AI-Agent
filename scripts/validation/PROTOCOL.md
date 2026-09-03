# ReadPulse Validation Study Protocol

## Goal and methodology

This study measures how well the ReadPulse scoring pipeline agrees with a
trained human scorer on oral-reading metrics (WCPM and accuracy). Each of
15-20 recorded readings is scored twice, independently: once by a human
following DIBELS 8 conventions (ground truth), and once by the production
ReadPulse pipeline (AssemblyAI sync STT followed by the CBM scoring engine).
Agreement is reported as Pearson's r and mean absolute error (MAE) for WCPM
and accuracy, plus a comparison of error totals (substitutions, omissions,
insertions, self-corrections) to expose ASR auto-correction bias — speech
models tend to "fix" reader errors, so the system is expected to under-count
relative to the human. This agreement-analysis methodology replicates van der
Velde et al. 2025 (SERDA, PMC12686063) and Molenaar et al. 2023
(arXiv:2306.03444).

## 1. Recording collection

Plan 15-20 recordings distributed across the three passages:

| Passage | ID | Grade | Suggested readings |
|---|---|---|---|
| The Cat and the Ball | g1-cat-ball | 1 | 5-7 |
| A Morning in the Garden | g3-morning-dog | 3 | 5-7 |
| Ancient Paths | g5-ancient-paths | 5 | 5-7 |

Vary reader style across recordings so WCPM spans a realistic range
(roughly 40-160 WCPM): strong fluent readers, average pace, and slow or
halting deliveries. Recordings may repeat passages with different error
scripts.

### Error notation

Write an error script for each recording and follow it while reading aloud.
Notation:

- `[word -> word]` — substitute: say the second word instead of the first.
- `[skip: word]` — omit the word entirely.
- `[hesitate 4s before: word]` — pause at least 4 seconds before saying it.
- `[SC: wrong -> right]` — self-correct: say the wrong word, then within 3
  seconds say the correct word.
- `[insert: word]` — say the word even though it is not in the passage.

Example 1 (g1-cat-ball, average reader):

1. Read "The little cat sat on the mat by the [door -> floor]." (substitute)
2. Read "She saw a big red ball in the yard." normally.
3. Read "The cat ran to the ball and played with it [skip: all] day." (omission)
4. "[hesitate 5s] Then she took a nap in the warm sun." (hesitation)
5. Read "The ball rolled away down the [hill -> home -> hill]."
   (self-correct within 3 s)
6. Read the final sentence normally.

Example 2 (g3-morning-dog, weak reader):

1. "One warm morning, a small brown dog woke up and looked out the
   [window -> curtain]." (substitute)
2. "The sun was bright, and the birds were singing in the tall green tree."
3. "The dog ran outside to play in the [garden -> garage]." (substitute)
4. "He [skip: found] a long stick under the old wooden bench."
5. "[hesitate 4s before: proudly] He carried it proudly around the yard."
6. "Then he dug a hole and hid his [stick -> cat -> stick] in it."
   (self-correct)

Example 3 (g5-ancient-paths, strong reader with few planted errors):

1. Read sentence 1 normally.
2. "They followed the [rivers -> roads] and learned the ways of the seasons."
3. "They watched the animals that shared their world."
4. "[skip: Over] time, these travelers made tools and shared customs that
   helped them live in hard places."
5. "[hesitate 4s before: evening] Their stories were told around evening
   fires."
6. Read the final sentence normally, at a strong fluent pace.

You do not need to reproduce the examples exactly — the point is a mix of
error types at a range of densities (0-4 planted errors per reading) and a
range of paces.

### How to record

- Use any recording tool that produces WAV or MP3 (Windows Voice Recorder is
  fine; default format is acceptable).
- Record in a quiet room, at a normal reading distance from the microphone.
- Do NOT use the /demo page as the recorder: it scores immediately and the
  audio is not saved to a file. Record externally, then place files in
  `validation/recordings/`.
- Name files `r01.wav` ... `r20.wav` (mono preferred, under 2 minutes each).
- `scripts/smoke.wav` can serve as `r00-smoke.wav`, a TTS sanity recording
  (it is excluded from headline metrics automatically).

## 2. Human scoring (ground truth)

After each recording, score it by hand per DIBELS 8 conventions:

- **Window:** time 1 minute starting from the first word spoken. Only words
  in that window count.
- **Substitutions:** wrong word read where a different word is printed.
- **Omissions:** printed word skipped.
- **Insertions:** word said that is not printed.
- **Self-corrections:** a wrong word is corrected within 3 seconds — counts
  as CORRECT (mark in the self-corrections column, not as a substitution).
- **Hesitations:** a pause of more than 3 seconds before a word — mark a
  hesitation; the word itself, once read, is scored on its own merit.
- **WCPM** = correct words in the 1-minute window.
- **Accuracy %** = correct / (correct + substitutions + omissions +
  insertions) x 100.

Practical setup: printed passage, stopwatch (or the audio player's clock),
tally sheet. Score while listening, then re-listen to verify error marks.

Enter one row per recording in `validation/labels.csv`:

```
file,passage_id,grade,season,human_wcpm,human_accuracy_pct,human_substitutions,human_omissions,human_insertions,human_self_corrections,human_hesitations,notes
```

Notes must not contain commas (or wrap the field in double quotes).

## 3. Running the pipeline

```bash
pnpm validation:run       # transcribes + system-scores every labels.csv row
pnpm validation:analyze   # writes VALIDATION.md with r, MAE, error comparison
```

`validation:run` skips rows whose audio file is missing (with a warning), so
you can run it incrementally as recordings arrive. Requires `AAI_API_KEY` in
`.env.local`.
