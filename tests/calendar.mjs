// ISO 8601 week numbers, including the New Year edge cases. Run: node tests/calendar.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "Model.js"), "utf8").replace(/^\.pragma library.*$/m, "");
const M = new Function(src + "\nreturn { isoWeek };")();
const cases = [
  ["2026-11-02", 45, 2026], ["2026-01-01", 1, 2026], ["2027-01-01", 53, 2026], ["2027-01-03", 53, 2026],
  ["2027-01-04", 1, 2027], ["2024-12-30", 1, 2025], ["2025-12-29", 1, 2026], ["2021-01-03", 53, 2020],
  ["2020-12-31", 53, 2020], ["2026-06-15", 25, 2026],
];
let failed = 0;
for (const [s, week, year] of cases) {
  const [y, m, d] = s.split("-").map(Number);
  const r = M.isoWeek(new Date(y, m - 1, d, 12));
  if (r.week !== week || r.year !== year) { failed++; console.log(`FAIL ${s}: got W${r.week} ${r.year}, expected W${week} ${year}`); }
}
console.log(failed ? `${failed} ISO week case(s) failed` : `ISO week: ${cases.length} cases pass`);
process.exit(failed ? 1 : 0);
