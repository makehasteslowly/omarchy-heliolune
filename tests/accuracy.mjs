// Heliolune accuracy suite: compares Model.js against US Naval Observatory reference
// data saved in tests/fixtures (see tests/fetch-usno.py). Runs offline:
//     node tests/accuracy.mjs            # summary + pass/fail
//     node tests/accuracy.mjs --verbose  # every comparison
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "Model.js"), "utf8").replace(/^\.pragma library.*$/m, "");
const M = new Function(src + "\nreturn { getSunTimesForDay, getMoonTimes, findNextLunarPhaseDate, seasonEventDate, analemmaPoint, meanNoonFor };")();
const fx = (n) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", n), "utf8"));
const verbose = process.argv.includes("--verbose");

// Error budget per quantity, in minutes (max abs error allowed)
// (set just above what the model achieves, so any regression fails)
const LIMITS = {
  "Sunrise/sunset": 0.5,
  "Solar noon": 0.25,
  "Civil twilight": 0.5,
  "Moonrise/moonset": 1.0,
  "Moon phases": 2.0,
  "Equinox/solstice": 1.0,
  "Equation of time": 0.25,
};
const stats = {};
function record(cat, errMin, label) {
  (stats[cat] ||= []).push({ err: errMin, label });
  if (verbose) console.log(`${cat.padEnd(18)} ${errMin >= 0 ? "+" : ""}${errMin.toFixed(2).padStart(7)} min  ${label}`);
}

// Fixed-offset zones so "local day" logic is exercised exactly as on a real machine
function setTz(offsetHours) { process.env.TZ = offsetHours === 0 ? "Etc/GMT" : `Etc/GMT${offsetHours > 0 ? "-" : "+"}${Math.abs(offsetHours)}`; }
const utcFromLocal = (date, hhmm, tz) => {
  const [y, m, d] = date.split("-").map(Number); const [hh, mm] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - tz * 3600000;
};
const diffMin = (ours, refMs) => (ours.getTime() - refMs) / 60000;
// USNO times are rounded to the minute: allow for that before comparing
const round = (e) => (Math.abs(e) <= 0.5 ? 0 : e - Math.sign(e) * 0.5);

