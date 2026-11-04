.pragma library

// ============================================================================
// Heliolune astronomical engine: Sun, Moon & seasons (offline NOAA + Jean Meeus algorithms)
// ============================================================================

var DEG2RAD = Math.PI / 180.0
var RAD2DEG = 180.0 / Math.PI
var DAY_MS = 86400000.0
var J1970 = 2440587.5
var J2000 = 2451545.0
var SYNODIC_MONTH = 29.530588853

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function normDeg(deg) {
  var d = deg % 360.0
  return d < 0 ? d + 360.0 : d
}

function normRad(rad) {
  var twoPi = Math.PI * 2.0
  var r = rad % twoPi
  return r < 0 ? r + twoPi : r
}

function toJulian(date) {
  return date.getTime() / DAY_MS + J1970
}

function fromJulian(j) {
  return new Date((j - J1970) * DAY_MS)
}

function toDays(date) {
  return toJulian(date) - J2000
}

// Neutralize any untrusted string before display
function sanitizeText(raw, maxLen) {
  var limit = maxLen || 120
  var s = String(raw === undefined || raw === null ? "" : raw)
  s = s.replace(/[\x00-\x1F\x7F]/g, " ")
  s = s.replace(/[<>]/g, "")
  s = s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "")
  if (s.length > limit) s = s.slice(0, limit)
  return s
}

// Parse ~/.local/state/omarchy/settings/weather.json or geo.omarchy.org response
function parseLocationFile(raw) {
  var unset = { name: "", latitude: null, longitude: null }
  if (!raw) return unset
  var text = String(raw)
  if (text.length > 65536) return unset
  try {
    var data = JSON.parse(text)
    if (!data || typeof data !== "object") return unset
    var lat = parseFloat(data.latitude)
    var lon = parseFloat(data.longitude)
    var validCoords = !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    var fetchedAt = parseFloat(data.fetchedAt)
    return {
      name: sanitizeText(data.name || data.city || "", 80),
      latitude: validCoords ? lat : null,
      longitude: validCoords ? lon : null,
      fetchedAt: isNaN(fetchedAt) ? 0 : fetchedAt
    }
  } catch (e) {
    return unset
  }
}

// Convert an ISO 6709 component from zone1970.tab (e.g. "+4042", "-07400", "+404251") to decimal degrees
function parseIso6709Part(part, degDigits) {
  var m = /^([+-])(\d+)$/.exec(part)
  if (!m) return NaN
  var digits = m[2]
  var deg = parseInt(digits.slice(0, degDigits), 10)
  var min = parseInt(digits.slice(degDigits, degDigits + 2) || "0", 10)
  var sec = parseInt(digits.slice(degDigits + 2, degDigits + 4) || "0", 10)
  var val = deg + min / 60.0 + sec / 3600.0
  return m[1] === "-" ? -val : val
}

// Extract the IANA zone name from an /etc/localtime symlink target
function timezoneFromLocaltimeLink(raw) {
  var text = sanitizeText(raw, 200)
  var idx = text.indexOf("zoneinfo/")
  if (idx < 0) return ""
  var name = text.slice(idx + "zoneinfo/".length)
  name = name.replace(/^(posix|right)\//, "")
  return /^[A-Za-z0-9_+\-\/]+$/.test(name) ? name : ""
}

// Look up the representative city coordinates of an IANA zone in zone1970.tab / zone.tab
function parseZoneTab(raw, tzName) {
  var unset = { name: "", latitude: null, longitude: null }
  if (!raw || !tzName) return unset
  var text = String(raw)
  if (text.length > 262144) return unset
  var lines = text.split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (!line || line.charAt(0) === "#") continue
    var cols = line.split("\t")
    if (cols.length < 3 || cols[2] !== tzName) continue
    var m = /^([+-]\d{4,6})([+-]\d{5,7})$/.exec(cols[1])
    if (!m) return unset
    var lat = parseIso6709Part(m[1], 2)
    var lon = parseIso6709Part(m[2], 3)
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return unset
    var city = tzName.split("/").pop().replace(/_/g, " ")
    return { name: sanitizeText(city, 80), latitude: lat, longitude: lon }
  }
  return unset
}

// Resolve effective coordinates: manual settings -> weather.json -> IP geo -> timezone database -> UTC-offset estimate
function resolveLocation(settings, weatherLoc, detectedLoc, timezoneLoc) {
  var s = settings || {}
  var manualLat = parseFloat(s.latitude)
  var manualLon = parseFloat(s.longitude)
  var manualName = sanitizeText(s.locationName || "", 80)

  if (!isNaN(manualLat) && !isNaN(manualLon) && manualLat >= -90 && manualLat <= 90 && manualLon >= -180 && manualLon <= 180 && String(s.latitude).trim() !== "" && String(s.longitude).trim() !== "") {
    return {
      name: manualName || (manualLat.toFixed(2) + "°, " + manualLon.toFixed(2) + "°"),
      latitude: manualLat,
      longitude: manualLon,
      source: "manual"
    }
  }

  if (weatherLoc && weatherLoc.latitude !== null && weatherLoc.longitude !== null) {
    return {
      name: weatherLoc.name || (weatherLoc.latitude.toFixed(2) + "°, " + weatherLoc.longitude.toFixed(2) + "°"),
      latitude: weatherLoc.latitude,
      longitude: weatherLoc.longitude,
      source: "weather"
    }
  }

  if (detectedLoc && detectedLoc.latitude !== null && detectedLoc.longitude !== null) {
    return {
      name: detectedLoc.name || (detectedLoc.latitude.toFixed(2) + "°, " + detectedLoc.longitude.toFixed(2) + "°"),
      latitude: detectedLoc.latitude,
      longitude: detectedLoc.longitude,
      source: "geo"
    }
  }

  if (timezoneLoc && timezoneLoc.latitude !== null && timezoneLoc.longitude !== null) {
    return {
      name: manualName || timezoneLoc.name || (timezoneLoc.latitude.toFixed(2) + "°, " + timezoneLoc.longitude.toFixed(2) + "°"),
      latitude: timezoneLoc.latitude,
      longitude: timezoneLoc.longitude,
      source: "timezone"
    }
  }

  // Last-resort offline estimate from the UTC offset (latitude unknown)
  var now = new Date()
  var tzOffsetHours = -now.getTimezoneOffset() / 60.0
  var approxLon = clamp(tzOffsetHours * 15.0, -180.0, 180.0)
  var approxLat = 40.0
  return {
    name: manualName || (weatherLoc && weatherLoc.name ? weatherLoc.name : "Local Sky"),
    latitude: approxLat,
    longitude: approxLon,
    source: "fallback"
  }
}

// ============================================================================
// Solar Coordinates & Position
// ============================================================================

function sunCoords(d) {
  var T = centuriesTT(dateFromDays(d))
  var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  var Mdeg = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  var M = Mdeg * DEG2RAD
  var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M)
  var nut = nutationObliquity(T)
  // apparent longitude: true longitude + nutation - aberration
  var L = normDeg(L0 + C + nut.dPsi - 0.00569) * DEG2RAD
  var eq = eclipticToEquatorial(L, 0, nut.eps)
  return { dec: eq.dec, ra: eq.ra, L: L, M: M }
}

// Greenwich mean sidereal time (IAU 1982, UT-based) minus west longitude, radians
function siderealTime(d, lw) {
  return (280.46061837 + 360.98564736629 * d) * DEG2RAD - lw
}

// Delta T (TT - UT), seconds: smooth fit good to ~1 s for 2000-2050
function deltaTSeconds(date) {
  var y = date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12.0
  return 69.0 + 0.3 * (y - 2025.0)
}

// Julian centuries of Terrestrial Time since J2000.0
function centuriesTT(date) {
  return (toJulian(date) + deltaTSeconds(date) / 86400.0 - J2000) / 36525.0
}

function dateFromDays(d) { return fromJulian(d + J2000) }

// Nutation in longitude and true obliquity (low precision, Meeus ch. 22)
function nutationObliquity(T) {
  var omega = (125.04452 - 1934.136261 * T) * DEG2RAD
  var Ls = (280.4665 + 36000.7698 * T) * DEG2RAD
  var Lm = (218.3165 + 481267.8813 * T) * DEG2RAD
  var dPsi = (-17.20 * Math.sin(omega) - 1.32 * Math.sin(2 * Ls) - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * omega)) / 3600.0
  var dEps = (9.20 * Math.cos(omega) + 0.57 * Math.cos(2 * Ls) + 0.10 * Math.cos(2 * Lm) - 0.09 * Math.cos(2 * omega)) / 3600.0
  var eps0 = 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T
  return { dPsi: dPsi, eps: (eps0 + dEps) * DEG2RAD }
}

function eclipticToEquatorial(lambda, beta, eps) {
  return {
    ra: Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda)),
    dec: Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda))
  }
}

function getSunPosition(date, lat, lon) {
  var lw = -lon * DEG2RAD
  var phi = lat * DEG2RAD
  var d = toDays(date)
  var c = sunCoords(d)
  var H = siderealTime(d, lw) - c.ra

  var alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H))
  var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + Math.PI

  return {
    altitude: alt * RAD2DEG,
    azimuth: normDeg(az * RAD2DEG),
    declination: c.dec * RAD2DEG
  }
}

// ============================================================================
// Daily Solar Events (Sunrise, Sunset, Dawn, Dusk, Golden Hour, Solar Noon)
// ============================================================================

function hourAngle(h, phi, d) {
  var cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))
  if (cosH > 1.0 || cosH < -1.0) return NaN
  return Math.acos(cosH)
}

// Sun's hour angle (wrapped to [-pi, pi]) and declination at an instant
function sunHourAngle(date, lon) {
  var d = toDays(date)
  var c = sunCoords(d)
  var H = siderealTime(d, -Number(lon) * DEG2RAD) - c.ra
  return { H: Math.atan2(Math.sin(H), Math.cos(H)), dec: c.dec }
}

var SIDEREAL_RATE = 2.0 * Math.PI * 1.00273790935   // radians of hour angle per day

// Solar transit (true noon) nearest local mean noon of the given local calendar date
function solarTransitFor(date, lon) {
  var t = meanNoonFor(date.getFullYear(), date.getMonth(), date.getDate(), lon).getTime()
  for (var i = 0; i < 4; i++) {
    t -= sunHourAngle(new Date(t), lon).H / SIDEREAL_RATE * DAY_MS
  }
  return new Date(t)
}

// Time the Sun's centre reaches altitude hDeg before (rising) or after transit,
// re-evaluating the Sun's position at each estimate. null if it never does.
function sunAltitudeEvent(transit, hDeg, lat, lon, rising) {
  var phi = Number(lat) * DEG2RAD
  var h = hDeg * DEG2RAD
  var t = transit.getTime()
  for (var i = 0; i < 5; i++) {
    var a = sunHourAngle(new Date(t), lon)
    var w = hourAngle(h, phi, a.dec)
    if (isNaN(w)) return null
    var dH = (rising ? -w : w) - a.H
    dH = Math.atan2(Math.sin(dH), Math.cos(dH))
    t += dH / SIDEREAL_RATE * DAY_MS
  }
  return new Date(t)
}

