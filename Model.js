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

function getSunTimesForDay(date, lat, lon) {
  var transit = solarTransitFor(date, lon)

  function pairForAngle(angleDeg) {
    return {
      rise: sunAltitudeEvent(transit, angleDeg, lat, lon, true),
      set: sunAltitudeEvent(transit, angleDeg, lat, lon, false)
    }
  }

  var sunStd = pairForAngle(-0.833)       // Official Sunrise / Sunset
  var blue = pairForAngle(-4.0)           // Blue Hour inner boundary (-4° to -6°)
  var civil = pairForAngle(-6.0)          // Civil Dawn / Dusk (-6°, outer Blue Hour boundary)
  var nautical = pairForAngle(-12.0)      // Nautical Dawn / Dusk
  var astro = pairForAngle(-18.0)         // Astronomical Dawn / Dusk
  var golden = pairForAngle(6.0)          // Golden Hour end (morning) / start (evening)

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
    blueHourMorningStart: civil.rise,
    blueHourMorningEnd: blue.rise,
    blueHourEveningStart: blue.set,
    blueHourEveningEnd: civil.set,
    nauticalDawn: nautical.rise,
    nauticalDusk: nautical.set,
    astroDawn: astro.rise,
    astroDusk: astro.set,
    goldenHourEnd: golden.rise,
    goldenHourStart: golden.set,
    dayLengthSeconds: dayLengthSeconds,
    maxAltitude: noonPosition.altitude
  }
}

// Classify current solar phase & next milestone
function computeSolarSummary(now, lat, lon) {
  var today = getSunTimesForDay(now, lat, lon)
  var yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0)
  var tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0)
  var yesterday = getSunTimesForDay(yesterdayDate, lat, lon)
  var tomorrow = getSunTimesForDay(tomorrowDate, lat, lon)

  var pos = getSunPosition(now, lat, lon)
  var dayDiffSec = today.dayLengthSeconds - yesterday.dayLengthSeconds

  var isDay = pos.altitude > -0.833
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
             (pos.altitude <= -4.0 && pos.altitude >= -6.0)) {
    phaseKey = "blue_hour"
    phaseName = t < (sn || t) ? "Morning Blue Hour" : "Evening Blue Hour"
    phaseIcon = "󰖚"
  } else if (pos.altitude > -0.833) {
    if (sn !== null && Math.abs(t - sn) <= 25 * 60000) {
      phaseKey = "solar_noon"
      phaseName = "Solar Noon"
      phaseIcon = "󰖙"
    } else if ((ghMorningEnd !== null && t < ghMorningEnd) || (ghEveningStart !== null && t > ghEveningStart) || pos.altitude < 6.0) {
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

  if (bhMorningStart !== null && t < bhMorningStart) {
    nextEventName = "Blue Hour"
    nextEventTime = today.blueHourMorningStart
    nextEventIcon = "󰖚"
  } else if (sr !== null && t < sr) {
    nextEventName = "Sunrise"
    nextEventTime = today.sunrise
    nextEventIcon = "󰖜"
  } else if (sn !== null && t < sn) {
    nextEventName = "Solar Noon"
    nextEventTime = today.solarNoon
    nextEventIcon = "󰖙"
  } else if (ghEveningStart !== null && t < ghEveningStart) {
    nextEventName = "Golden Hour"
    nextEventTime = today.goldenHourStart
    nextEventIcon = "󰖨"
  } else if (ss !== null && t < ss) {
    nextEventName = "Sunset"
    nextEventTime = today.sunset
    nextEventIcon = "󰖛"
  } else if (bhEveningStart !== null && t < bhEveningStart) {
    nextEventName = "Blue Hour"
    nextEventTime = today.blueHourEveningStart
    nextEventIcon = "󰖚"
  } else if (tomorrow.blueHourMorningStart) {
    nextEventName = "Blue Hour"
    nextEventTime = tomorrow.blueHourMorningStart
    nextEventIcon = "󰖚"
  } else if (tomorrow.sunrise) {
    nextEventName = "Sunrise"
    nextEventTime = tomorrow.sunrise
    nextEventIcon = "󰖜"
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
  var activeGoldenHourEnd = today.sunset
  var activeGoldenHourIsMorning = false
  if (sn !== null && t < sn) {
    activeGoldenHourStart = today.sunrise
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
function moonRiseSetTarget(date, lat, lon) {
  var p = getMoonPosition(date, lat, lon)
  return p.geoAltitude - (0.7275 * p.parallaxDeg - 0.5667)
}

function getMoonTimes(date, lat, lon) {
  var t0 = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime()
  var t1 = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime()
  var hours = (t1 - t0) / 3600000.0   // 23/24/25 on DST days
  function f(h) { return moonRiseSetTarget(new Date(t0 + h * 3600000.0), lat, lon) }

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
function getNextMoonEvents(now, lat, lon) {
  var t = now.getTime()
  var nextRise = null, nextSet = null
  for (var k = 0; k < 3 && (nextRise === null || nextSet === null); k++) {
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 12, 0, 0, 0)
    var mt = getMoonTimes(day, lat, lon)
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

function computeLunarSummary(now, lat, lon) {
  var illum = getMoonIllumination(now)
  var pos = getMoonPosition(now, lat, lon)
  var todayMoon = getMoonTimes(now, lat, lon)
  var nextMoon = getNextMoonEvents(now, lat, lon)
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

function computeSeasonSummary(now, lat) {
  var south = Number(lat) < 0
  var table = south ? SEASONS_SOUTH : SEASONS_NORTH
  var t = now.getTime()
  var year = now.getFullYear()
  var events = []
  for (var y = year - 1; y <= year + 1; y++) {
    for (var k = 0; k < 4; k++) events.push({ kind: k, date: seasonEventDate(y, k) })
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
    nextEventName: nextMeta.event,
    nextSeasonName: nextMeta.name,
    nextIcon: nextMeta.icon,
    nextDate: next.date,
    daysUntil: (next.date.getTime() - t) / DAY_MS,
    calendarDaysUntil: calendarDaysBetween(now, next.date),
    isSolstice: next.kind === 1 || next.kind === 3,
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
    + "&current=temperature_2m,weather_code,is_day&timezone=auto"
}

// Untrusted response -> {tempC, code, key, icon, isDay} or null
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
  return { tempC: t, code: code, key: row[0], icon: WEATHER_ICONS[isDay ? row[1] : row[2]], isDay: isDay }
}

function formatTemperature(tempC, imperial) {
  var v = Number(tempC)
  if (!isFinite(v)) return ""
  return Math.round(imperial ? v * 9 / 5 + 32 : v) + (imperial ? "°F" : "°C")
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