// ---- Sun & Moon rise/set/transit/twilight, per city-day
for (const e of fx("usno-rstt.json")) {
  setTz(e.tz);
  const [y, m, d] = e.date.split("-").map(Number);
  const day = new Date(y, m - 1, d, 12, 0, 0);
  const label = `${e.city} ${e.date}`;
  const sun = M.getSunTimesForDay(day, e.lat, e.lon);
  // USNO files an after-midnight sunset/dusk under the calendar day it lands on; we
  // attach it to the evening it ends. Compare against whichever day's value is closer.
  const prev = M.getSunTimesForDay(new Date(y, m - 1, d - 1, 12, 0, 0), e.lat, e.lon);
  const next = M.getSunTimesForDay(new Date(y, m - 1, d + 1, 12, 0, 0), e.lat, e.lon);
  const nearest = (key, ref) => [sun[key], prev[key], next[key]].filter(Boolean)
    .reduce((best, v) => (best === null || Math.abs(v - ref) < Math.abs(best - ref) ? v : best), null);
  const cmp = (cat, key, ref, what) => {
    const v = nearest(key, ref);
    record(cat, v ? round(diffMin(v, ref)) : 999, `${label} ${what}`);
  };
  for (const x of e.sundata || []) {
    if (!x.time) continue;
    const ref = utcFromLocal(e.date, x.time, e.tz);
    if (x.phen === "Rise") cmp("Sunrise/sunset", "sunrise", ref, "rise");
    if (x.phen === "Set") cmp("Sunrise/sunset", "sunset", ref, "set");
    if (x.phen === "Upper Transit") record("Solar noon", round(diffMin(sun.solarNoon, ref)), label);
    if (x.phen === "Begin Civil Twilight") cmp("Civil twilight", "dawn", ref, "dawn");
    if (x.phen === "End Civil Twilight") cmp("Civil twilight", "dusk", ref, "dusk");
  }
  // Polar day/night must be recognised, not invented
  const contUp = (e.sundata || []).some((x) => /continuously above the Horizon/.test(x.phen));
  const contDown = (e.sundata || []).some((x) => /continuously below the Horizon/.test(x.phen));
  if (contUp || contDown) record("Sunrise/sunset", sun.sunrise === null && sun.sunset === null ? 0 : 999, `${label} polar ${contUp ? "day" : "night"}`);

  const moon = M.getMoonTimes(day, e.lat, e.lon);
  // Every USNO event must match one of ours (the Moon can rise or set twice in a day)
  const closest = (list, ref) => list.reduce((best, v) => (best === null || Math.abs(v - ref) < Math.abs(best - ref) ? v : best), null);
  for (const x of e.moondata || []) {
    if (!x.time) continue;
    const ref = utcFromLocal(e.date, x.time, e.tz);
    if (x.phen === "Rise") { const v = closest(moon.rises, ref); record("Moonrise/moonset", v ? round(diffMin(v, ref)) : 999, `${label} moonrise`); }
    if (x.phen === "Set") { const v = closest(moon.sets, ref); record("Moonrise/moonset", v ? round(diffMin(v, ref)) : 999, `${label} moonset`); }
  }
  // ...and we must not invent extra crossings USNO does not list
  const usnoCount = (phen) => (e.moondata || []).filter((x) => x.phen === phen && x.time).length;
  if (moon.rises.length !== usnoCount("Rise")) record("Moonrise/moonset", 999, `${label} moonrise count ${moon.rises.length} vs ${usnoCount("Rise")}`);
  if (moon.sets.length !== usnoCount("Set")) record("Moonrise/moonset", 999, `${label} moonset count ${moon.sets.length} vs ${usnoCount("Set")}`);
  const mUp = (e.moondata || []).some((x) => /continuously above/.test(x.phen));
  const mDown = (e.moondata || []).some((x) => /continuously below/.test(x.phen));
  if (mUp) record("Moonrise/moonset", moon.alwaysUp ? 0 : 999, `${label} moon always up`);
  if (mDown) record("Moonrise/moonset", moon.alwaysDown ? 0 : 999, `${label} moon always down`);

  // Equation of time from the Sun's transit: EoT = mean noon - true noon
  const transit = (e.sundata || []).find((x) => x.phen === "Upper Transit" && x.time);
  if (transit) {
    const meanNoon = M.meanNoonFor(y, m - 1, d, e.lon);
    const p = M.analemmaPoint(meanNoon, e.lat, e.lon);
    const refEot = (meanNoon.getTime() - utcFromLocal(e.date, transit.time, e.tz)) / 60000;
    record("Equation of time", round(p.eot - refEot), label);
  }
}
setTz(0);

// ---- Moon phases (UTC)
const target = { "New Moon": 0.0, "First Quarter": 0.25, "Full Moon": 0.5, "Last Quarter": 0.75 };
for (const p of fx("usno-moon-phases.json")) {
  const ref = Date.UTC(p.year, p.month - 1, p.day, ...p.time.split(":").map(Number));
  const found = M.findNextLunarPhaseDate(new Date(ref - 3 * 86400000), target[p.phase]);
  record("Moon phases", round(diffMin(found, ref)), `${p.phase} ${p.year}-${p.month}-${p.day}`);
}

// ---- Equinoxes & solstices (UTC)
const kindOf = (e) => (e.phenom === "Equinox" ? (e.month === 3 ? 0 : 2) : e.month === 6 ? 1 : 3);
for (const e of fx("usno-seasons.json")) {
  const ref = Date.UTC(e.year, e.month - 1, e.day, ...e.time.split(":").map(Number));
  record("Equinox/solstice", round(diffMin(M.seasonEventDate(e.year, kindOf(e)), ref)), `${e.phenom} ${e.year}-${e.month}`);
}

// ---- Report
let failed = false;
console.log("\nHeliolune accuracy vs. US Naval Observatory (minutes, after USNO's 1-minute rounding)\n");
console.log("Quantity            n    mean|err|   max|err|   limit   result");
for (const [cat, rows] of Object.entries(stats)) {
  const abs = rows.map((r) => Math.abs(r.err));
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const max = Math.max(...abs);
  const worst = rows[abs.indexOf(max)].label;
  const ok = max <= LIMITS[cat];
  if (!ok) failed = true;
  console.log(`${cat.padEnd(18)} ${String(rows.length).padStart(3)}   ${mean.toFixed(2).padStart(8)}   ${max >= 999 ? "  MISSED" : max.toFixed(2).padStart(8)}   ${LIMITS[cat].toFixed(1).padStart(5)}   ${ok ? "pass" : "FAIL  (worst: " + worst + ")"}`);
}
process.exit(failed ? 1 : 0);