// ---- User options shared by the sun and moon calculations (all optional;
// without them the standard definitions apply, as the accuracy suite tests).
//   elevation: observer height in metres (lowers the apparent horizon)
//   light:     "standard" | "photographer" | "extended" golden/blue-hour windows
var LIGHT_PRESETS = {
  standard:     { goldenLow: null, goldenHigh: 6,  blueLow: -6, blueHigh: -4 },   // golden: sunrise .. +6 deg
  photographer: { goldenLow: -4,   goldenHigh: 6,  blueLow: -6, blueHigh: -4 },
  extended:     { goldenLow: -4,   goldenHigh: 10, blueLow: -8, blueHigh: -4 }
}

// Dip of the sea-level horizon seen from height h metres, in degrees (1.76' x sqrt(h))
function horizonDip(elevationM) {
  var h = Math.max(0, Math.min(9000, Number(elevationM) || 0))
  return 1.76 * Math.sqrt(h) / 60.0
}

function resolveOptions(opts) {
  var o = opts || {}
  return { dip: horizonDip(o.elevation), light: LIGHT_PRESETS[o.light] || LIGHT_PRESETS.standard }
}

function getSunTimesForDay(date, lat, lon, opts) {
  var transit = solarTransitFor(date, lon)
  var op = resolveOptions(opts)

  function pairForAngle(angleDeg) {
    return {
      rise: sunAltitudeEvent(transit, angleDeg, lat, lon, true),
      set: sunAltitudeEvent(transit, angleDeg, lat, lon, false)
    }
  }

  var sunStd = pairForAngle(-0.833 - op.dip)          // Sunrise / Sunset (lower when observer is elevated)
  var blue = pairForAngle(op.light.blueHigh)          // Blue Hour inner boundary
  var blueOuter = pairForAngle(op.light.blueLow)      // Blue Hour outer boundary
  var civil = pairForAngle(-6.0)                      // Civil Dawn / Dusk
  var nautical = pairForAngle(-12.0)                  // Nautical Dawn / Dusk
  var astro = pairForAngle(-18.0)                     // Astronomical Dawn / Dusk
  var golden = pairForAngle(op.light.goldenHigh)      // Golden Hour end (morning) / start (evening)
  var goldenLow = op.light.goldenLow === null ? sunStd : pairForAngle(op.light.goldenLow)

  var dayLengthSeconds = 0
  var noonPosition = getSunPosition(transit, lat, lon)
  if (sunStd.rise && sunStd.set) {
    dayLengthSeconds = Math.max(0, Math.round((sunStd.set.getTime() - sunStd.rise.getTime()) / 1000))
  } else {
    dayLengthSeconds = noonPosition.altitude > 0 ? 86400 : 0
  }

  return {
    solarNoon: transit,
    nadir: new Date(transit.getTime() - DAY_MS / 2.0),
    sunrise: sunStd.rise,
    sunset: sunStd.set,
    dawn: civil.rise,
    dusk: civil.set,
    blueHourMorningStart: blueOuter.rise,
    blueHourMorningEnd: blue.rise,
    blueHourEveningStart: blue.set,
    blueHourEveningEnd: blueOuter.set,
    nauticalDawn: nautical.rise,
    nauticalDusk: nautical.set,
    astroDawn: astro.rise,
    astroDusk: astro.set,
    goldenHourEnd: golden.rise,
    goldenHourStart: golden.set,
    goldenMorningStart: goldenLow.rise,
    goldenEveningEnd: goldenLow.set,
    lightPreset: op.light,
    dayLengthSeconds: dayLengthSeconds,
    maxAltitude: noonPosition.altitude
  }
}

// Classify current solar phase & next milestone
function computeSolarSummary(now, lat, lon, opts) {
  var op = resolveOptions(opts)
  var today = getSunTimesForDay(now, lat, lon, opts)
  var yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0)
  var tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0)
  var yesterday = getSunTimesForDay(yesterdayDate, lat, lon, opts)
  var tomorrow = getSunTimesForDay(tomorrowDate, lat, lon, opts)

  var pos = getSunPosition(now, lat, lon)
  var dayDiffSec = today.dayLengthSeconds - yesterday.dayLengthSeconds

  var horizonAlt = -0.833 - op.dip
  var gLow = op.light.goldenLow === null ? horizonAlt : op.light.goldenLow
  var isDay = pos.altitude > horizonAlt
  var phaseKey = "night"
  var phaseName = "Night"
  var phaseIcon = "󰖔"

  var t = now.getTime()
  var sr = today.sunrise ? today.sunrise.getTime() : null
  var ss = today.sunset ? today.sunset.getTime() : null
  var sn = today.solarNoon ? today.solarNoon.getTime() : null
  var ghMorningEnd = today.goldenHourEnd ? today.goldenHourEnd.getTime() : null
  var ghEveningStart = today.goldenHourStart ? today.goldenHourStart.getTime() : null
  var bhMorningStart = today.blueHourMorningStart ? today.blueHourMorningStart.getTime() : null
  var bhMorningEnd = today.blueHourMorningEnd ? today.blueHourMorningEnd.getTime() : null
  var bhEveningStart = today.blueHourEveningStart ? today.blueHourEveningStart.getTime() : null
  var bhEveningEnd = today.blueHourEveningEnd ? today.blueHourEveningEnd.getTime() : null

  if (sr !== null && Math.abs(t - sr) <= 10 * 60000) {
    phaseKey = "sunrise"
    phaseName = "Sunrise"
    phaseIcon = "󰖜"
  } else if (ss !== null && Math.abs(t - ss) <= 10 * 60000) {
    phaseKey = "sunset"
    phaseName = "Sunset"
    phaseIcon = "󰖛"
  } else if ((bhMorningStart !== null && bhMorningEnd !== null && t >= bhMorningStart && t <= bhMorningEnd) ||
             (bhEveningStart !== null && bhEveningEnd !== null && t >= bhEveningStart && t <= bhEveningEnd) ||
             (pos.altitude <= op.light.blueHigh && pos.altitude >= op.light.blueLow)) {
    phaseKey = "blue_hour"
    phaseName = t < (sn || t) ? "Morning Blue Hour" : "Evening Blue Hour"
    phaseIcon = "󰖚"
  } else if (pos.altitude > horizonAlt) {
    if (sn !== null && Math.abs(t - sn) <= 25 * 60000) {
      phaseKey = "solar_noon"
      phaseName = "Solar Noon"
      phaseIcon = "󰖙"
    } else if ((ghMorningEnd !== null && t < ghMorningEnd) || (ghEveningStart !== null && t > ghEveningStart) || pos.altitude < op.light.goldenHigh) {
      phaseKey = "golden_hour"
      phaseName = t < (sn || t) ? "Morning Golden Hour" : "Evening Golden Hour"
      phaseIcon = "󰖨"
    } else if (sn !== null && t < sn) {
      phaseKey = "morning"
      phaseName = "Morning Sun"
      phaseIcon = "󰖙"
    } else {
      phaseKey = "afternoon"
      phaseName = "Afternoon Sun"
      phaseIcon = "󰖙"
    }
  } else if (pos.altitude > gLow) {
    // presets whose golden hour starts below the horizon (e.g. photographer's -4 deg)
    phaseKey = "golden_hour"
    phaseName = t < (sn || t) ? "Morning Golden Hour" : "Evening Golden Hour"
    phaseIcon = "󰖨"
  } else if (pos.altitude > -4.0) {
    phaseKey = t < (sn || t) ? "civil_dawn" : "civil_dusk"
    phaseName = t < (sn || t) ? "Civil Dawn" : "Civil Dusk"
    phaseIcon = t < (sn || t) ? "󰖜" : "󰖛"
  } else if (pos.altitude > -12.0) {
    phaseKey = t < (sn || t) ? "nautical_dawn" : "nautical_dusk"
    phaseName = t < (sn || t) ? "Nautical Dawn" : "Nautical Dusk"
    phaseIcon = "󰖔"
  } else if (pos.altitude > -18.0) {
    phaseKey = t < (sn || t) ? "astro_dawn" : "astro_dusk"
    phaseName = t < (sn || t) ? "First Light" : "Last Light"
    phaseIcon = "󰖔"
  } else {
    phaseKey = "night"
    phaseName = "Solar Night"
    phaseIcon = "󰖔"
  }

  // Determine next solar milestone chronologically
  var nextEventName = ""
  var nextEventTime = null
  var nextEventIcon = "󰖜"
  // Drawn icon kind, the same as the event's row in the popup timetable
  var nextEventKind = "sunrise"

  if (bhMorningStart !== null && t < bhMorningStart) {
    nextEventName = "Blue Hour"
    nextEventTime = today.blueHourMorningStart
    nextEventIcon = "󰖚"
    nextEventKind = "blueHour"
  } else if (sr !== null && t < sr) {
    nextEventName = "Sunrise"
    nextEventTime = today.sunrise
    nextEventIcon = "󰖜"
    nextEventKind = "sunrise"
  } else if (sn !== null && t < sn) {
    nextEventName = "Solar Noon"
    nextEventTime = today.solarNoon
    nextEventIcon = "󰖙"
    nextEventKind = "noon"
  } else if (ghEveningStart !== null && t < ghEveningStart) {
    nextEventName = "Golden Hour"
    nextEventTime = today.goldenHourStart
    nextEventIcon = "󰖨"
    nextEventKind = "goldenHour"
  } else if (ss !== null && t < ss) {
    nextEventName = "Sunset"
    nextEventTime = today.sunset
    nextEventIcon = "󰖛"
    nextEventKind = "sunset"
  } else if (bhEveningStart !== null && t < bhEveningStart) {
    nextEventName = "Blue Hour"
    nextEventTime = today.blueHourEveningStart
    nextEventIcon = "󰖚"
    nextEventKind = "blueHour"
  } else if (tomorrow.blueHourMorningStart) {
    nextEventName = "Blue Hour"
    nextEventTime = tomorrow.blueHourMorningStart
    nextEventIcon = "󰖚"
    nextEventKind = "blueHour"
  } else if (tomorrow.sunrise) {
    nextEventName = "Sunrise"
    nextEventTime = tomorrow.sunrise
    nextEventIcon = "󰖜"
    nextEventKind = "sunrise"
  }

  // Progress through current day (sunrise -> sunset) or night (sunset -> sunrise)
  var cycleProgress = 0.5
  var dayProgress = 0.0
  if (sr !== null && ss !== null && ss > sr) {
    dayProgress = clamp((t - sr) / (ss - sr), 0.0, 1.0)
    if (t >= sr && t <= ss) {
      cycleProgress = dayProgress
    } else if (t < sr && yesterday.sunset) {
      var prevSS = yesterday.sunset.getTime()
      cycleProgress = clamp((t - prevSS) / Math.max(1, sr - prevSS), 0.0, 1.0)
    } else if (t > ss && tomorrow.sunrise) {
      var nextSR = tomorrow.sunrise.getTime()
      cycleProgress = clamp((t - ss) / Math.max(1, nextSR - ss), 0.0, 1.0)
    }
  }

  // Active/upcoming Golden Hour window (Morning Golden Hour before noon, Evening Golden Hour after noon)
  var activeGoldenHourStart = today.goldenHourStart
  var activeGoldenHourEnd = today.goldenEveningEnd
  var activeGoldenHourIsMorning = false
  if (sn !== null && t < sn) {
    activeGoldenHourStart = today.goldenMorningStart
    activeGoldenHourEnd = today.goldenHourEnd
    activeGoldenHourIsMorning = true
  }

  return {
    isDay: isDay,
    isBlueHour: phaseKey === "blue_hour",
    phaseKey: phaseKey,
    phaseName: phaseName,
    phaseIcon: phaseIcon,
    altitude: pos.altitude,
    azimuth: pos.azimuth,
    compassDir: azimuthToCompass(pos.azimuth),
    maxAltitude: today.maxAltitude,
    sunrise: today.sunrise,
    sunset: today.sunset,
    solarNoon: today.solarNoon,
    dawn: today.dawn,
    dusk: today.dusk,
    blueHourMorningStart: today.blueHourMorningStart,
    blueHourMorningEnd: today.blueHourMorningEnd,
    blueHourEveningStart: today.blueHourEveningStart,
    blueHourEveningEnd: today.blueHourEveningEnd,
    goldenHourWindowStart: activeGoldenHourStart,
    goldenHourWindowEnd: activeGoldenHourEnd,
    goldenHourIsMorning: activeGoldenHourIsMorning,
    goldenHourEnd: today.goldenHourEnd,
    goldenHourStart: today.goldenHourStart,
    dayLengthSeconds: today.dayLengthSeconds,
    dayDiffSeconds: dayDiffSec,
    nextEventName: nextEventName,
    nextEventTime: nextEventTime,
    nextEventIcon: nextEventIcon,
    nextEventKind: nextEventKind,
    cycleProgress: cycleProgress,
    dayProgress: dayProgress
  }
}

