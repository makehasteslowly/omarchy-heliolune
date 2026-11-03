// ISO 8601 week numbers, including the New Year edge cases. Run: node tests/calendar.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "Model.js"), "utf8").replace(/^\.pragma library.*$/m, "");
const M = new Function(src + "\nreturn { isoWeek, weekNumber, computeSeasonSummary, getSunTimesForDay, getMoonTimes, computeSolarSummary, formatWind, parseCurrentWeather, WEATHER_MAX_BYTES, computeWeatherAlert, lunarDays, moonVisibility, firstWindow, getMoonPosition, lunarCycle, areaPoints, areaUrl, parseAreaForecast, compassPoint, AREA_MAX_BYTES, mapTiles, tileKey, compassFromDegrees, gridSample, gridSampleSmooth, windVector, radarColor, windColor, parseRadarFrames, radarTileKey, RADAR_HOST, cleanCityQuery, geocodeUrl, parseGeocode, GEOCODE_MAX_BYTES, notificationPlan, dueNotifications, dayEventFireAt, activeReminders };")();
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

// Every WMO weather code maps to the drawn icon the bar and popup show
const wxFor = (code, isDay) => M.parseCurrentWeather(JSON.stringify({ current: { temperature_2m: 8, weather_code: code, is_day: isDay ? 1 : 0 } }));
const expectKind = [
  [0, 1, "clear"], [0, 0, "clearNight"], [1, 1, "clear"], [2, 1, "partly"], [2, 0, "partlyNight"], [3, 1, "cloudy"], [3, 0, "cloudy"],
  [45, 1, "fog"], [48, 1, "fog"], [51, 1, "drizzle"], [53, 1, "drizzle"], [55, 1, "drizzle"], [56, 1, "freezing"], [57, 1, "freezing"],
  [61, 1, "rain"], [63, 1, "rain"], [65, 1, "heavyRain"], [66, 1, "freezing"], [67, 1, "freezing"],
  [71, 1, "snow"], [73, 1, "snow"], [75, 1, "snow"], [77, 1, "snow"], [80, 1, "rain"], [81, 1, "rain"], [82, 1, "heavyRain"],
  [85, 1, "snow"], [86, 1, "snow"], [95, 1, "thunder"], [96, 1, "hail"], [99, 1, "hail"], [61, 0, "rain"], [95, 0, "thunder"],
];
const wrongKinds = expectKind.filter(([c, day, k]) => { const w = wxFor(c, day); return !w || w.kind !== k; });
checks.push([`weather icons: ${expectKind.length} code/day-night cases map to the right icon` + (wrongKinds.length ? " (wrong: " + wrongKinds.map(x => x[0] + (x[1] ? "d" : "n")).join(", ") + ")" : ""), wrongKinds.length === 0]);
checks.push(["weather icons: unknown code is rejected, not shown as clear", wxFor(42, 1) === null]);

