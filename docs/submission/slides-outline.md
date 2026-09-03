# ReadPulse - Slide Deck Outline (8 slides)

Tool-agnostic outline; build in Google Slides / PowerPoint / Canva. Keep one idea per slide, large screenshots, citations visible.

---

## Slide 1 - Title
- ReadPulse - A Reading Specialist in Every Classroom
- One-liner: "A voice agent that administers and scores oral reading fluency screenings - by the book."
- Team name + hackathon: AssemblyAI Voice Agent Hackathon 2026 (lablab.ai)
- Screenshot: report page with percentile band chart (most distinctive visual)

## Slide 2 - The Problem
- ORF screening (WCPM) = standard Tier-1 reading screener in US schools, 2-3x/year
- Manual administration: trained examiner + stopwatch + 1-on-1 time, student by student
- Consequence: late identification of children at risk
- Stat callout: early intervention before grade 3 matters most (cite: National Reading Panel 2000)

## Slide 3 - The Solution (screenshots, 4 panels)
- Agent greets and leads (Voice Agent API)
- Child reads 1 minute; app listens and records
- Instant CBM-accurate score + national percentile
- Practice loop drills exactly the missed words + 30s naming game

## Slide 4 - Architecture
- Mermaid diagram from README (browser AudioWorklet -> Voice Agent WS + tee -> /api/score-reading -> AssemblyAI Sync STT -> ScoringEngine -> Prisma -> shareable report)
- Callout: two AssemblyAI products, each where strongest (realtime conversation + accurate batch scoring with word timestamps)

## Slide 5 - THE SCIENCE (the differentiator slide)
- Table: 6 key rules -> source
  - WCPM, 1-minute probe -> Deno 1985 (CBM)
  - Self-correction within 3s = correct -> DIBELS 8 Admin Guide
  - Hesitation > 3s = error -> DIBELS 8 Admin Guide
  - National percentile bands -> Hasbrouck & Tindal 2017 (TR 1702, Univ. of Oregon)
  - RAN naming task -> Denckla & Rudel 1976
  - Practice = guided repeated oral reading -> NRP 2000; Samuels 1979; Therrien 2004
- Footer: "Every threshold in the product traces to a citation. See METHODOLOGY.md."

## Slide 6 - Validation
- Method: recordings scored by hand (DIBELS rules) vs by the system - replicates SERDA 2025 / Molenaar 2023 agreement methodology
- Results: [fill from VALIDATION.md: n, Pearson r WCPM, MAE, error-count bias]
- Honest limitations box: small N, adult simulated readers, ASR auto-correction bias direction

## Slide 7 - Business Value
- Buyers: tutoring centers, EFL/EFL programs, MTSS Tier-1 screening, parents
- Precedents prove demand: Amira Learning (commercial), Moby.Read (IES SBIR-funded)
- Differentiators: transparent methodology (auditable), validation numbers, voice-agent delivery (no tablet app install)

## Slide 8 - Close
- ReadPulse recap in 3 bullets: science-grounded scoring / instant national benchmark / practice that targets the gap
- Links: demo URL, GitHub repo, video
- Team + thanks

---

## Fill-before-submit checklist
- [ ] Slide 6 numbers from real VALIDATION.md
- [ ] Demo URL live (Vercel) and clicked through the day before deadline
- [ ] GitHub repo public, MIT license visible
- [ ] Screenshots taken from the FINAL app (re-shoot after any UI fix)