// ============================================================================
// Lunar Position, Illumination, Phase & Upcoming Milestones (Meeus)
// ============================================================================

// [D, M, M', F, coefficient] rows of Meeus Tables 47.A (longitude, 1e-6 deg;
// distance, 1e-3 km) and 47.B (latitude, 1e-6 deg), main terms
var MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
]
var MOON_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833]
]

function moonCoords(d) {
  var T = centuriesTT(dateFromDays(d))
  var Lp = normDeg(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T)
  var D = normDeg(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T) * DEG2RAD
  var M = normDeg(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) * DEG2RAD
  var Mp = normDeg(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T) * DEG2RAD
  var F = normDeg(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T) * DEG2RAD
  var E = 1 - 0.002516 * T - 0.0000074 * T * T
  var A1 = (119.75 + 131.849 * T) * DEG2RAD
  var A2 = (53.09 + 479264.290 * T) * DEG2RAD
  var A3 = (313.45 + 481266.484 * T) * DEG2RAD

  var sl = 0, sr = 0, sb = 0
  for (var i = 0; i < MOON_LR.length; i++) {
    var t = MOON_LR[i]
    var arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F
    var e = Math.abs(t[1]) === 1 ? E : (Math.abs(t[1]) === 2 ? E * E : 1)
    sl += t[4] * e * Math.sin(arg)
    sr += t[5] * e * Math.cos(arg)
  }
  for (var j = 0; j < MOON_B.length; j++) {
    var u = MOON_B[j]
    var argb = u[0] * D + u[1] * M + u[2] * Mp + u[3] * F
    var eb = Math.abs(u[1]) === 1 ? E : (Math.abs(u[1]) === 2 ? E * E : 1)
    sb += u[4] * eb * Math.sin(argb)
  }
  var LpR = Lp * DEG2RAD
  sl += 3958 * Math.sin(A1) + 1962 * Math.sin(LpR - F) + 318 * Math.sin(A2)
  sb += -2235 * Math.sin(LpR) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F) + 175 * Math.sin(A1 + F)
    + 127 * Math.sin(LpR - Mp) - 115 * Math.sin(LpR + Mp)

  var nut = nutationObliquity(T)
  var lonDeg = normDeg(Lp + sl / 1e6 + nut.dPsi)   // apparent longitude
  var l = lonDeg * DEG2RAD
  var b = (sb / 1e6) * DEG2RAD
  var eq = eclipticToEquatorial(l, b, nut.eps)
  return { ra: eq.ra, dec: eq.dec, dist: 385000.56 + sr / 1000.0, lonDeg: lonDeg }
}

function getMoonPosition(date, lat, lon) {
  var lw = -lon * DEG2RAD
  var phi = lat * DEG2RAD
  var d = toDays(date)
  var c = moonCoords(d)
  var H = siderealTime(d, lw) - c.ra
  var hGeo = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H))
  // Horizontal parallax: the Moon sits ~1 degree lower for an observer on the surface
  var parallax = Math.asin(6378.14 / c.dist)
  var h = hGeo - parallax * Math.cos(hGeo)
  var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + Math.PI

  return {
    altitude: h * RAD2DEG,          // topocentric, airless
    geoAltitude: hGeo * RAD2DEG,    // geocentric
    parallaxDeg: parallax * RAD2DEG,
    azimuth: normDeg(az * RAD2DEG),
    distanceKm: Math.round(c.dist),
    eclipticLon: c.lonDeg
  }
}

// Moonrise / moonset within the local calendar day of `date` (00:00 to 24:00).
// The Moon's upper limb touches the horizon when its geocentric altitude is
// 0.7275 x parallax - 0.5667 deg (parallax, refraction and semi-diameter; Meeus 15.1).
// Scans in 2-hour windows and fits a parabola through three samples per window.
function moonRiseSetTarget(date, lat, lon, dip) {
  var p = getMoonPosition(date, lat, lon)
  return p.geoAltitude - (0.7275 * p.parallaxDeg - 0.5667 - (dip || 0))
}

function getMoonTimes(date, lat, lon, opts) {
  var dip = resolveOptions(opts).dip
  var t0 = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime()
  var t1 = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime()
  var hours = (t1 - t0) / 3600000.0   // 23/24/25 on DST days
  function f(h) { return moonRiseSetTarget(new Date(t0 + h * 3600000.0), lat, lon, dip) }

  // Every crossing in the day: at high latitudes the Moon can rise (or set) twice
  var rises = [], sets = []
  var h0 = f(0)
  var start = h0
  for (var i = 1; i <= hours; i += 2) {
    var h1 = f(i), h2 = f(Math.min(i + 1, hours))
    var a = (h0 + h2) / 2.0 - h1
    var b = (h2 - h0) / 2.0
    var xe = -b / (2.0 * a)
    var ye = (a * xe + b) * xe + h1
    var d = b * b - 4.0 * a * h1
    var roots = 0, x1 = 0, x2 = 0
    if (d >= 0) {
      var dx = Math.sqrt(d) / (Math.abs(a) * 2.0)
      x1 = xe - dx
      x2 = xe + dx
      if (Math.abs(x1) <= 1) roots++
      if (Math.abs(x2) <= 1) roots++
      if (x1 < -1) x1 = x2
    }
    if (roots === 1) {
      if (h0 < 0) rises.push(i + x1)
      else sets.push(i + x1)
    } else if (roots === 2) {
      rises.push(i + (ye < 0 ? x2 : x1))
      sets.push(i + (ye < 0 ? x1 : x2))
    }
    h0 = h2
  }

  function at(list) {
    var out = []
    for (var k = 0; k < list.length; k++) if (list[k] >= 0 && list[k] <= hours) out.push(new Date(t0 + list[k] * 3600000.0))
    out.sort(function(p, q) { return p.getTime() - q.getTime() })
    return out
  }
  var r = at(rises), s = at(sets)
  var none = r.length === 0 && s.length === 0
  return {
    rise: r.length ? r[0] : null,
    set: s.length ? s[0] : null,
    rises: r,
    sets: s,
    alwaysUp: none && start > 0,
    alwaysDown: none && start <= 0
  }
}

// Next moonrise and moonset strictly after `now`, looking up to 3 local days ahead.
function getNextMoonEvents(now, lat, lon, opts) {
  var t = now.getTime()
  var nextRise = null, nextSet = null
  for (var k = 0; k < 3 && (nextRise === null || nextSet === null); k++) {
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 12, 0, 0, 0)
    var mt = getMoonTimes(day, lat, lon, opts)
    for (var a = 0; a < mt.rises.length && nextRise === null; a++) if (mt.rises[a].getTime() > t) nextRise = mt.rises[a]
    for (var b = 0; b < mt.sets.length && nextSet === null; b++) if (mt.sets[b].getTime() > t) nextSet = mt.sets[b]
  }
  return { nextRise: nextRise, nextSet: nextSet }
}

// Accurate lunar phase fraction [0..1), illumination [0..1], and age in days
function getMoonIllumination(date) {
  var d = toDays(date)
  var s = sunCoords(d)
  var m = moonCoords(d)

  var sdist = 149598000.0
  var phi = Math.acos(clamp(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra),
    -1.0, 1.0
  ))
  var inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi))
  var angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  )

  var fraction = (1.0 + Math.cos(inc)) / 2.0
  var phase = 0.5 + 0.5 * inc * (angle < 0 ? -1.0 : 1.0) / Math.PI
  phase = ((phase % 1.0) + 1.0) % 1.0

  var ageDays = phase * SYNODIC_MONTH
  return {
    fraction: clamp(fraction, 0.0, 1.0),
    phase: phase,
    ageDays: ageDays,
    angle: angle,
    distanceKm: Math.round(m.dist),
    eclipticLon: m.lonDeg
  }
}

function phaseInfoFromValue(phase) {
  var p = ((phase % 1.0) + 1.0) % 1.0
  // 8 canonical phases with Nerd Font glyphs and Unicode symbols
  if (p < 0.033 || p >= 0.967) {
    return { index: 0, key: "new_moon", name: "New Moon", shortName: "New", icon: "󰽤", unicode: "🌑", waxing: true }
  }
  if (p < 0.217) {
    return { index: 1, key: "waxing_crescent", name: "Waxing Crescent", shortName: "Wax Cres", icon: "󰽧", unicode: "🌒", waxing: true }
  }
  if (p < 0.283) {
    return { index: 2, key: "first_quarter", name: "First Quarter", shortName: "1st Qtr", icon: "󰽡", unicode: "🌓", waxing: true }
  }
  if (p < 0.467) {
    return { index: 3, key: "waxing_gibbous", name: "Waxing Gibbous", shortName: "Wax Gib", icon: "󰽨", unicode: "🌔", waxing: true }
  }
  if (p < 0.533) {
    return { index: 4, key: "full_moon", name: "Full Moon", shortName: "Full", icon: "󰽢", unicode: "🌕", waxing: false }
  }
  if (p < 0.717) {
    return { index: 5, key: "waning_gibbous", name: "Waning Gibbous", shortName: "Wan Gib", icon: "󰽦", unicode: "🌖", waxing: false }
  }
  if (p < 0.783) {
    return { index: 6, key: "last_quarter", name: "Last Quarter", shortName: "Last Qtr", icon: "󰽣", unicode: "🌗", waxing: false }
  }
  return { index: 7, key: "waning_crescent", name: "Waning Crescent", shortName: "Wan Cres", icon: "󰽥", unicode: "🌘", waxing: false }
}