// Weather alerts: only heavy or dangerous weather, now or within 12 hours
const hour = (h, code, pop = null) => ({ h, code, pop, key: "k" + code, kind: "x" });
const calm = { code: 1, key: "mainlyClear", kind: "clear", forecast: { hourly: [0,1,2,3,4,5,6,7,8,9,10,11,12,13].map(h => hour(h, 3)) } };
checks.push(["alerts: calm day has none", M.computeWeatherAlert(calm) === null]);
const soon = JSON.parse(JSON.stringify(calm)); soon.forecast.hourly[5] = hour(5, 65, 80); soon.forecast.hourly[6] = hour(6, 82, 90);
const a1 = M.computeWeatherAlert(soon);
checks.push(["alerts: heavy rain at 5 runs to 7, highest chance 90%", a1 && !a1.now && a1.startH === 5 && a1.endH === 7 && a1.pop === 90 && a1.code === 65]);
const nowStorm = JSON.parse(JSON.stringify(calm)); nowStorm.code = 95; nowStorm.key = "thunderstorm"; nowStorm.forecast.hourly[0] = hour(0, 95); nowStorm.forecast.hourly[1] = hour(1, 95);
const a2 = M.computeWeatherAlert(nowStorm);
checks.push(["alerts: thunderstorm now, until 2", a2 && a2.now && a2.key === "thunderstorm" && a2.endH === 2]);
const far = JSON.parse(JSON.stringify(calm)); far.forecast.hourly[13] = hour(13, 75);
checks.push(["alerts: heavy snow 13 h out is beyond the 12 h window", M.computeWeatherAlert(far) === null]);
const light = JSON.parse(JSON.stringify(calm)); light.forecast.hourly[2] = hour(2, 61); light.forecast.hourly[3] = hour(3, 71);
checks.push(["alerts: light rain and light snow do not alert", M.computeWeatherAlert(light) === null]);
const toEnd = JSON.parse(JSON.stringify(calm)); toEnd.forecast.hourly[12] = hour(12, 96); toEnd.forecast.hourly[13] = hour(13, 96);
const a3 = M.computeWeatherAlert(toEnd);
checks.push(["alerts: spell running past the forecast has no end hour", a3 && a3.startH === 12 && a3.endH === null]);

// 30-day Moon: principal phases land on the right days (USNO, Nov-Dec 2026, Eastern time)
const days30 = M.lunarDays(new Date(2026, 10, 3, 1, 0), 30);
const evOn = d => (days30.find(x => x.date.getMonth() === d[0] && x.date.getDate() === d[1]) || {}).event;
checks.push(["30 days: 30 entries, day 0 now", days30.length === 30 && days30[0].date.getHours() === 1]);
checks.push(["30 days: new Moon Nov 9, first quarter Nov 17, full Nov 24, last quarter Dec 1",
  evOn([10, 9]) === "new" && evOn([10, 17]) === "first" && evOn([10, 24]) === "full" && evOn([11, 1]) === "last"]);
checks.push(["30 days: exactly four principal phases", days30.filter(x => x.event).length === 4]);
// Visibility: 24 hourly samples from the current hour; visible only with the Moon up and the Sun down
const vis = M.moonVisibility(new Date(2026, 10, 3, 1, 20), 40.71, -74.0, 24);
checks.push(["visibility: 24 samples from the top of the hour", vis.length === 24 && vis[0].h === 1 && vis[0].t.getMinutes() === 0]);
checks.push(["visibility: never visible with the Sun up", vis.every(v => !v.visible || v.sunAlt < 0)]);
checks.push(["visibility: altitude matches getMoonPosition", Math.abs(vis[5].moonAlt - M.getMoonPosition(vis[5].t, 40.71, -74.0).altitude) < 1e-9]);
const win = M.firstWindow(vis, v => v.visible);
checks.push(["visibility: waning crescent rises after midnight and is visible before dawn", win && win.from.getHours() <= 3 && win.to.getHours() <= 7]);

// Current lunation: Nov 3 2026 lies between the new Moons of Oct 10 and Nov 9 (USNO)
const cyc = M.lunarCycle(new Date(2026, 10, 3, 2, 0));
const md = d => [d.getMonth() + 1, d.getDate()].join("/");
checks.push(["cycle: Oct 10 -> Nov 9, now inside", md(cyc.start) === "10/10" && md(cyc.end) === "11/9" && cyc.start < new Date(2026, 10, 3) && cyc.end > new Date(2026, 10, 3)]);
checks.push(["cycle: first quarter, full, last quarter in order inside it", cyc.events.length === 5 && cyc.events.every((e, i) => i === 0 || e.at > cyc.events[i - 1].at) && cyc.events[2].key === "full"]);
checks.push(["cycle: about 29.5 days long", Math.abs((cyc.end - cyc.start) / 86400000 - 29.53) < 0.5]);

