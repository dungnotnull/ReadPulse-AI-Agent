export interface RawOp {
  op: "match" | "substitution" | "omission" | "insertion";
  passageIndex: number | null;
  transcriptIndex: number | null;
}

// Word-level Levenshtein alignment with backtrace (spec 5.2).
// Tie-break preference (deterministic): earliest operations win, so among
// equal-cost alignments an earlier substitution is preferred over omitting
// the earlier word. Achieved by aligning reversed sequences (a backward
// backtrace cannot express this preference) and remapping indices.
export function alignWords(passage: string[], transcript: string[]): RawOp[] {
  const p = [...passage].reverse();
  const t = [...transcript].reverse();
  const n = p.length;
  const m = t.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0)
  );
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = p[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + subCost, // match or substitution
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j] + 1 // omission
      );
    }
  }
  const ops: RawOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const subCost = p[i - 1] === t[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + subCost) {
        ops.push({
          op: subCost === 0 ? "match" : "substitution",
          passageIndex: n - i,
          transcriptIndex: m - j,
        });
        i--;
        j--;
        continue;
      }
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      ops.push({ op: "insertion", passageIndex: null, transcriptIndex: m - j });
      j--;
      continue;
    }
    ops.push({ op: "omission", passageIndex: n - i, transcriptIndex: null });
    i--;
  }
  return ops;
}