// The Moon for `n` consecutive days from `now` (day 0 at the current time, the
// others at local noon). Days holding the exact moment of a new, first-quarter,
// full or last-quarter Moon carry `event` ("new" | "first" | "full" | "last").
function lunarDays(now, n) {
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  var end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
  var events = {}
  var targets = [[0.0, "new"], [0.25, "first"], [0.5, "full"], [0.75, "last"]]
  for (var k = 0; k < targets.length; k++) {
    var from = new Date(start.getTime() - DAY_MS)
    for (var guard = 0; guard < 4; guard++) {
      var at = findNextLunarPhaseDate(from, targets[k][0])
      if (at >= end) break
      if (at >= start) events[at.getFullYear() + "-" + at.getMonth() + "-" + at.getDate()] = { key: targets[k][1], at: at }
      from = new Date(at.getTime() + DAY_MS)
    }
  }
  var out = []
  for (var i = 0; i < n; i++) {
    var d = i === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12, 0, 0)
    var di = getMoonIllumination(d)
    var info = phaseInfoFromValue(di.phase)
    var ev = events[d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate()] || null
    out.push({
      date: d, dayOffset: i, phase: di.phase,
      illuminationPct: Math.round(di.fraction * 100),
      phaseName: info.name, shortName: info.shortName, icon: info.icon,
      event: ev ? ev.key : "", eventAt: ev ? ev.at : null
    })
  }
  return out
}

// The lunation `now` falls in: from the last new Moon to the next, with the
// quarters and the full Moon -> { start, end, events: [{ key, at }] }
// (events include the new Moons at both ends)
function lunarCycle(now) {
  var start = findNextLunarPhaseDate(new Date(now.getTime() - 31 * DAY_MS), 0.0)
  for (var guard = 0; guard < 3; guard++) {
    var following = findNextLunarPhaseDate(new Date(start.getTime() + DAY_MS), 0.0)
    if (following > now) break
    start = following
  }
  var end = findNextLunarPhaseDate(new Date(start.getTime() + DAY_MS), 0.0)
  var events = [{ key: "new", at: start }]
  var marks = [[0.25, "first"], [0.5, "full"], [0.75, "last"]]
  for (var k = 0; k < marks.length; k++) {
    events.push({ key: marks[k][1], at: findNextLunarPhaseDate(new Date(start.getTime() + DAY_MS), marks[k][0]) })
  }
  events.push({ key: "new", at: end })
  return { start: start, end: end, events: events }
}

// Moon visibility from the start of the current hour, every `stepMin` minutes
// (default 60) for `hours` hours: [{ t, h, moonAlt, moonAz, sunAlt, sunAz, up, visible }].
// Up uses the moonrise horizon (upper limb with refraction, about -0.8 deg for
// the Moon's centre), so "up" agrees with the moonrise time; visible = up with
// the Sun down (sunAlt < 0). Clouds are judged by the caller from the weather.
function moonVisibility(now, lat, lon, hours, stepMin) {
  var step = (stepMin || 60) * 60000
  var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
  var n = Math.round(hours * 3600000 / step)
  var out = []
  for (var i = 0; i < n; i++) {
    var t = new Date(t0.getTime() + i * step)
    var m = getMoonPosition(t, lat, lon)
    var sp = getSunPosition(t, lat, lon)
    var sAlt = sp.altitude
    var up = m.altitude > -0.8
    out.push({ t: t, h: t.getHours(), moonAlt: m.altitude, moonAz: m.azimuth, sunAlt: sAlt, sunAz: sp.azimuth, up: up, visible: up && sAlt < 0 })
  }
  return out
}

// First run of samples passing `ok(sample, index)` -> { from, to } (Dates; `to`
// is one step after the run's last sample) or null
function firstWindow(samples, ok) {
  for (var i = 0; i < samples.length; i++) {
    if (!ok(samples[i], i)) continue
    var j = i
    while (j + 1 < samples.length && ok(samples[j + 1], j + 1)) j++
    var stepMs = samples.length > 1 ? samples[1].t.getTime() - samples[0].t.getTime() : 3600000
    return { from: samples[i].t, to: new Date(samples[j].t.getTime() + stepMs), endsInside: j + 1 < samples.length }
  }
  return null
}

function zodiacFromLongitude(lonDeg) {
  var signs = [
    { name: "Aries",       symbol: "♈\uFE0E" },
    { name: "Taurus",      symbol: "♉\uFE0E" },
    { name: "Gemini",      symbol: "♊\uFE0E" },
    { name: "Cancer",      symbol: "♋\uFE0E" },
    { name: "Leo",         symbol: "♌\uFE0E" },
    { name: "Virgo",       symbol: "♍\uFE0E" },
    { name: "Libra",       symbol: "♎\uFE0E" },
    { name: "Scorpio",     symbol: "♏\uFE0E" },
    { name: "Sagittarius", symbol: "♐\uFE0E" },
    { name: "Capricorn",   symbol: "♑\uFE0E" },
    { name: "Aquarius",    symbol: "♒\uFE0E" },
    { name: "Pisces",      symbol: "♓\uFE0E" }
  ]
  var idx = Math.floor(normDeg(lonDeg) / 30.0) % 12
  return signs[idx]
}

// Find exact timestamp of next target phase (0.0 = New Moon, 0.5 = Full Moon)
// Phase fraction by apparent longitude difference: 0 new, .25 first quarter, .5 full, .75 last
function lunarElongationFraction(date) {
  var d = toDays(date)
  return normDeg(moonCoords(d).lonDeg - sunCoords(d).L * RAD2DEG) / 360.0
}

function findNextLunarPhaseDate(now, targetPhase) {
  var current = lunarElongationFraction(now)
  var diff = targetPhase - current
  if (diff <= 0.005) diff += 1.0
  var estMs = now.getTime() + diff * SYNODIC_MONTH * DAY_MS
  // Newton steps on elongation (~12.19 deg/day mean rate); converges to < 1 s
  for (var i = 0; i < 6; i++) {
    var delta = targetPhase - lunarElongationFraction(new Date(estMs))
    if (delta > 0.5) delta -= 1.0
    if (delta < -0.5) delta += 1.0
    estMs += delta * SYNODIC_MONTH * DAY_MS
    if (Math.abs(delta) * SYNODIC_MONTH * DAY_MS < 500) break
  }
  return new Date(estMs)
}

function computeLunarSummary(now, lat, lon, opts) {
  var illum = getMoonIllumination(now)
  var pos = getMoonPosition(now, lat, lon)
  var todayMoon = getMoonTimes(now, lat, lon, opts)
  var nextMoon = getNextMoonEvents(now, lat, lon, opts)
  var info = phaseInfoFromValue(illum.phase)
  var zodiac = zodiacFromLongitude(illum.eclipticLon)

  var nextFull = findNextLunarPhaseDate(now, 0.5)
  var nextNew = findNextLunarPhaseDate(now, 0.0)
  var nextFirstQ = findNextLunarPhaseDate(now, 0.25)
  var nextLastQ = findNextLunarPhaseDate(now, 0.75)
  var useFirstQ = nextFirstQ.getTime() <= nextLastQ.getTime()
  var nextQuarter = useFirstQ ? nextFirstQ : nextLastQ

  var daysToFull = Math.max(0, (nextFull.getTime() - now.getTime()) / DAY_MS)
  var daysToNew = Math.max(0, (nextNew.getTime() - now.getTime()) / DAY_MS)
  var daysToQuarter = Math.max(0, (nextQuarter.getTime() - now.getTime()) / DAY_MS)

  // 7-day forecast strip starting from today (index 0 uses exact current time)
  var forecast = []
  for (var i = 0; i < 7; i++) {
    var d = i === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12, 0, 0)
    var di = getMoonIllumination(d)
    var pInfo = phaseInfoFromValue(di.phase)
    forecast.push({
      date: d,
      dayOffset: i,
      phase: di.phase,
      illuminationPct: Math.round(di.fraction * 100),
      phaseName: pInfo.name,
      shortName: pInfo.shortName,
      icon: pInfo.icon
    })
  }

  return {
    phase: illum.phase,
    fraction: illum.fraction,
    illuminationPct: Math.round(illum.fraction * 100),
    ageDays: illum.ageDays,
    phaseKey: info.key,
    phaseName: info.name,
    shortName: info.shortName,
    phaseIcon: info.icon,
    unicodeIcon: info.unicode,
    waxing: illum.phase < 0.5,
    altitude: pos.altitude,
    azimuth: pos.azimuth,
    compassDir: azimuthToCompass(pos.azimuth),
    isAboveHorizon: pos.altitude > 0,
    moonrisesToday: todayMoon.rises,
    moonsetsToday: todayMoon.sets,
    moonAlwaysUp: todayMoon.alwaysUp,
    moonAlwaysDown: todayMoon.alwaysDown,
    nextMoonrise: nextMoon.nextRise,
    nextMoonset: nextMoon.nextSet,
    distanceKm: illum.distanceKm,
    zodiacName: zodiac.name,
    zodiacSymbol: zodiac.symbol,
    nextFullDate: nextFull,
    nextNewDate: nextNew,
    nextQuarterDate: nextQuarter,
    nextQuarterIsFirst: useFirstQ,
    daysToFull: daysToFull,
    daysToNew: daysToNew,
    daysToQuarter: daysToQuarter,
    forecast: forecast
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function azimuthToCompass(azDeg) {
  var dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  var idx = Math.round(normDeg(azDeg) / 22.5) % 16
  return dirs[idx]
}

function formatTime(date, timeFormatSetting, localeObj) {
  if (!date || isNaN(date.getTime())) return "—"
  var mode = String(timeFormatSetting || "auto").toLowerCase()
  var use12 = false
  if (mode === "12" || mode === "12h") {
    use12 = true
  } else if (mode === "24" || mode === "24h") {
    use12 = false
  } else if (localeObj && typeof localeObj.timeFormat === "function") {
    var fmt = String(localeObj.timeFormat(0) || "")
    use12 = fmt.toLowerCase().indexOf("ap") !== -1 || fmt.toLowerCase().indexOf("a") !== -1
  } else {
    use12 = true
  }

  var h = date.getHours()
  var m = date.getMinutes()
  var mm = m < 10 ? "0" + m : String(m)
  if (use12) {
    var suffix = h >= 12 ? "PM" : "AM"
    var h12 = h % 12
    if (h12 === 0) h12 = 12
    return h12 + ":" + mm + " " + suffix
  }
  var hh = h < 10 ? "0" + h : String(h)
  return hh + ":" + mm
}

function formatTimeRange(startDate, endDate, timeFormatSetting, localeObj) {
  if (!startDate || isNaN(startDate.getTime())) return formatTime(endDate, timeFormatSetting, localeObj)
  if (!endDate || isNaN(endDate.getTime())) return formatTime(startDate, timeFormatSetting, localeObj)

  var mode = String(timeFormatSetting || "auto").toLowerCase()
  var use12 = false
  if (mode === "12" || mode === "12h") {
    use12 = true
  } else if (mode === "24" || mode === "24h") {
    use12 = false
  } else if (localeObj && typeof localeObj.timeFormat === "function") {
    var fmt = String(localeObj.timeFormat(0) || "")
    use12 = fmt.toLowerCase().indexOf("ap") !== -1 || fmt.toLowerCase().indexOf("a") !== -1
  } else {
    use12 = true
  }

  var h1 = startDate.getHours()
  var m1 = startDate.getMinutes()
  var mm1 = m1 < 10 ? "0" + m1 : String(m1)

  var h2 = endDate.getHours()
  var m2 = endDate.getMinutes()
  var mm2 = m2 < 10 ? "0" + m2 : String(m2)

  if (use12) {
    var suf1 = h1 >= 12 ? "PM" : "AM"
    var suf2 = h2 >= 12 ? "PM" : "AM"
    var hr1 = h1 % 12 || 12
    var hr2 = h2 % 12 || 12
    if (suf1 === suf2) {
      return hr1 + ":" + mm1 + "–" + hr2 + ":" + mm2 + " " + suf2
    }
    return hr1 + ":" + mm1 + " " + suf1 + "–" + hr2 + ":" + mm2 + " " + suf2
  }

  var hh1 = h1 < 10 ? "0" + h1 : String(h1)
  var hh2 = h2 < 10 ? "0" + h2 : String(h2)
  return hh1 + ":" + mm1 + "–" + hh2 + ":" + mm2
}

function formatDurationHm(totalSeconds) {
  var sec = Math.max(0, Math.round(totalSeconds || 0))
  var h = Math.floor(sec / 3600)
  var m = Math.floor((sec % 3600) / 60)
  return h + "h " + (m < 10 ? "0" + m : m) + "m"
}

function formatDaylightDiff(diffSeconds) {
  var sec = Math.round(diffSeconds || 0)
  var sign = sec >= 0 ? "+" : "−"
  var abs = Math.abs(sec)
  var m = Math.floor(abs / 60)
  var s = abs % 60
  if (m === 0) return sign + s + "s"
  return sign + m + "m " + (s < 10 ? "0" + s : s) + "s"
}

// ============================================================================
// Equinoxes & Solstices (Meeus, Astronomical Algorithms ch. 27; ~1 min accuracy)
// ============================================================================

var SEASON_TERMS = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186],
  [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443],
  [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513],
  [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417],
  [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029],
  [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756],
  [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074]
]