// Area map: 5 x 5 grid, centre is the location, edges at the radius, one URL, aligned parse
const pts = M.areaPoints(40.71, -74.0, 96.56, 5);
const kmLon = 111.32 * Math.cos(40.71 * Math.PI / 180);
checks.push(["area: 25 points, centre is the location", pts.length === 25 && pts[12].lat === 40.71 && pts[12].lon === -74.0]);
checks.push(["area: north-west corner first, edges 60 mi out", pts[0].dyKm > 0 && pts[0].dxKm < 0
  && Math.abs((pts[0].lat - 40.71) * 110.574 - 96.56) < 0.01 && Math.abs((-74.0 - pts[0].lon) * kmLon - 96.56) < 0.01]);
checks.push(["area: bad input -> no points", M.areaPoints(91, 0, 50, 5).length === 0 && M.areaPoints(0, 0, 50, 4).length === 0 && M.areaPoints(0, 0, -5, 5).length === 0]);
checks.push(["area: longitude wraps at the antimeridian", M.areaPoints(0, 179.9, 100, 3)[2].lon < -179]);
const aUrl = M.areaUrl(pts);
checks.push(["area: one open-meteo URL with 25 rounded coordinates", aUrl.startsWith("https://api.open-meteo.com/v1/forecast?latitude=")
  && aUrl.split("&")[0].split("=")[1].split(",").length === 25 && !/[^0-9a-z:\/.?=&,_-]/i.test(aUrl)]);
checks.push(["area: bad point -> no URL", M.areaUrl([{ lat: "1;rm", lon: 0 }]) === "" && M.areaUrl([]) === ""]);
const blk = (t, code) => ({ hourly: { time: Array.from({ length: 24 }, (_, i) => `2026-11-03T${String(i).padStart(2, "0")}:00`),
  temperature_2m: Array(24).fill(t), weather_code: Array(24).fill(code), precipitation_probability: Array(24).fill(40), is_day: Array(24).fill(1),
  precipitation: Array(24).fill(t / 4), wind_speed_10m: Array(24).fill(t * 3), wind_direction_10m: Array(24).fill(i => i).map((_, h) => h === 2 ? 999 : 315) } });
const area = M.parseAreaForecast(JSON.stringify(Array.from({ length: 9 }, (_, i) => i === 3 ? { hourly: { time: [] } } : blk(i, 61))), 9);
checks.push(["area: parse keeps hours aligned, bad point is null", area && area.hours.length === 24 && area.cells.length === 9
  && area.cells[3][0] === null && area.cells[8][5].tempC === 8 && area.cells[4][0].key === "lightRain" && area.cells[4][0].pop === 40]);
checks.push(["area: wrong count / not JSON / too big rejected", M.parseAreaForecast(JSON.stringify([blk(1, 0)]), 9) === null
  && M.parseAreaForecast("nope", 9) === null && M.parseAreaForecast("[" + " ".repeat(M.AREA_MAX_BYTES) + "]", 1) === null]);
checks.push(["area: compass points", M.compassPoint(0, 1) === "N" && M.compassPoint(1, 1) === "NE" && M.compassPoint(-1, 0) === "W" && M.compassPoint(0.2, -1) === "SSE"]);

// Basemap tiles: cover the whole box, drawn near their own size, location tile under the centre
for (const [r, box] of [[20, 500], [60, 500], [100, 500], [160, 320]]) {
  const mt = M.mapTiles(38.72, -9.14, 2.5 * r * 1.609, box);
  const covers = mt && Math.min(...mt.tiles.map(t => t.left)) <= 0 && Math.min(...mt.tiles.map(t => t.top)) <= 0
    && Math.max(...mt.tiles.map(t => t.left + t.size)) >= box && Math.max(...mt.tiles.map(t => t.top + t.size)) >= box;
  checks.push([`tiles ${r} mi in ${box}px: cover the box, 70-142 % scale, at most 16`, covers
    && mt.tiles.every(t => t.size > 0.7 * 256 && t.size < 1.42 * 256) && mt.tiles.length <= 16]);
}
const mt60 = M.mapTiles(38.72, -9.14, 241, 500);
// Lisbon at zoom 8 is tile x 121, y 98 (slippy-map formula); it sits under the box centre
const c60 = mt60.tiles.find(t => t.left <= 250 && t.left + t.size > 250 && t.top <= 250 && t.top + t.size > 250);
checks.push(["tiles: zoom 8 for 60 mi, centre tile 8/121/98", mt60.zoom === 8 && c60 && M.tileKey(c60) === "8/121/98"]);
checks.push(["tiles: bad input -> null", M.mapTiles(89, 0, 100, 500) === null && M.mapTiles(0, 0, 0, 500) === null]);
checks.push(["tileKey: rejects out-of-range and non-integers", M.tileKey({ z: 8, x: 256, y: 0 }) === "" && M.tileKey({ z: 8, x: "1;rm", y: 0 }) === ""
  && M.tileKey({ z: 2.5, x: 0, y: 0 }) === "" && M.tileKey({ z: 3, x: 7, y: 7 }) === "3/7/7"]);
