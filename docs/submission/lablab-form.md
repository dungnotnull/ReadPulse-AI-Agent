# lablab.ai Submission Form - Fill-In Text

Copy-paste fields for the AssemblyAI Voice Agent Hackathon submission form. Items marked [PENDING] need the deployed URL / video / slides before submitting.

---

## Project title

ReadPulse - A Reading Specialist in Every Classroom

## Short description

A voice agent that administers 1-minute oral reading fluency screenings, scores them with the same CBM/DIBELS rules a reading specialist uses, benchmarks against Hasbrouck & Tindal 2017 national norms, and drills the child on exactly the words they missed.

## Long description

ReadPulse turns oral reading fluency (ORF) screening - the standard way schools screen children for reading risk - into a 5-minute voice session.

The problem: ORF screening (words correct per minute, WCPM) normally requires a trained examiner, a stopwatch, and one-on-one time, student by student. Children at risk often get noticed late.

How it works: the child presses one button. A conversational agent built on AssemblyAI's Voice Agent API greets them and listens while they read a grade-leveled passage aloud. The browser tees the audio to a server route, AssemblyAI's Sync Speech-to-Text returns word-level timestamps and confidence, and a pure TypeScript scoring engine applies Curriculum-Based Measurement rules exactly as reading specialists do by hand: Levenshtein alignment against the passage, a 60-second window, substitutions/omissions/insertions classified individually, self-corrections within 3 seconds counted as correct, hesitations over 3 seconds flagged - the same rules as the DIBELS 8 administration guide. The result is benchmarked against the Hasbrouck & Tindal 2017 national norms (transcribed from the public University of Oregon tables, every cell locked by a unit test) into At Risk / Below Benchmark / On Track tiers. A 40-item rapid naming task (Denckla & Rudel 1976 paradigm) adds a second evidence-linked signal, and a practice loop drills exactly the missed words through guided repeated oral reading - the intervention with the strongest evidence base (National Reading Panel 2000). Everything lands on a shareable report for teachers and parents.

What makes it different:
1. Every metric, threshold, and rule traces to a citable source - documented rule-by-rule in METHODOLOGY.md.
2. It is validated the way the research literature validates ASR-based ORF tools: hand-scored recordings versus system scores, reporting Pearson r and MAE (VALIDATION.md).
3. It is honest about limits: ASR auto-corrects children's misreadings (documented in the literature), so low-confidence words are flagged and the bias is quantified rather than hidden; grade 1 fall has no published norms, so the app says so instead of inventing a percentile.

Technology: Next.js 14 + TypeScript; AssemblyAI Voice Agent API (session control, turn-taking, tool calling, agent speech via reply.create) and AssemblyAI Sync STT (word timestamps + confidence for scoring); Prisma/SQLite; Recharts. 61 unit tests + Playwright e2e; MIT licensed.

Business value: tutoring centers, EFL programs, and MTSS Tier-1 screening. Commercial precedents (Amira Learning; the IES-funded Moby.Read) prove demand - ReadPulse makes the methodology transparent, validated, and install-free.

## Technology & category tags

education, edtech, voice-agent, assemblyai, speech-recognition, ai-for-good, accessibility, nextjs, typescript

## Cover image

Screenshot of the report page with the percentile band chart (take after final UI state; 16:9 crop).

## Video presentation

[PENDING - record per docs/submission/video-script.md]

## Slide presentation

[PENDING - build per docs/submission/slides-outline.md]

## Application URL

[PENDING - Vercel deployment]

## GitHub repository

https://github.com/dungnotnull/ReadPulse-AI-Agent

---

## Before pressing submit - final checklist

- [ ] Validation numbers updated in video script + slide 6 (after study run)
- [ ] Deployed URL clicked through end-to-end (setup -> session -> report share link)
- [ ] Video uploaded and linked
- [ ] Slides exported as PDF and linked
- [ ] Cover image uploaded
- [ ] Tags selected on the form match the list above
- [ ] Team members added on lablab (1-6 people)
- [ ] Submit before Sep 30, 3:00 PM UTC