// kind: 0 = March equinox, 1 = June solstice, 2 = September equinox, 3 = December solstice
function seasonEventDate(year, kind) {
  var Y = (year - 2000) / 1000.0
  var jde0
  if (kind === 0) jde0 = 2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y * Y * Y - 0.00057 * Y * Y * Y * Y
  else if (kind === 1) jde0 = 2451716.56767 + 365241.62603 * Y + 0.00325 * Y * Y + 0.00888 * Y * Y * Y - 0.00030 * Y * Y * Y * Y
  else if (kind === 2) jde0 = 2451810.21715 + 365242.01767 * Y - 0.11575 * Y * Y + 0.00337 * Y * Y * Y + 0.00078 * Y * Y * Y * Y
  else jde0 = 2451900.05952 + 365242.74049 * Y - 0.06223 * Y * Y - 0.00823 * Y * Y * Y + 0.00032 * Y * Y * Y * Y

  var T = (jde0 - J2000) / 36525.0
  var W = (35999.373 * T - 2.47) * DEG2RAD
  var dLambda = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W)
  var S = 0
  for (var i = 0; i < SEASON_TERMS.length; i++) {
    var t = SEASON_TERMS[i]
    S += t[0] * Math.cos((t[1] + t[2] * T) * DEG2RAD)
  }
  var jde = jde0 + 0.00001 * S / dLambda
  var deltaT = 69.0 + 0.3 * (year - 2025)   // TT - UT in seconds (close enough for this century)
  return fromJulian(jde - deltaT / 86400.0)
}

// Season that each event begins, per hemisphere (index = kind)
var SEASONS_NORTH = ["spring", "summer", "autumn", "winter"]
var SEASONS_SOUTH = ["autumn", "winter", "spring", "summer"]
var SEASON_META = {
  spring: { name: "Spring", event: "Spring Equinox", icon: "󰉊" },
  summer: { name: "Summer", event: "Summer Solstice", icon: "󰖨" },
  autumn: { name: "Autumn", event: "Autumn Equinox", icon: "󰌪" },
  winter: { name: "Winter", event: "Winter Solstice", icon: "󰜗" }
}

// Whole local calendar days from a to b (DST-safe)
function calendarDaysBetween(a, b) {
  var da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  var db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((db - da) / DAY_MS)
}

function formatSeasonCountdown(calendarDays) {
  if (calendarDays <= 0) return "Today"
  if (calendarDays === 1) return "Tomorrow"
  return calendarDays + " days"
}

// ---- Notifications (opt-in). Which reminders are due around `now`.
// cfg: { golden, blue, mornings, moon, season: bools; leadMin: minutes before sun events;
//        astroOpts; nextFull, nextNew, seasonDate: Date|null; seasonName: string }
// -> [{ id, kind, at: Date (the event), fireAt: Date, seasonName }], sorted by fireAt.
// Sun events (golden / blue hour starts; evenings, plus mornings when asked) fire
// leadMin before they begin, for today and tomorrow. Day events (full / new moon,
// season change) fire at 09:00 on the day when they fall after noon, otherwise at
// 18:00 the evening before, so the reminder never arrives after the moment itself.
function dayEventFireAt(at) {
  var f = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 9, 0, 0, 0)
  if (at.getHours() < 12) f = new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1, 18, 0, 0, 0)
  return f
}

function notificationPlan(now, lat, lon, cfg) {
  var c = cfg || {}
  var lead = Math.max(0, Math.min(120, Number(c.leadMin) || 0)) * 60000
  var out = []
  function valid(d) { return d instanceof Date && isFinite(d.getTime()) }
  function add(kind, at, fireAt) {
    if (!valid(at)) return
    out.push({ id: kind + "@" + Math.round(at.getTime() / 60000), kind: kind, at: at, fireAt: fireAt || new Date(at.getTime() - lead),
               seasonName: kind === "season" ? String(c.seasonName || "") : "" })
  }
  if (c.golden || c.blue) {
    for (var k = 0; k < 2; k++) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 12, 0, 0, 0)
      var t = getSunTimesForDay(day, lat, lon, c.astroOpts)
      if (!t) continue
      if (c.golden) {
        add("goldenEvening", t.goldenHourStart)
        if (c.mornings) add("goldenMorning", t.goldenMorningStart)
      }
      if (c.blue) {
        add("blueEvening", t.blueHourEveningStart)
        if (c.mornings) add("blueMorning", t.blueHourMorningStart)
      }
    }
  }
  if (c.moon) {
    if (valid(c.nextFull)) add("fullMoon", c.nextFull, dayEventFireAt(c.nextFull))
    if (valid(c.nextNew)) add("newMoon", c.nextNew, dayEventFireAt(c.nextNew))
  }
  if (c.season && valid(c.seasonDate)) add("season", c.seasonDate, dayEventFireAt(c.seasonDate))
  out.sort(function(a, b) { return a.fireAt - b.fireAt })
  return out
}

// The reminders to send now: fireAt has passed by less than graceMs (so a
// reminder missed while asleep or suspended is dropped, not sent late), and the
// id is not in `sent` ({ id: true }).
function dueNotifications(plan, now, sent, graceMs) {
  var g = graceMs || 180000, t = now.getTime(), due = []
  for (var i = 0; i < (plan || []).length; i++) {
    var e = plan[i], f = e.fireAt.getTime()
    if (t >= f && t - f < g && !(sent && sent[e.id])) due.push(e)
  }
  return due
}

// The reminders to show on the bar now: from fireAt until a little after the
// event (holdSunMs for golden / blue hour, holdDayMs for moon and season days).
// Each gets `begun` (the moment has passed). Soonest first.
function activeReminders(plan, now, holdSunMs, holdDayMs) {
  var hs = holdSunMs === undefined ? 15 * 60000 : holdSunMs
  var hd = holdDayMs === undefined ? 12 * 3600000 : holdDayMs
  var t = now.getTime(), out = []
  for (var i = 0; i < (plan || []).length; i++) {
    var e = plan[i]
    var day = e.kind === "fullMoon" || e.kind === "newMoon" || e.kind === "season"
    var a = e.at.getTime()
    if (t >= e.fireAt.getTime() && t < a + (day ? hd : hs)) {
      out.push({ id: e.id, kind: e.kind, at: e.at, fireAt: e.fireAt, seasonName: e.seasonName || "", begun: t >= a })
    }
  }
  out.sort(function(x, y) { return x.at - y.at })
  return out
}

// mode: "astronomical" (equinoxes and solstices) or "meteorological" (seasons
// begin on the first of March, June, September and December, local time).
var SEASON_START_META = {
  spring: "Start of Spring", summer: "Start of Summer", autumn: "Start of Autumn", winter: "Start of Winter"
}

function computeSeasonSummary(now, lat, mode) {
  var south = Number(lat) < 0
  var table = south ? SEASONS_SOUTH : SEASONS_NORTH
  var meteo = mode === "meteorological"
  var t = now.getTime()
  var year = now.getFullYear()
  var events = []
  for (var y = year - 1; y <= year + 1; y++) {
    for (var k = 0; k < 4; k++) {
      events.push({ kind: k, date: meteo ? new Date(y, 2 + k * 3, 1, 0, 0, 0) : seasonEventDate(y, k) })
    }
  }
  var prev = null
  var next = null
  for (var i = 0; i < events.length; i++) {
    if (events[i].date.getTime() > t) {
      next = events[i]
      prev = events[i - 1]
      break
    }
  }
  var nextMeta = SEASON_META[table[next.kind]]
  var curMeta = SEASON_META[table[prev.kind]]
  var span = next.date.getTime() - prev.date.getTime()
  var elapsed = t - prev.date.getTime()
  return {
    meteorological: meteo,
    nextEventName: meteo ? SEASON_START_META[table[next.kind]] : nextMeta.event,
    nextSeasonName: nextMeta.name,
    nextIcon: nextMeta.icon,
    nextDate: next.date,
    daysUntil: (next.date.getTime() - t) / DAY_MS,
    calendarDaysUntil: calendarDaysBetween(now, next.date),
    isSolstice: !meteo && (next.kind === 1 || next.kind === 3),
    currentSeasonName: curMeta.name,
    currentIcon: curMeta.icon,
    seasonDay: Math.floor(elapsed / DAY_MS) + 1,
    seasonLengthDays: Math.round(span / DAY_MS),
    seasonProgress: clamp(elapsed / span, 0.0, 1.0)
  }
}

// ============================================================================
// Analemma: the figure-8 the Sun traces when observed at the same mean time
// every day for a year. x = equation of time, y = noon altitude.
// ============================================================================

// Local mean noon (12:00 local mean solar time) of the given local calendar
// date. Independent of time zone and DST, so the curve has no kinks.
function meanNoonFor(year, month, day, lon) {
  return new Date(Date.UTC(year, month, day) + (12.0 - Number(lon) / 15.0) * 3600000.0)
}

// Sun at an instant: equation of time (minutes, + = sundial ahead of the clock)
// and altitude (degrees) at the given latitude.
function analemmaPoint(date, lat, lon) {
  var d = toDays(date)
  var c = sunCoords(d)
  var H = siderealTime(d, -Number(lon) * DEG2RAD) - c.ra
  H = Math.atan2(Math.sin(H), Math.cos(H))   // wrap to [-pi, pi]
  var pos = getSunPosition(date, lat, lon)
  return { eot: H * 720.0 / Math.PI, alt: pos.altitude, dec: c.dec * RAD2DEG, time: date.getTime() }
}

// The year's figure-8 (366 mean-noon samples) and its extents. Depends only on
// year and location, so callers cache it and pass it back in.
function computeAnalemmaCurve(year, lat, lon) {
  var curve = []
  for (var i = 0; i <= 365; i++) {
    curve.push(analemmaPoint(meanNoonFor(year, 0, 1 + i, lon), lat, lon))
  }
  var minAlt = 90, maxAlt = -90, minEot = 0, maxEot = 0
  for (var j = 0; j < curve.length; j++) {
    minAlt = Math.min(minAlt, curve[j].alt); maxAlt = Math.max(maxAlt, curve[j].alt)
    minEot = Math.min(minEot, curve[j].eot); maxEot = Math.max(maxEot, curve[j].eot)
  }
  return { year: year, lat: Number(lat), lon: Number(lon), curve: curve,
    minAlt: minAlt, maxAlt: maxAlt, minEot: minEot, maxEot: maxEot }
}

