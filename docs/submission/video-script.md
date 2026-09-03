# ReadPulse - Submission Video Script (~3 minutes)

Recording notes: screen-record the live app (1920x1080, Chrome). Rehearse the reading with 3 planted errors (substitution, omission, hesitation). Have the seeded report page open in a second tab as fallback. Speak warmly; the product is about children and reading.

---

## 0:00 - 0:35 | The problem (screen: static shot of a passage + a paper tally sheet)

"Oral reading fluency - words correct per minute - is the standard way schools screen children for reading risk. But administering it the traditional way needs a trained examiner, a stopwatch, and one-on-one time, student by student, three times a year. Many children who need help get noticed late.

What if the examiner could be... a voice agent? One that doesn't just transcribe - but scores by the same rulebook reading specialists use?"

## 0:35 - 1:55 | Live demo (screen: full session flow)

- Setup form: "We enter the child's name, grade, and season. Note: first grade, fall - there are no published norms for that window, so ReadPulse says so instead of inventing a score."
- Click Start session: "The agent - built on AssemblyAI's Voice Agent API - greets the child and invites them to read."
- Reading: "I'll read with a few realistic mistakes..." (read ~30s; substitute one word, skip one word, stall 4 seconds on one word, self-correct one)
- Result appears: "In seconds: words correct per minute, accuracy, and here's the key - this child lands around the 25th percentile against Hasbrouck and Tindal's 2017 national norms, which puts them below benchmark. The error table shows exactly what happened: the substitution, the omission, the hesitation. And it caught the self-correction - counted as correct, exactly the way DIBELS scoring rules work."
- Practice loop: "Then ReadPulse drills exactly the words the child missed. The agent says the word, the child repeats it, and the app hears the correction."
- RAN: "A 30-second rapid naming task adds a second signal - naming speed - which research links to reading development."
- Share link: "Everything lands on a shareable report for the teacher or parent."

## 1:55 - 2:35 | The science (screen: METHODOLOGY.md + report citations)

"This isn't an invented metric. Every rule has a source. The three-second rules for self-correction and hesitation come from the DIBELS administration guide. The benchmarks are transcribed from Hasbrouck and Tindal 2017 - every cell locked by a unit test. The scoring engine itself is a pure, fully tested implementation of Curriculum-Based Measurement.

And we validated it the way the research literature does: recordings scored by hand versus scored by the system. Agreement was [r = X, MAE = Y] for WCPM. [state the real numbers from VALIDATION.md after the study]

We're also honest about limits: speech recognition tends to auto-correct children's misreadings - it's a documented problem in the literature - so we flag low-confidence words and quantify the bias instead of hiding it."

## 2:35 - 3:00 | Business + close (screen: architecture diagram from README)

"Tutoring centers, EFL programs, and MTSS tier-one screening - commercial precedents like Amira Learning and the IES-funded Moby.Read prove the demand. ReadPulse makes the methodology transparent, validated, and available through a five-minute voice session.

ReadPulse - a reading specialist in every classroom. Thank you."

---

## Checklist before recording
- [ ] VALIDATION.md has real numbers; update the bracket in section 3
- [ ] Rehearse the demo reading twice (planted errors must be clean)
- [ ] Browser: close other tabs, do-not-disturb, mic check
- [ ] Fallback plan: /demo page with a pre-recorded file if live mic fails
- [ ] Record at least 2 takes; keep the better one
