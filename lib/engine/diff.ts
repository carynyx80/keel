export type DiffLine = { op: " " | "+" | "-"; text: string };

/** Line-level LCS diff (inputs are capped by the caller). */
export function lineDiff(a: string, b: string, maxLines = 800): DiffLine[] {
  const A = a.split("\n").slice(0, maxLines);
  const B = b.split("\n").slice(0, maxLines);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i].trim() === B[j].trim() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i].trim() === B[j].trim()) { out.push({ op: " ", text: B[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "-", text: A[i++] });
    else out.push({ op: "+", text: B[j++] });
  }
  while (i < n) out.push({ op: "-", text: A[i++] });
  while (j < m) out.push({ op: "+", text: B[j++] });
  return out;
}
