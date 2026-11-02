.pragma library

// ============================================================================
// Solar & Lunar Astronomical Engine (Offline NOAA + Jean Meeus algorithms)
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

var OBLIQUITY = 23.4397 * DEG2RAD

function solarMeanAnomaly(d) {
  return (357.5291 + 0.98560028 * d) * DEG2RAD
}

function eclipticLongitude(M) {
  var C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * DEG2RAD
  var P = 102.9372 * DEG2RAD
  return M + C + P + Math.PI
}

function sunCoords(d) {
  var M = solarMeanAnomaly(d)
  var L = eclipticLongitude(M)
  var dec = Math.asin(Math.sin(0) * Math.cos(OBLIQUITY) + Math.cos(0) * Math.sin(OBLIQUITY) * Math.sin(L))
  var ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY) - Math.tan(0) * Math.sin(OBLIQUITY), Math.cos(L))
  return { dec: dec, ra: ra, L: L, M: M }
}

function siderealTime(d, lw) {
  return (280.16 + 360.9856235 * d) * DEG2RAD - lw
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

function julianCycle(d, lw) {
  return Math.round(d - 0.0009 - lw / (2.0 * Math.PI))
}

function approxTransit(Ht, lw, n) {
  return 0.0009 + (Ht + lw) / (2.0 * Math.PI) + n
}

function solarTransitJ(ds, M, L) {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2.0 * L)
}

function hourAngle(h, phi, d) {
  var cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))
  if (cosH > 1.0 || cosH < -1.0) return NaN
  return Math.acos(cosH)
}

function getSetJ(h, lw, phi, dec, n, M, L) {
  var w = hourAngle(h, phi, dec)
  if (isNaN(w)) return NaN
  var a = approxTransit(w, lw, n)
  return solarTransitJ(a, M, L)
}

function getSunTimesForDay(date, lat, lon) {
  var lw = -lon * DEG2RAD
  var phi = lat * DEG2RAD

  // Anchor to local noon of the given date
  var localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
  var d = toDays(localNoon)
  var n = julianCycle(d, lw)
  var ds = approxTransit(0, lw, n)

  var M = solarMeanAnomaly(ds)
  var L = eclipticLongitude(M)
  var dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L))

  var Jnoon = solarTransitJ(ds, M, L)
  var Jnad = Jnoon - 0.5

  function pairForAngle(angleDeg) {
    var h = angleDeg * DEG2RAD
    var Jset = getSetJ(h, lw, phi, dec, n, M, L)
    if (isNaN(Jset)) return { rise: null, set: null }
    var Jrise = Jnoon - (Jset - Jnoon)
    return {
      rise: fromJulian(Jrise),
      set: fromJulian(Jset)
    }
  }

  var sunStd = pairForAngle(-0.833)       // Official Sunrise / Sunset
  var blue = pairForAngle(-4.0)           // Blue Hour inner boundary (-4° to -6°)
  var civil = pairForAngle(-6.0)          // Civil Dawn / Dusk (-6°, outer Blue Hour boundary)
  var nautical = pairForAngle(-12.0)      // Nautical Dawn / Dusk
  var astro = pairForAngle(-18.0)         // Astronomical Dawn / Dusk
  var golden = pairForAngle(6.0)          // Golden Hour end (morning) / start (evening)

  var dayLengthSeconds = 0
  if (sunStd.rise && sunStd.set) {
    dayLengthSeconds = Math.max(0, Math.round((sunStd.set.getTime() - sunStd.rise.getTime()) / 1000))
  } else {
    var noonPos = getSunPosition(fromJulian(Jnoon), lat, lon)
    dayLengthSeconds = noonPos.altitude > 0 ? 86400 : 0
  }

  var solarNoonDate = fromJulian(Jnoon)
  var noonPosition = getSunPosition(solarNoonDate, lat, lon)

  return {
    solarNoon: solarNoonDate,
    nadir: fromJulian(Jnad),
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

function moonCoords(d) {
  var L = (218.316 + 13.176396 * d) * DEG2RAD
  var M = (134.963 + 13.064993 * d) * DEG2RAD
  var F = (93.272 + 13.229350 * d) * DEG2RAD

  var l = L + 6.289 * DEG2RAD * Math.sin(M)
  var b = 5.128 * DEG2RAD * Math.sin(F)
  var dt = 385001.0 - 20905.0 * Math.cos(M)

  var dec = Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l))
  var ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l))

  return {
    ra: ra,
    dec: dec,
    dist: dt,
    lonDeg: normDeg(l * RAD2DEG)
  }
}

function getMoonPosition(date, lat, lon) {
  var lw = -lon * DEG2RAD
  var phi = lat * DEG2RAD
  var d = toDays(date)
  var c = moonCoords(d)
  var H = siderealTime(d, lw) - c.ra
  var h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H))
  // Geocentric parallax correction
  h = h + (0.017 * DEG2RAD) * Math.cos(h)
  var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + Math.PI

  return {
    altitude: h * RAD2DEG,
    azimuth: normDeg(az * RAD2DEG),
    distanceKm: Math.round(c.dist),
    eclipticLon: c.lonDeg
  }
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
function findNextLunarPhaseDate(now, targetPhase) {
  var current = getMoonIllumination(now).phase
  var diff = targetPhase - current
  if (diff <= 0.005) diff += 1.0
  var estMs = now.getTime() + diff * SYNODIC_MONTH * DAY_MS

  // Refine with 4 Newton-style steps on the phase curve
  for (var i = 0; i < 4; i++) {
    var p = getMoonIllumination(new Date(estMs)).phase
    var delta = targetPhase - p
    if (delta > 0.5) delta -= 1.0
    if (delta < -0.5) delta += 1.0
    estMs += delta * SYNODIC_MONTH * DAY_MS
  }
  return new Date(estMs)
}

function computeLunarSummary(now, lat, lon) {
  var illum = getMoonIllumination(now)
  var pos = getMoonPosition(now, lat, lon)
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