function computeAnalemma(now, lat, lon, curveData) {
  var south = Number(lat) < 0
  var table = south ? SEASONS_SOUTH : SEASONS_NORTH
  var year = now.getFullYear()
  var cd = (curveData && curveData.year === year && curveData.lat === Number(lat) && curveData.lon === Number(lon))
    ? curveData
    : computeAnalemmaCurve(year, lat, lon)
  var curve = cd.curve

  function onCurve(date) {
    var p = analemmaPoint(meanNoonFor(date.getFullYear(), date.getMonth(), date.getDate(), lon), lat, lon)
    p.date = date
    return p
  }

  var events = []
  for (var k = 0; k < 4; k++) {
    var ev = onCurve(seasonEventDate(year, k))
    var meta = SEASON_META[table[k]]
    ev.kind = k
    ev.isSolstice = (k === 1 || k === 3)
    ev.name = meta.event
    events.push(ev)
  }

  // Next event (may fall in the following year) and the path to it
  var t = now.getTime()
  var next = null
  for (var y = year; y <= year + 1 && !next; y++) {
    for (var n = 0; n < 4; n++) {
      var dt = seasonEventDate(y, n)
      if (dt.getTime() > t) { next = { kind: n, date: dt }; break }
    }
  }
  var path = []
  var days = Math.max(0, calendarDaysBetween(now, next.date))
  for (var p = 0; p <= days; p++) {
    path.push(analemmaPoint(meanNoonFor(now.getFullYear(), now.getMonth(), now.getDate() + p, lon), lat, lon))
  }

  return {
    curveData: cd,
    year: year,
    curve: curve,
    events: events,
    nextKind: next.kind,
    today: onCurve(now),
    path: path,
    minAlt: cd.minAlt, maxAlt: cd.maxAlt,
    minEot: cd.minEot, maxEot: cd.maxEot,
    south: south
  }
}

function formatSundialOffset(eotMinutes) {
  var m = Math.round(Number(eotMinutes) || 0)
  if (m === 0) return "±0m"
  return (m > 0 ? "+" : "−") + Math.abs(m) + "m"
}

// ============================================================================
// Current weather (Open-Meteo, the same keyless provider Omarchy's weather uses)
// ============================================================================

var WEATHER_MAX_BYTES = 65536

var WEATHER_ICONS = {
  SUN: "󰖙",
  NIGHT: "󰖔",
  PARTLY: "󰖕",
  PARTLYNIGHT: "󰼱",
  CLOUDY: "󰖐",
  FOG: "󰖑",
  RAIN: "󰖗",
  POUR: "󰖖",
  SNOW: "󰖘",
  STORM: "󰙾",
  HAIL: "󰖒"
}

// Drawn icon kind per condition key: [day, night]
var WEATHER_KINDS = {
  clear: ["clear", "clearNight"], mainlyClear: ["clear", "clearNight"],
  partlyCloudy: ["partly", "partlyNight"], overcast: ["cloudy", "cloudy"], fog: ["fog", "fog"],
  drizzle: ["drizzle", "drizzle"], freezingDrizzle: ["freezing", "freezing"],
  lightRain: ["rain", "rain"], rain: ["rain", "rain"], heavyRain: ["heavyRain", "heavyRain"],
  freezingRain: ["freezing", "freezing"], lightSnow: ["snow", "snow"], snow: ["snow", "snow"],
  heavySnow: ["snow", "snow"], showers: ["rain", "rain"], heavyShowers: ["heavyRain", "heavyRain"],
  snowShowers: ["snow", "snow"], thunderstorm: ["thunder", "thunder"], thunderHail: ["hail", "hail"]
}

// WMO weather interpretation codes -> condition key + day/night icons
var WEATHER_CODES = {
  0: ["clear", "SUN", "NIGHT"], 1: ["mainlyClear", "SUN", "NIGHT"], 2: ["partlyCloudy", "PARTLY", "PARTLYNIGHT"],
  3: ["overcast", "CLOUDY", "CLOUDY"], 45: ["fog", "FOG", "FOG"], 48: ["fog", "FOG", "FOG"],
  51: ["drizzle", "RAIN", "RAIN"], 53: ["drizzle", "RAIN", "RAIN"], 55: ["drizzle", "RAIN", "RAIN"],
  56: ["freezingDrizzle", "RAIN", "RAIN"], 57: ["freezingDrizzle", "RAIN", "RAIN"],
  61: ["lightRain", "RAIN", "RAIN"], 63: ["rain", "RAIN", "RAIN"], 65: ["heavyRain", "POUR", "POUR"],
  66: ["freezingRain", "RAIN", "RAIN"], 67: ["freezingRain", "POUR", "POUR"],
  71: ["lightSnow", "SNOW", "SNOW"], 73: ["snow", "SNOW", "SNOW"], 75: ["heavySnow", "SNOW", "SNOW"], 77: ["snow", "SNOW", "SNOW"],
  80: ["showers", "RAIN", "RAIN"], 81: ["showers", "POUR", "POUR"], 82: ["heavyShowers", "POUR", "POUR"],
  85: ["snowShowers", "SNOW", "SNOW"], 86: ["snowShowers", "SNOW", "SNOW"],
  95: ["thunderstorm", "STORM", "STORM"], 96: ["thunderHail", "HAIL", "HAIL"], 99: ["thunderHail", "HAIL", "HAIL"]
}

// Fixed HTTPS endpoint; only validated, rounded coordinates are interpolated.
function weatherUrl(lat, lon) {
  var la = Number(lat), lo = Number(lon)
  if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) return ""
  return "https://api.open-meteo.com/v1/forecast?latitude=" + la.toFixed(2) + "&longitude=" + lo.toFixed(2)
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day"
    + "&hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=24"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&forecast_days=7"
    + "&wind_speed_unit=kmh&timezone=auto"
}

// ---- City search (Open-Meteo geocoding). Only sent when the user presses Search.
var GEOCODE_MAX_BYTES = 32768
var GEOCODE_MAX_RESULTS = 6

// Clean a typed place name: plain text, 2..60 characters, or "" when unusable.
function cleanCityQuery(raw) {
  var q = sanitizeText(raw, 60)
  return q.length >= 2 ? q : ""
}

// Fixed HTTPS endpoint; the query is cleaned and URL-encoded, nothing else is interpolated.
function geocodeUrl(query) {
  var q = cleanCityQuery(query)
  if (q === "") return ""
  return "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(q)
    + "&count=" + GEOCODE_MAX_RESULTS + "&language=en&format=json"
}

// Geocoding JSON -> [{ name, detail, label, latitude, longitude }] (at most
// GEOCODE_MAX_RESULTS; bad entries dropped), [] for no matches, null for junk.
function parseGeocode(raw) {
  var text = String(raw === undefined || raw === null ? "" : raw)
  if (text.length === 0 || text.length > GEOCODE_MAX_BYTES) return null
  var data
  try { data = JSON.parse(text) } catch (e) { return null }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  var list = data.results
  if (list === undefined) return []
  if (!Array.isArray(list)) return null
  var out = []
  for (var i = 0; i < list.length && out.length < GEOCODE_MAX_RESULTS; i++) {
    var r = list[i]
    if (!r || typeof r !== "object") continue
    if (typeof r.latitude !== "number" || typeof r.longitude !== "number") continue
    var la = r.latitude, lo = r.longitude
    if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) continue
    var name = sanitizeText(r.name, 60)
    if (name === "") continue
    var parts = []
    var admin = sanitizeText(r.admin1, 40), country = sanitizeText(r.country, 40)
    if (admin !== "" && admin !== name) parts.push(admin)
    if (country !== "") parts.push(country)
    var detail = parts.join(", ")
    out.push({ name: name, detail: detail, label: detail === "" ? name : name + ", " + detail,
               latitude: Math.round(la * 10000) / 10000, longitude: Math.round(lo * 10000) / 10000 })
  }
  return out
}

// "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD" (local time at the location) -> parts, or null
function parseLocalStamp(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(v || ""))
  if (!m) return null
  var p = { y: +m[1], mo: +m[2], d: +m[3], h: m[4] === undefined ? 0 : +m[4], mi: m[5] === undefined ? 0 : +m[5] }
  if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31 || p.h > 23 || p.mi > 59) return null
  return p
}

function conditionFor(code, isDay) {
  var row = WEATHER_CODES[code]
  return { code: code, key: row[0], kind: WEATHER_KINDS[row[0]][isDay ? 0 : 1] }
}

function validCode(v) {
  var n = Number(v)
  return v !== null && v !== undefined && isFinite(n) && Math.floor(n) === n && WEATHER_CODES.hasOwnProperty(n)
}

function plausible(v, lo, hi) {
  var n = Number(v)
  return (v !== null && v !== undefined && isFinite(n) && n >= lo && n <= hi) ? n : null
}

// Hourly and daily forecast blocks of the same response. Each entry is checked
// on its own; bad entries are skipped, and at most 24 hours / 7 days are kept.
// -> { hourly: [{y, mo, d, h, tempC, pop, code, key, kind}], daily: [{y, mo, d, maxC, minC, pop, windKmh, code, key, kind}] }
function parseForecast(data) {
  var out = { hourly: [], daily: [] }
  var hr = data && data.hourly
  if (hr && typeof hr === "object" && Array.isArray(hr.time)) {
    for (var i = 0; i < hr.time.length && out.hourly.length < 24; i++) {
      var st = parseLocalStamp(hr.time[i])
      var t = plausible(hr.temperature_2m && hr.temperature_2m[i], -95, 65)
      var c = hr.weather_code && hr.weather_code[i]
      if (!st || t === null || !validCode(c)) continue
      var day = !(hr.is_day && Number(hr.is_day[i]) === 0)
      var h = conditionFor(Number(c), day)
      h.y = st.y; h.mo = st.mo; h.d = st.d; h.h = st.h
      h.tempC = t
      h.pop = plausible(hr.precipitation_probability && hr.precipitation_probability[i], 0, 100)
      out.hourly.push(h)
    }
  }
  var dl = data && data.daily
  if (dl && typeof dl === "object" && Array.isArray(dl.time)) {
    for (var j = 0; j < dl.time.length && out.daily.length < 7; j++) {
      var sd = parseLocalStamp(dl.time[j])
      var hi = plausible(dl.temperature_2m_max && dl.temperature_2m_max[j], -95, 65)
      var lo = plausible(dl.temperature_2m_min && dl.temperature_2m_min[j], -95, 65)
      var dc = dl.weather_code && dl.weather_code[j]
      if (!sd || hi === null || lo === null || lo > hi || !validCode(dc)) continue
      var d = conditionFor(Number(dc), true)
      d.y = sd.y; d.mo = sd.mo; d.d = sd.d
      d.maxC = hi; d.minC = lo
      d.pop = plausible(dl.precipitation_probability_max && dl.precipitation_probability_max[j], 0, 100)
      d.windKmh = plausible(dl.wind_speed_10m_max && dl.wind_speed_10m_max[j], 0, 400)
      out.daily.push(d)
    }
  }
  return out
}

