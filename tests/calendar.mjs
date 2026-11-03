// ISO 8601 week numbers, including the New Year edge cases. Run: node tests/calendar.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "Model.js"), "utf8").replace(/^\.pragma library.*$/m, "");
const M = new Function(src + "\nreturn { isoWeek, weekNumber, computeSeasonSummary, getSunTimesForDay, getMoonTimes, computeSolarSummary, formatWind, parseCurrentWeather, WEATHER_MAX_BYTES };")();
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

// ---- user options (settings): each check is [label, condition]
const checks = [];
const ny = [40.7128, -74.006];
process.env.TZ = "Etc/GMT+5";
const d = (s, h = 12) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd, h); };

// US weeks: Sunday start, week 1 contains Jan 1
for (const [s, w] of [["2026-01-01", 1], ["2026-01-03", 1], ["2026-01-04", 2], ["2026-11-01", 45], ["2026-11-02", 45], ["2026-12-27", 53], ["2027-01-01", 1]]) {
  checks.push([`US week ${s} = ${w}`, M.weekNumber(d(s), "us").week === w]);
}
checks.push(["weekNumber defaults to ISO", M.weekNumber(d("2027-01-01"), "iso").week === 53]);

// Meteorological seasons: first of Mar/Jun/Sep/Dec, flipped south of the equator
const met = M.computeSeasonSummary(d("2026-11-02"), 40.7, "meteorological");
checks.push(["meteorological north: next is Start of Winter on Dec 1", met.nextEventName === "Start of Winter" && met.nextDate.getMonth() === 11 && met.nextDate.getDate() === 1]);
checks.push(["meteorological north: Autumn, day 63 of 91", met.currentSeasonName === "Autumn" && met.seasonDay === 63 && met.seasonLengthDays === 91]);
const metS = M.computeSeasonSummary(d("2026-11-02"), -33.9, "meteorological");
checks.push(["meteorological south: next is Start of Summer", metS.nextEventName === "Start of Summer"]);
const ast = M.computeSeasonSummary(d("2026-11-02"), 40.7, "astronomical");
checks.push(["astronomical unchanged: Winter Solstice", ast.nextEventName === "Winter Solstice" && ast.isSolstice]);

// Elevation lowers the horizon: earlier sunrise, later sunset, by the dip formula
const sea = M.getSunTimesForDay(d("2026-06-21"), ...ny), hi = M.getSunTimesForDay(d("2026-06-21"), ...ny, { elevation: 1500 });
const earlier = (sea.sunrise - hi.sunrise) / 60000, later = (hi.sunset - sea.sunset) / 60000;
checks.push([`1500 m: sunrise ${earlier.toFixed(1)} min earlier, sunset ${later.toFixed(1)} min later (expect 4-8)`, earlier > 4 && earlier < 8 && later > 4 && later < 8]);
const mSea = M.getMoonTimes(d("2026-06-21"), ...ny), mHi = M.getMoonTimes(d("2026-06-21"), ...ny, { elevation: 1500 });
checks.push(["1500 m: moonrise earlier too", mSea.rise && mHi.rise && mHi.rise < mSea.rise]);
checks.push(["no options = sea level", M.getSunTimesForDay(d("2026-06-21"), ...ny, {}).sunrise.getTime() === sea.sunrise.getTime()]);

// Light presets
const std = M.getSunTimesForDay(d("2026-06-21"), ...ny);
const photo = M.getSunTimesForDay(d("2026-06-21"), ...ny, { light: "photographer" });
const ext = M.getSunTimesForDay(d("2026-06-21"), ...ny, { light: "extended" });
checks.push(["standard golden hour starts at sunrise", std.goldenMorningStart.getTime() === std.sunrise.getTime()]);
checks.push(["photographer golden hour starts before sunrise (-4 deg)", photo.goldenMorningStart < std.sunrise]);
checks.push(["extended golden hour runs later (+10 deg)", ext.goldenHourEnd > std.goldenHourEnd]);
checks.push(["extended blue hour starts earlier (-8 deg)", ext.blueHourMorningStart < std.blueHourMorningStart]);
const preDawn = new Date(std.sunrise.getTime() - 12 * 60000);
checks.push(["photographer: 12 min before sunrise is golden hour", M.computeSolarSummary(preDawn, ...ny, { light: "photographer" }).phaseKey === "golden_hour"]);
checks.push(["standard: 12 min before sunrise is not golden hour", M.computeSolarSummary(preDawn, ...ny).phaseKey !== "golden_hour"]);

// Wind units
checks.push(["wind km/h", M.formatWind(10, "kmh") === "10 km/h"]);
checks.push(["wind mph", M.formatWind(10, "mph") === "6 mph"]);
checks.push(["wind m/s", M.formatWind(10, "ms") === "2.8 m/s"]);
checks.push(["wind boolean compatibility", M.formatWind(10, true) === "6 mph" && M.formatWind(10, false) === "10 km/h"]);

// Forecast parsing (Open-Meteo response captured for Lisbon, tests/fixtures)
const wxRaw = fs.readFileSync(path.join(here, "fixtures", "open-meteo-forecast.json"), "utf8");
const wx = M.parseCurrentWeather(wxRaw);
checks.push(["forecast: 24 hourly entries", wx && wx.forecast.hourly.length === 24]);
checks.push(["forecast: 7 daily entries", wx && wx.forecast.daily.length === 7]);
checks.push(["forecast: first day parsed", wx && wx.forecast.daily[0].y === 2026 && wx.forecast.daily[0].mo === 11 && wx.forecast.daily[0].d === 3
  && wx.forecast.daily[0].maxC === 22.4 && wx.forecast.daily[0].minC === 10.1 && wx.forecast.daily[0].key === "overcast"]);
checks.push(["forecast: thunderstorm day has its icon kind", wx && wx.forecast.daily[5].kind === "thunder" && wx.forecast.daily[5].pop === 85]);
checks.push(["forecast: response well under the size cap", wxRaw.length < M.WEATHER_MAX_BYTES / 4]);
const bad = JSON.parse(wxRaw);
bad.daily.temperature_2m_max[1] = "<script>"; bad.daily.weather_code[2] = 1234; bad.daily.time[3] = "2026-13-40";
bad.hourly.temperature_2m[0] = 900; bad.hourly.time[1] = "../../etc";
const wxBad = M.parseCurrentWeather(JSON.stringify(bad));
checks.push(["forecast: invalid entries are skipped, the rest kept", wxBad && wxBad.forecast.daily.length === 4 && wxBad.forecast.hourly.length === 22]);
delete bad.hourly; delete bad.daily;
const wxNone = M.parseCurrentWeather(JSON.stringify(bad));
checks.push(["forecast: missing blocks give empty lists, current weather still parsed", wxNone && wxNone.tempC !== undefined && wxNone.forecast.hourly.length === 0 && wxNone.forecast.daily.length === 0]);

for (const [label, ok] of checks) { if (!ok) { failed++; console.log("FAIL " + label); } else if (process.argv.includes("--verbose")) console.log("ok   " + label); }
console.log(`Options: ${checks.filter(c => c[1]).length}/${checks.length} checks pass`);
process.exit(failed ? 1 : 0);
