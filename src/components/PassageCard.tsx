import type { Passage } from "@/lib/data/passages";

// Large-type passage display for on-screen reading.
export default function PassageCard({ passage }: { passage: Passage }) {
  return (
    <section aria-label={`Passage: ${passage.title}`}>
      <h2 className="text-xl font-semibold mb-4">{passage.title}</h2>
      <div className="text-2xl leading-relaxed space-y-5">
        {passage.sentences.map((sentence, i) => (
          <p key={i}>{sentence.trim()}</p>
        ))}
      </div>
    </section>
  );
}