// Untrusted response -> {tempC, code, key, icon, isDay, ..., forecast} or null
function parseCurrentWeather(raw) {
  var text = String(raw || "")
  if (text.length === 0 || text.length > WEATHER_MAX_BYTES) return null
  var data
  try { data = JSON.parse(text) } catch (e) { return null }
  var cur = data && data.current
  if (!cur || typeof cur !== "object") return null
  var t = Number(cur.temperature_2m)
  var code = Number(cur.weather_code)
  if (!isFinite(t) || t < -95 || t > 65) return null
  if (!isFinite(code) || Math.floor(code) !== code || !WEATHER_CODES.hasOwnProperty(code)) return null
  var isDay = Number(cur.is_day) === 1
  var row = WEATHER_CODES[code]
  // Optional extras: kept only when present and physically plausible
  function opt(v, lo, hi) { var n = Number(v); return (v !== null && v !== undefined && isFinite(n) && n >= lo && n <= hi) ? n : null }
  return {
    tempC: t, code: code, key: row[0], isDay: isDay,
    icon: WEATHER_ICONS[isDay ? row[1] : row[2]],
    kind: WEATHER_KINDS[row[0]][isDay ? 0 : 1],
    feelsC: opt(cur.apparent_temperature, -100, 75),
    humidity: opt(cur.relative_humidity_2m, 0, 100),
    windKmh: opt(cur.wind_speed_10m, 0, 400),
    forecast: parseForecast(data)
  }
}

// ============================================================================
// Area map: an n x n grid of forecast points centred on the location, one
// multi-location Open-Meteo request (the same keyless endpoint as above)
// ============================================================================

var AREA_MAX_BYTES = 262144
var AREA_HOURS = 24

// Grid points spanning +-radiusKm east-west and north-south, row by row from
// the north-west corner. -> [{lat, lon, col, row, dxKm, dyKm}] (dy north
// positive), or [] for bad input. n must be odd so the centre is the location.
function areaPoints(lat, lon, radiusKm, n) {
  var la = Number(lat), lo = Number(lon), r = Number(radiusKm), size = Number(n)
  if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) return []
  if (!isFinite(r) || r <= 0 || r > 500 || !isFinite(size) || size < 3 || size > 9 || size % 2 !== 1) return []
  var half = (size - 1) / 2
  var kmPerDegLat = 110.574
  var kmPerDegLon = 111.320 * Math.max(0.05, Math.cos(la * Math.PI / 180))
  var out = []
  for (var row = 0; row < size; row++) {
    for (var col = 0; col < size; col++) {
      var dx = (col - half) / half * r
      var dy = (half - row) / half * r
      var pla = Math.max(-89.99, Math.min(89.99, la + dy / kmPerDegLat))
      var plo = lo + dx / kmPerDegLon
      plo = ((plo + 540) % 360) - 180
      out.push({ lat: pla, lon: plo, col: col, row: row, dxKm: dx, dyKm: dy })
    }
  }
  return out
}

// Fixed HTTPS endpoint; only the validated, rounded grid coordinates are interpolated.
function areaUrl(points) {
  if (!Array.isArray(points) || points.length === 0 || points.length > 81) return ""
  var las = [], los = []
  for (var i = 0; i < points.length; i++) {
    var la = Number(points[i].lat), lo = Number(points[i].lon)
    if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) return ""
    las.push(la.toFixed(2)); los.push(lo.toFixed(2))
  }
  return "https://api.open-meteo.com/v1/forecast?latitude=" + las.join(",") + "&longitude=" + los.join(",")
    + "&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,is_day,wind_speed_10m,wind_direction_10m"
    + "&forecast_hours=" + AREA_HOURS + "&wind_speed_unit=kmh&timezone=auto"
}

// Untrusted multi-location response -> { hours: [{y, mo, d, h}], cells: [[{tempC, pop, windKmh, windDir, code, key, kind} | null]] }
// (windDir: where the wind blows FROM, degrees clockwise from north, as reported)
// (cells[point][hour]; a bad hour is null, so hours stay aligned) or null when
// the response is not one block per point or no hour of the centre is usable.
function parseAreaForecast(raw, count, centre) {
  var text = String(raw || "")
  if (text.length === 0 || text.length > AREA_MAX_BYTES) return null
  var data
  try { data = JSON.parse(text) } catch (e) { return null }
  if (count === 1 && data && !Array.isArray(data)) data = [data]
  if (!Array.isArray(data) || data.length !== count) return null
  var c = centre === undefined ? Math.floor(count / 2) : centre
  var hours = []
  var cells = []
  for (var p = 0; p < count; p++) {
    var hr = data[p] && data[p].hourly
    var row = []
    for (var i = 0; i < AREA_HOURS; i++) {
      var cell = null
      if (hr && typeof hr === "object" && Array.isArray(hr.time) && i < hr.time.length) {
        var t = plausible(hr.temperature_2m && hr.temperature_2m[i], -95, 65)
        var code = hr.weather_code && hr.weather_code[i]
        if (t !== null && validCode(code)) {
          cell = conditionFor(Number(code), !(hr.is_day && Number(hr.is_day[i]) === 0))
          cell.tempC = t
          cell.pop = plausible(hr.precipitation_probability && hr.precipitation_probability[i], 0, 100)
          cell.precipMm = plausible(hr.precipitation && hr.precipitation[i], 0, 500)
          cell.snow = cell.key === "lightSnow" || cell.key === "snow" || cell.key === "heavySnow" || cell.key === "snowShowers"
          cell.windKmh = plausible(hr.wind_speed_10m && hr.wind_speed_10m[i], 0, 400)
          cell.windDir = plausible(hr.wind_direction_10m && hr.wind_direction_10m[i], 0, 360)
          if (cell.windKmh === null) cell.windDir = null
        }
        if (p === c) hours.push(parseLocalStamp(hr.time[i]))
      }
      row.push(cell)
    }
    cells.push(row)
  }
  var usable = 0
  for (var k = 0; k < hours.length; k++) if (hours[k] && cells[c][k]) usable++
  if (usable === 0) return null
  return { hours: hours, cells: cells }
}

// (tilePx / maxZoom default to OSM's 256 px / 17; the radar uses 512 px, zoom <= 7,
// and is then simply drawn larger.)
// Basemap tiles under the area map: OpenStreetMap's standard tiles (256 px,
// Web Mercator), at the zoom that draws them nearest their own size (70-140 %).
// The widget downloads them with curl under its own User-Agent and keeps them
// 7 days, as the OSM tile policy asks. spanKm: ground width of the box; boxPx:
// its width in pixels. -> { zoom, tiles: [{z, x, y, left, top, size}] } (left/top
// relative to the box), or null for bad input.
var TILE_PX = 256
var TILE_MAX_BYTES = 1048576
var TILE_USER_AGENT = "Heliolune/2 (Omarchy plugin; +https://github.com/makehasteslowly/omarchy-heliolune)"
function mapTiles(lat, lon, spanKm, boxPx, tilePx, maxZoom) {
  var TILE_PX = tilePx === undefined ? 256 : tilePx
  var zmax = maxZoom === undefined ? 17 : maxZoom
  var la = Number(lat), lo = Number(lon), span = Number(spanKm), box = Number(boxPx)
  if (!isFinite(la) || !isFinite(lo) || la < -85 || la > 85 || lo < -180 || lo > 180) return null
  if (!isFinite(span) || span <= 0 || !isFinite(box) || box < 16 || box > 4096) return null
  var cosLat = Math.cos(la * Math.PI / 180)
  var mppWanted = span * 1000 / box                          // metres per box pixel
  var mppZ0 = 2 * Math.PI * 6378137 * cosLat / TILE_PX       // metres per tile pixel at zoom 0
  var zoom = Math.max(2, Math.min(zmax, Math.round(Math.log(mppZ0 / mppWanted) / Math.LN2)))
  var k = (mppZ0 / Math.pow(2, zoom)) / mppWanted           // box px per tile px
  var n = Math.pow(2, zoom)
  var wx = (lo + 180) / 360 * n * TILE_PX
  var sinLat = Math.sin(la * Math.PI / 180)
  var wy = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n * TILE_PX
  var half = box / 2 / k
  var tiles = []
  for (var ty = Math.floor((wy - half) / TILE_PX); ty <= Math.floor((wy + half) / TILE_PX); ty++) {
    if (ty < 0 || ty >= n) continue
    for (var tx = Math.floor((wx - half) / TILE_PX); tx <= Math.floor((wx + half) / TILE_PX); tx++) {
      tiles.push({
        z: zoom, x: ((tx % n) + n) % n, y: ty,
        left: box / 2 + (tx * TILE_PX - wx) * k,
        top: box / 2 + (ty * TILE_PX - wy) * k,
        size: TILE_PX * k
      })
    }
  }
  return { zoom: zoom, tiles: tiles }
}

// "z/x/y" for a tile, or "" unless all three are in range (the only part of a
// tile URL or cache path that varies)
function tileKey(t) {
  if (!t) return ""
  var z = Number(t.z), x = Number(t.x), y = Number(t.y)
  var ok = function(v, max) { return isFinite(v) && Math.floor(v) === v && v >= 0 && v < max }
  if (!ok(z, 20) || !ok(x, Math.pow(2, z)) || !ok(y, Math.pow(2, z))) return ""
  return z + "/" + x + "/" + y
}

// ---- Smooth fields over the area grid (radar-style rain, wind streams)

