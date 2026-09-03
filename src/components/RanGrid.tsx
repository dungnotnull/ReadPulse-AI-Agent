import { RAN_STIMULI } from "@/lib/data/stimuli";

const COLORS: Record<string, string> = {
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  black: "#111827",
};
const EMOJI: Record<string, string> = { ball: "⚽", cat: "🐱", dog: "🐶", star: "⭐", tree: "🌳" };

// 40-item serial naming grid (8 rows x 5), per the Denckla & Rudel (1976) RAN
// paradigm adapted to 40 items. Colors render as color swatches (naming from
// perception); objects as emoji.
export default function RanGrid({ variant }: { variant: "colors" | "objects" }) {
  const items = RAN_STIMULI[variant];
  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map((item, k) => (
        <div
          key={k}
          aria-label={variant === "colors" ? item : undefined}
          className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-gray-200 text-4xl"
          style={variant === "colors" ? { backgroundColor: COLORS[item] } : undefined}
        >
          {variant === "objects" ? EMOJI[item] : ""}
        </div>
      ))}
    </div>
  );
}