checks.push(["tiles: wrap across the antimeridian", M.mapTiles(0, 179.99, 300, 500).tiles.some(t => t.x === 0)]);

checks.push(["area: wind speed and direction kept, bad direction dropped", area.cells[8][0].windKmh === 24 && area.cells[8][0].windDir === 315
  && area.cells[8][2].windDir === null && area.cells[8][2].windKmh === 24]);
checks.push(["area: URL asks for wind in km/h", aUrl.includes("wind_speed_10m,wind_direction_10m") && aUrl.includes("wind_speed_unit=kmh")]);
checks.push(["compass from degrees", M.compassFromDegrees(0) === "N" && M.compassFromDegrees(315) === "NW" && M.compassFromDegrees(200) === "SSW" && M.compassFromDegrees(360) === "N"]);

checks.push(["area: precipitation kept", area.cells[8][0].precipMm === 2 && area.cells[0][0].precipMm === 0 && area.cells[8][0].snow === false]);
const g = [0, 10, 20, 30];   // 2 x 2
checks.push(["gridSample: corners, centre, clamped", M.gridSample(g, 2, 0, 0) === 0 && M.gridSample(g, 2, 1, 1) === 30
  && M.gridSample(g, 2, 0.5, 0.5) === 15 && M.gridSample(g, 2, -3, 9) === 20 && M.gridSample([null, 4, 4, 4], 2, 0, 0) === 0]);
