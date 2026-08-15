/**
 * A deliberately tiny test harness — no vitest, no jest, no new dependency.
 *
 * The project already has tsx (used for prisma seeding), so `npm test` costs
 * nothing to install and nothing to maintain. Every previous round of this
 * project wrote throwaway test scripts and deleted them; the point of this
 * directory is that those assertions now survive.
 */

export type Case = { name: string; fn: () => void | Promise<void> };

let current: { pass: number; fail: number; failures: string[] } | null = null;

export function ok(cond: boolean, label: string, detail = ""): void {
  if (!current) throw new Error("ok() called outside a suite");
  if (cond) current.pass++;
  else {
    current.fail++;
    current.failures.push(`${label}${detail ? `  →  ${detail}` : ""}`);
  }
}

export function eq<T>(actual: T, expected: T, label: string): void {
  ok(
    actual === expected,
    label,
    actual === expected ? "" : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
  );
}

export async function suite(title: string, body: () => void | Promise<void>) {
  current = { pass: 0, fail: 0, failures: [] };
  try {
    await body();
  } catch (e: any) {
    current.fail++;
    current.failures.push(`threw: ${e?.message ?? e}`);
  }
  const { pass, fail, failures } = current;
  const mark = fail === 0 ? "PASS" : "FAIL";
  console.log(`${mark}  ${title}  —  ${pass} passed${fail ? `, ${fail} failed` : ""}`);
  failures.forEach((f) => console.log(`        x ${f}`));
  current = null;
  return { pass, fail };
}
