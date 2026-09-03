// Seeds a demo Report row used for manual smoke-testing the shareable report page.
// Run: pnpm exec tsx scripts/seed-report.ts
import { prisma } from "../src/lib/db";
import type { ReadingScore } from "../src/lib/scoring/types";

const SLUG = "readpulse-seed";

const readingScore: ReadingScore = {
  wcpm: 72.5,
  accuracyPct: 92.9,
  windowSeconds: 60,
  counts: {
    correct: 65,
    substitutions: 3,
    omissions: 2,
    insertions: 1,
    hesitations: 1,
    selfCorrections: 1,
  },
  missedWords: [],
  percentile: {
    estimated: 45,
    tier: "below_benchmark",
    source: "Hasbrouck & Tindal 2017",
  },
  lowConfidenceWords: [],
};

async function main() {
  await prisma.report.deleteMany({ where: { slug: SLUG } });
  await prisma.report.create({
    data: {
      slug: SLUG,
      childName: "Demo Reader",
      grade: 3,
      season: "fall",
      passageId: "demo-passage",
      passageTitle: "The Kite",
      readingScore: JSON.stringify(readingScore),
      ranScore: null,
    },
  });
  console.log(`Seeded report: /report/${SLUG}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