const g3 = [0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // 5 x 5, one peak
checks.push(["gridSampleSmooth: hits grid values, smooth between, never negative, clamped", M.gridSampleSmooth(g3, 5, 2, 1) === 9
  && M.gridSampleSmooth(g3, 5, 0, 0) === 0 && M.gridSampleSmooth(g3, 5, -3, 9) === 0
  && M.gridSampleSmooth(g, 2, 0.5, 0.5) === 15
  && (function() { var min = 1e9; for (var i = 0; i <= 80; i++) for (var j = 0; j <= 80; j++) min = Math.min(min, M.gridSampleSmooth(g3, 5, i / 20, j / 20)); return min >= 0 })()]);
checks.push(["windColor: calm is green, strong is red, in between is yellow, clamped", (function() {
  var c = M.windColor(0), y = M.windColor(35), r = M.windColor(200), neg = M.windColor(-5), nan = M.windColor("x")
  return c[1] > c[0] && c[1] > c[2] && y[0] > 200 && y[1] > 150 && r[0] > 200 && r[1] < 60 && neg[1] === c[1] && nan[1] === c[1]
})()]);
const wv = M.windVector(10, 270);   // from the west -> blows east
const wn = M.windVector(10, 0);     // from the north -> blows south (screen down)
checks.push(["windVector: west wind blows east, north wind blows down-screen", Math.abs(wv.x - 10) < 1e-9 && Math.abs(wv.y) < 1e-9 && Math.abs(wn.y - 10) < 1e-9]);
checks.push(["radarColor: dry clear, pale blue, heavy red, snow violet", M.radarColor(0, 0)[3] === 0 && M.radarColor(0.1, 0)[2] === 240
  && M.radarColor(40, 0)[0] === 220 && M.radarColor(1, 1)[2] === 245 && M.radarColor(2, 0)[3] > M.radarColor(1, 0)[3]]);
const rvIdx = { version: "2.0", host: M.RADAR_HOST, radar: { past: [
  { time: 1793690400, path: "/v2/radar/56c434a943f6" }, { time: 1793683800, path: "/v2/radar/24c494bda066" },
  { time: 1793691000, path: "/v2/radar/../../etc" }, { time: "x", path: "/v2/radar/abcdef" }], nowcast: [] } };
const rv = M.parseRadarFrames(JSON.stringify(rvIdx));
checks.push(["radar index: valid frames only, oldest first, ms", rv && rv.length === 2 && rv[0].id === "24c494bda066" && rv[1].time === 1793690400000]);
checks.push(["radar index: wrong host / junk rejected", M.parseRadarFrames(JSON.stringify(Object.assign({}, rvIdx, { host: "https://evil.example" }))) === null
  && M.parseRadarFrames("{") === null]);
const rt = M.mapTiles(38.72, -9.14, 241, 500, 512, 7);
checks.push(["radar tiles: zoom 7, 512 px, cover the box", rt.zoom === 7 && rt.tiles.every(t => t.z === 7)
  && Math.min(...rt.tiles.map(t => t.left)) <= 0 && Math.max(...rt.tiles.map(t => t.left + t.size)) >= 500]);
checks.push(["radarTileKey: id and zoom checked", M.radarTileKey("56c434a943f6", { z: 7, x: 60, y: 49 }) === "56c434a943f6/7/60/49"
  && M.radarTileKey("../x", { z: 7, x: 1, y: 1 }) === "" && M.radarTileKey("abcdef", { z: 8, x: 1, y: 1 }) === ""]);

// City search
checks.push(["cityQuery: cleaned, 2-60 chars", M.cleanCityQuery("  Lis\u0000bon  ") === "Lis bon" && M.cleanCityQuery("x") === ""
  && M.cleanCityQuery("<b>") === "" && M.cleanCityQuery("a".repeat(90)).length === 60]);
const gu = M.geocodeUrl("São Paulo & co?x=1");
checks.push(["geocodeUrl: fixed host, query encoded, empty for junk", gu.startsWith("https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo%20%26%20co%3Fx%3D1&count=")
  && !/&x=1/.test(gu) && M.geocodeUrl(" ") === "" && M.geocodeUrl(null) === ""]);
const geo = M.parseGeocode(JSON.stringify({ results: [
  { name: "Lisbon", latitude: 38.71667, longitude: -9.13333, admin1: "Lisbon", country: "Portugal" },
  { name: "Lisbon", latitude: 44.03, longitude: -70.10, admin1: "Maine", country: "United States" },
  { name: "Bad", latitude: "38", longitude: -9 }, { name: "Far", latitude: 91, longitude: 0 }, { name: "", latitude: 1, longitude: 1 },
  { name: "<script>x</script>", latitude: 1, longitude: 2 }] }));
checks.push(["parseGeocode: valid entries only, labels, rounded", geo && geo.length === 3 && geo[0].label === "Lisbon, Portugal"
  && geo[1].label === "Lisbon, Maine, United States" && geo[0].latitude === 38.7167 && geo[2].name === "scriptx/script"]);
checks.push(["parseGeocode: no matches [], junk null, oversized null", Array.isArray(M.parseGeocode('{"generationtime_ms":0.2}'))
  && M.parseGeocode('{"generationtime_ms":0.2}').length === 0 && M.parseGeocode("[1]") === null && M.parseGeocode("{") === null
  && M.parseGeocode('{"results":5}') === null && M.parseGeocode(" ".repeat(M.GEOCODE_MAX_BYTES + 1)) === null
  && M.parseGeocode(JSON.stringify({ results: Array.from({ length: 20 }, (_, i) => ({ name: "P" + i, latitude: 1, longitude: 1 })) })).length === 6]);

// Notifications
{
  const now = new Date(2026, 10, 3, 8, 0);   // local time
  const all = M.notificationPlan(now, 38.72, -9.14, { golden: true, blue: true, mornings: true, moon: true, season: true, leadMin: 10,
    astroOpts: {}, nextFull: new Date(2026, 10, 24, 14, 53), nextNew: new Date(2026, 10, 9, 7, 2), seasonDate: new Date(2026, 11, 21, 20, 50) });
  const kinds = all.map(e => e.kind);
  const ge = all.find(e => e.kind === "goldenEvening");
  const full = all.find(e => e.kind === "fullMoon"), nw = all.find(e => e.kind === "newMoon");
  checks.push(["notify plan: sun events today and tomorrow, moon, season, sorted", kinds.filter(k => k === "goldenEvening").length === 2
    && kinds.filter(k => k === "blueMorning").length === 2 && kinds.includes("season")
    && all.every((e, i) => i === 0 || all[i - 1].fireAt <= e.fireAt) && ge.at - ge.fireAt === 600000]);
  checks.push(["notify plan: day events at 09:00, or 18:00 the evening before a morning event", full.fireAt.getHours() === 9 && full.fireAt.getDate() === 24
    && nw.fireAt.getHours() === 18 && nw.fireAt.getDate() === 8 && M.dayEventFireAt(new Date(2026, 0, 1, 3, 0)).getFullYear() === 2025]);
  const evOnly = M.notificationPlan(now, 38.72, -9.14, { golden: true, leadMin: 0 });
  checks.push(["notify plan: evenings only unless mornings, nothing when all off", evOnly.length === 2 && evOnly.every(e => e.kind === "goldenEvening")
    && M.notificationPlan(now, 38.72, -9.14, {}).length === 0 && M.notificationPlan(now, 89.9, 0, { golden: true, blue: true }).every(e => isFinite(e.at.getTime()))]);
  const e0 = evOnly[0];
  checks.push(["due: inside the grace window once, lead 0 works, late or sent dropped",
    M.dueNotifications(evOnly, new Date(e0.fireAt.getTime() + 30000), {}).length === 1
    && M.dueNotifications(evOnly, new Date(e0.fireAt.getTime() - 1000), {}).length === 0
    && M.dueNotifications(evOnly, new Date(e0.fireAt.getTime() + 600000), {}).length === 0
    && M.dueNotifications(evOnly, new Date(e0.fireAt.getTime() + 30000), { [e0.id]: true }).length === 0]);
  const led = evOnly.map(e => Object.assign({}, e, { fireAt: new Date(e.at.getTime() - 600000) }));
  const ar = (ms) => M.activeReminders(led, new Date(e0.at.getTime() + ms));
  const mp = [{ id: "m", kind: "fullMoon", at: new Date(2026, 10, 24, 9, 53), fireAt: new Date(2026, 10, 23, 18, 0) }];
  checks.push(["activeReminders: from fire to 15 min after (sun), 12 h after (moon), begun flag",
    ar(-60000).length === 1 && ar(-60000)[0].begun === false && ar(60000)[0].begun === true && ar(16 * 60000).length === 0
    && M.activeReminders(led, new Date(e0.at.getTime() - 600001)).length === 0
    && M.activeReminders(mp, new Date(2026, 10, 23, 17, 59)).length === 0 && M.activeReminders(mp, new Date(2026, 10, 23, 20, 0)).length === 1
    && M.activeReminders(mp, new Date(2026, 10, 24, 21, 0)).length === 1 && M.activeReminders(mp, new Date(2026, 10, 24, 22, 0)).length === 0]);
}

for (const [label, ok] of checks) { if (!ok) { failed++; console.log("FAIL " + label); } else if (process.argv.includes("--verbose")) console.log("ok   " + label); }
console.log(`Options: ${checks.filter(c => c[1]).length}/${checks.length} checks pass`);
process.exit(failed ? 1 : 0);