// Bilinear sample of an n x n row-major grid at fractional grid coordinates
// (0..n-1; clamped). Missing values count as 0.
function gridSample(values, n, gx, gy) {
  var x = Math.max(0, Math.min(n - 1, gx)), y = Math.max(0, Math.min(n - 1, gy))
  var x0 = Math.min(n - 2, Math.floor(x)), y0 = Math.min(n - 2, Math.floor(y))
  var fx = x - x0, fy = y - y0
  function v(c, r) { var a = values[r * n + c]; return (a === null || a === undefined || !isFinite(a)) ? 0 : a }
  return (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy
}

// Bicubic (Catmull-Rom) sample of an n x n row-major grid at fractional grid
// coordinates (0..n-1; clamped; edges repeat). Smoother than gridSample, with no
// diamond-shaped cells; never below 0 (the cubic can undershoot next to a peak).
function gridSampleSmooth(values, n, gx, gy) {
  var x = Math.max(0, Math.min(n - 1, gx)), y = Math.max(0, Math.min(n - 1, gy))
  var x0 = Math.min(n - 2, Math.floor(x)), y0 = Math.min(n - 2, Math.floor(y))
  var fx = x - x0, fy = y - y0
  function v(c, r) {
    c = Math.max(0, Math.min(n - 1, c)); r = Math.max(0, Math.min(n - 1, r))
    var a = values[r * n + c]
    return (a === null || a === undefined || !isFinite(a)) ? 0 : a
  }
  function cubic(p0, p1, p2, p3, t) {
    return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  }
  var rows = []
  for (var j = -1; j <= 2; j++) {
    rows.push(cubic(v(x0 - 1, y0 + j), v(x0, y0 + j), v(x0 + 1, y0 + j), v(x0 + 2, y0 + j), fx))
  }
  return Math.max(0, cubic(rows[0], rows[1], rows[2], rows[3], fy))
}

// Wind as a vector pointing where it blows, screen-oriented (x east, y down),
// in km/h. dirFrom: degrees the wind comes FROM.
function windVector(kmh, dirFrom) {
  var s = Number(kmh), d = Number(dirFrom)
  if (!isFinite(s) || !isFinite(d)) return { x: 0, y: 0 }
  var to = (d + 180) * Math.PI / 180
  return { x: s * Math.sin(to), y: -s * Math.cos(to) }
}

// Wind-stream colour for a speed (km/h): green when calm, through yellow and
// orange, to red when strong. -> [r, g, b] in 0..255
var WIND_STOPS = [[0, 60, 200, 90], [20, 170, 215, 60], [35, 250, 210, 40], [50, 255, 130, 30], [70, 230, 40, 40]]
function windColor(kmh) {
  var v = Number(kmh)
  if (!isFinite(v) || v < 0) v = 0
  for (var i = 1; i < WIND_STOPS.length; i++) {
    if (v < WIND_STOPS[i][0]) {
      var a = WIND_STOPS[i - 1], b = WIND_STOPS[i], t = (v - a[0]) / (b[0] - a[0])
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
    }
  }
  var l = WIND_STOPS[WIND_STOPS.length - 1]
  return [l[1], l[2], l[3]]
}

// Radar colour for a precipitation rate (mm/h): transparent below 0.05; pale
// blue -> blue -> deep blue -> yellow -> orange -> red (snow: pale to deep violet).
// -> [r, g, b, a] in 0..255
// The rain stops follow RainViewer's "Universal Blue" radar scheme (the only one its
// free tiles come in), so the past radar and the forecast read as one picture.
var RAIN_STOPS = [[0.1, 150, 222, 240, 120], [1, 54, 186, 229, 170], [3, 0, 112, 163, 195], [8, 255, 205, 0, 205], [16, 255, 110, 0, 215], [32, 220, 20, 40, 225]]
var SNOW_STOPS = [[0.1, 225, 220, 250, 110], [1, 190, 170, 245, 160], [3, 150, 120, 235, 190], [8, 120, 80, 215, 210], [16, 100, 50, 190, 220]]
function radarColor(mm, snowiness) {
  var v = Number(mm)
  if (!isFinite(v) || v < 0.05) return [0, 0, 0, 0]
  function along(stops) {
    if (v <= stops[0][0]) { var f0 = (v - 0.05) / (stops[0][0] - 0.05); return [stops[0][1], stops[0][2], stops[0][3], stops[0][4] * f0] }
    for (var i = 1; i < stops.length; i++) {
      // Stepped colours, as radar palettes are (blending blue into yellow
      // would pass through olive); only the opacity ramps between steps
      if (v < stops[i][0]) {
        var a = stops[i - 1], b = stops[i]
        var t = Math.log(v / a[0]) / Math.log(b[0] / a[0])
        return [a[1], a[2], a[3], a[4] + (b[4] - a[4]) * t]
      }
    }
    var l = stops[stops.length - 1]
    return [l[1], l[2], l[3], l[4]]
  }
  var r = along(RAIN_STOPS)
  var k = Math.max(0, Math.min(1, Number(snowiness) || 0))
  if (k === 0) return r
  var s = along(SNOW_STOPS)
  return [r[0] + (s[0] - r[0]) * k, r[1] + (s[1] - r[1]) * k, r[2] + (s[2] - r[2]) * k, r[3] + (s[3] - r[3]) * k]
}

// ---- Past radar (RainViewer, keyless; personal use, credit requested): the last
// ~2 hours in 10-minute frames. Tiles stop at zoom 7.
var RADAR_INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json"
var RADAR_HOST = "https://tilecache.rainviewer.com"
var RADAR_INDEX_MAX_BYTES = 32768

// Untrusted index -> [{time (ms), id}] oldest first (at most 13), or null. Only
// the expected host and "/v2/radar/<hex id>" paths are accepted.
function parseRadarFrames(raw) {
  var text = String(raw || "")
  if (text.length === 0 || text.length > RADAR_INDEX_MAX_BYTES) return null
  var data
  try { data = JSON.parse(text) } catch (e) { return null }
  if (!data || data.host !== RADAR_HOST || !data.radar || !Array.isArray(data.radar.past)) return null
  var out = []
  for (var i = 0; i < data.radar.past.length; i++) {
    var f = data.radar.past[i]
    var m = f && /^\/v2\/radar\/([0-9a-f]{6,40})$/.exec(String(f.path))
    var t = f && Number(f.time)
    if (!m || !isFinite(t) || t < 1.5e9 || t > 4e9) continue
    out.push({ time: t * 1000, id: m[1] })
  }
  out.sort(function(a, b) { return a.time - b.time })
  out = out.slice(-13)
  return out.length ? out : null
}

// "<id>/z/x/y" for a radar tile, or "" when anything is out of range
function radarTileKey(id, t) {
  var k = tileKey(t)
  if (!/^[0-9a-f]{6,40}$/.test(String(id)) || k === "" || t.z > 7) return ""
  return id + "/" + k
}

// Compass point (16-wind) for a bearing in degrees clockwise from north
function compassFromDegrees(deg) {
  var r = Number(deg) * Math.PI / 180
  return compassPoint(Math.sin(r), Math.cos(r))
}

// Compass point (16-wind) for an offset with north positive
function compassPoint(dx, dy) {
  var names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  var deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
  return names[Math.round(deg / 22.5) % 16]
}

// Conditions that raise a weather alert on the bar, by WMO code (only the heavy
// or dangerous ones: light rain or ordinary snow do not)
var SEVERE_CODES = {
  65: true, 82: true,               // heavy rain, violent showers
  56: true, 57: true, 66: true, 67: true,   // freezing drizzle / rain
  75: true, 86: true,               // heavy snow, heavy snow showers
  95: true, 96: true, 99: true      // thunderstorm, with hail
}

// The first severe spell now or within the next `hoursAhead` hours, from the
// current reading and the hourly forecast. -> null or
// { code, key, kind, now, startH, endH, pop } (endH null when the spell runs
// past the window; pop the highest rain chance in the spell, or null)
function computeWeatherAlert(w, hoursAhead) {
  if (!w) return null
  var hours = (w.forecast && w.forecast.hourly) || []
  var ahead = hoursAhead === undefined ? 12 : hoursAhead   // hours[0] is the current hour
  var start = -1
  if (SEVERE_CODES[w.code]) start = 0
  else for (var i = 0; i <= ahead && i < hours.length; i++) if (SEVERE_CODES[hours[i].code]) { start = i; break }
  if (start < 0) return null
  var first = start === 0 && SEVERE_CODES[w.code] ? w : hours[start]
  var end = start
  while (end + 1 < hours.length && SEVERE_CODES[hours[end + 1].code]) end++
  var pop = null
  for (var j = start; j <= end && j < hours.length; j++) {
    if (hours[j].pop !== null && hours[j].pop !== undefined) pop = pop === null ? hours[j].pop : Math.max(pop, hours[j].pop)
  }
  return {
    code: first.code, key: first.key, kind: first.kind,
    now: start === 0,
    startH: hours.length ? hours[Math.min(start, hours.length - 1)].h : null,
    endH: end + 1 < hours.length ? hours[end + 1].h : null,
    pop: pop
  }
}

// unit: "kmh" | "mph" | "ms" (a boolean is accepted as imperial yes/no)
function formatWind(kmh, unit) {
  var v = Number(kmh)
  if (!isFinite(v)) return ""
  if (unit === true) unit = "mph"
  if (unit === false || unit === undefined) unit = "kmh"
  if (unit === "mph") return Math.round(v * 0.621371) + " mph"
  if (unit === "ms") return (Math.round(v / 3.6 * 10) / 10) + " m/s"
  return Math.round(v) + " km/h"
}

function formatTemperature(tempC, imperial) {
  var v = Number(tempC)
  if (!isFinite(v)) return ""
  return Math.round(imperial ? v * 9 / 5 + 32 : v) + (imperial ? "°F" : "°C")
}

// ISO 8601 week number of a local calendar date: weeks start on Monday and
// week 1 is the one containing the year's first Thursday (so Jan 1-3 can fall
// in week 52/53 of the previous year, and Dec 29-31 in week 1 of the next).
// Week number by scheme: "iso" (Monday start, first-Thursday rule) or "us"
// (Sunday start, week 1 is the week containing January 1).
function weekNumber(date, scheme) {
  if (scheme !== "us") return isoWeek(date)
  var jan1 = new Date(date.getFullYear(), 0, 1)
  var doy = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / DAY_MS)
  return { week: Math.floor((doy + jan1.getDay()) / 7) + 1, year: date.getFullYear() }
}

function isoWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  var day = d.getUTCDay() || 7                 // Monday = 1 ... Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - day)       // Thursday of this week
  var yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return { week: Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7), year: d.getUTCFullYear() }
}

function formatCountdownDays(daysFloat) {
  var d = Math.max(0, Number(daysFloat) || 0)
  if (d < 0.04) return "Now"
  if (d < 1.0) {
    var hrs = Math.max(1, Math.round(d * 24))
    return "in " + hrs + "h"
  }
  var wholeDays = Math.floor(d)
  var remHours = Math.round((d - wholeDays) * 24)
  if (remHours === 24) {
    wholeDays += 1
    remHours = 0
  }
  if (wholeDays >= 7 || remHours === 0) return "in " + wholeDays + "d"
  return "in " + wholeDays + "d " + remHours + "h"
}

function formatAgeDays(ageDays) {
  var a = Math.max(0, Number(ageDays) || 0)
  var d = Math.floor(a)
  var h = Math.round((a - d) * 24)
  if (h === 24) {
    d += 1
    h = 0
  }
  return d + "d " + h + "h"
}

// ---- Sky light: the color of the light at a solar altitude, for the popup's
// glow. Blended between phases so it never jumps: night, twilight, blue hour
// (-6 to -4), golden hour (-4 to 6, rose at the horizon), day. strength is how
// much of it shows (day and night stay faint).
var SKY_STOPS = [
  { alt: -18, rgb: [140, 160, 220], strength: 0.12, key: "night" },
  { alt: -10, rgb: [96, 104, 230],  strength: 0.16, key: "twilight" },
  { alt: -6,  rgb: [61, 123, 255],  strength: 0.28, key: "blue" },
  { alt: -4,  rgb: [61, 123, 255],  strength: 0.28, key: "blue" },
  { alt: -1,  rgb: [255, 150, 110], strength: 0.30, key: "golden" },
  { alt: 6,   rgb: [255, 186, 72],  strength: 0.30, key: "golden" },
  { alt: 14,  rgb: [255, 236, 200], strength: 0.0,  key: "day" }
]
function skyLight(alt) {
  var a = Number(alt)
  if (!isFinite(a)) a = 30
  var S = SKY_STOPS
  if (a <= S[0].alt) return { rgb: S[0].rgb.slice(), strength: S[0].strength, key: S[0].key }
  for (var i = 1; i < S.length; i++) {
    var p = S[i - 1], n = S[i]
    if (a <= n.alt) {
      var t = (a - p.alt) / (n.alt - p.alt)
      return { rgb: [p.rgb[0] + (n.rgb[0] - p.rgb[0]) * t, p.rgb[1] + (n.rgb[1] - p.rgb[1]) * t, p.rgb[2] + (n.rgb[2] - p.rgb[2]) * t],
               strength: p.strength + (n.strength - p.strength) * t, key: t < 0.5 ? p.key : n.key }
    }
  }
  var l = S[S.length - 1]
  return { rgb: l.rgb.slice(), strength: l.strength, key: l.key }
}
