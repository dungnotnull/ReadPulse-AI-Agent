import type { PassageWord } from "@/lib/scoring/types";

export interface Passage {
  id: string;
  title: string;
  text: string;
  grade: 1 | 3 | 5;
  sourceUrl: string | null;
  sourceNote: string;
  sentences: string[];
  words: PassageWord[];
}

function build(text: string): { sentences: string[]; words: PassageWord[] } {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const words: PassageWord[] = [];
  let si = 0;
  for (const s of sentences) {
    for (const word of s.split(/\s+/).filter(Boolean)) {
      words.push({ word, sentenceIndex: si });
    }
    si++;
  }
  return { sentences, words };
}

// Original passages authored for this project (no third-party copyright).
// Grade assignment verified by Flesch-Kincaid (see passages.test.ts band check).
// Actual FK: g1 = 0.43, g3 = 2.43, g5 = 6.31.
// No hyphenated words (documented cbmScorer limitation); periods are the only terminal punctuation.
const g1Text =
  "The little cat sat on the mat by the door. She saw a big red ball in the yard. The cat ran to the ball and played with it all day. Then she took a nap in the warm sun. The ball rolled away down the hill. The cat ran fast and chased it home.";
const g3Text =
  "One warm morning, a small brown dog woke up and looked out the window. The sun was bright, and the birds were singing in the tall green tree. The dog ran outside to play in the garden. He found a long stick under the old wooden bench. He carried it proudly around the yard. Then he dug a hole and hid his stick in it.";
const g5Text =
  "Long ago, people moved across wide open lands in search of food and shelter. They followed the rivers and learned the ways of the seasons. They watched the animals that shared their world. Over time, these travelers made tools and shared customs that helped them live in hard places. Their stories were told around evening fires. Today, scientists study these old paths to learn how human history grew across the world.";

export const PASSAGES: Passage[] = [
  { id: "g1-cat-ball", title: "The Cat and the Ball", text: g1Text, grade: 1, sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", ...build(g1Text) },
  { id: "g3-morning-dog", title: "A Morning in the Garden", text: g3Text, grade: 3, sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", ...build(g3Text) },
  { id: "g5-ancient-paths", title: "Ancient Paths", text: g5Text, grade: 5, sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", ...build(g5Text) },
];

export function passageById(id: string): Passage {
  const p = PASSAGES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown passage ${id}`);
  return p;
}
