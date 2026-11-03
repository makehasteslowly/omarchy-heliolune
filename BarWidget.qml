import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "makehasteslowly.heliolune"
  readonly property string pluginId: "makehasteslowly.heliolune"

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  // ---- User settings with live local overrides for instant click feedback
  property string localDisplayModeOverride: ""
  readonly property string configuredDisplayMode: {
    var v = String(setting("displayMode", "both")).toLowerCase()
    if (v === "both" || v === "compact" || v === "detailed" || v === "dynamic" || v === "lunar" || v === "solar") return v
    return "both"
  }
  readonly property string displayMode: root.localDisplayModeOverride !== ""
    ? root.localDisplayModeOverride
    : root.configuredDisplayMode

  property string localColorModeOverride: ""
  readonly property string configuredColorMode: {
    var v = String(setting("colorMode", "celestial")).toLowerCase()
    if (v === "celestial" || v === "bold" || v === "theme") return v
    return "celestial"
  }
  readonly property string colorMode: root.localColorModeOverride !== ""
    ? root.localColorModeOverride
    : root.configuredColorMode
  readonly property bool useThemeColors: root.colorMode === "theme"
  readonly property bool useBoldColors: root.colorMode === "bold"

  property string localMoonStyleOverride: ""
  readonly property string configuredMoonStyle: {
    var v = String(setting("moonStyle", "atomic")).toLowerCase()
    if (v === "atomic" || v === "deco" || v === "nouveau") return v
    return "atomic"   // retired "vector"/"glyph" styles land on the default theme
  }
  readonly property string moonStyle: root.localMoonStyleOverride !== ""
    ? root.localMoonStyleOverride
    : root.configuredMoonStyle

  // Current weather next to the city: "auto" (unit from locale), "c", "f", or "off"
  property string localWeatherOverride: ""
  readonly property string configuredWeather: {
    var v = String(setting("weather", "auto")).toLowerCase()
    if (v === "auto" || v === "c" || v === "f" || v === "off") return v
    return "auto"
  }
  readonly property string weatherMode: root.localWeatherOverride !== "" ? root.localWeatherOverride : root.configuredWeather
  readonly property bool weatherEnabled: root.weatherMode !== "off"
  readonly property bool weatherImperial: root.weatherMode === "f"
    || (root.weatherMode === "auto" && Qt.locale().measurementSystem === Locale.ImperialUSSystem)
  onConfiguredWeatherChanged: root.localWeatherOverride = ""

  property string localTimeFormatOverride: ""
  readonly property string configuredTimeFormat: {
    var v = String(setting("timeFormat", "auto")).toLowerCase()
    if (v === "auto" || v === "12" || v === "24") return v
    return "auto"
  }
  readonly property string timeFormatMode: root.localTimeFormatOverride !== ""
    ? root.localTimeFormatOverride
    : root.configuredTimeFormat

  onConfiguredDisplayModeChanged: root.localDisplayModeOverride = ""
  onConfiguredColorModeChanged: root.localColorModeOverride = ""
  onConfiguredMoonStyleChanged: root.localMoonStyleOverride = ""
  onConfiguredTimeFormatChanged: root.localTimeFormatOverride = ""

  // ---- Bar & Popup background luminance detection for light/dark theme contrast
  readonly property color effectiveBarBg: {
    var bg = (Color.bar && Color.bar.background !== undefined) ? Color.bar.background : Color.background
    return (bg.a !== undefined && bg.a < 0.25) ? Color.background : bg
  }
  readonly property real barLuminance: 0.2126 * root.effectiveBarBg.r + 0.7152 * root.effectiveBarBg.g + 0.0722 * root.effectiveBarBg.b
  readonly property bool isLightBar: root.barLuminance > 0.48

  readonly property color effectivePopupBg: {
    var pbg = (Color.popups && Color.popups.background !== undefined) ? Color.popups.background : Color.background
    return (pbg.a !== undefined && pbg.a < 0.25) ? Color.background : pbg
  }
  readonly property real popupLuminance: 0.2126 * root.effectivePopupBg.r + 0.7152 * root.effectivePopupBg.g + 0.0722 * root.effectivePopupBg.b
  readonly property bool isLightPopup: root.popupLuminance > 0.48

  function resolveBlueHourColor(forPopup) {
    var onLight = forPopup ? root.isLightPopup : root.isLightBar
    if (root.ornatePalette) return root.ornBlueHourFor(onLight, root.surfaceBg(forPopup))
    if (root.useThemeColors) {
      return Color.accent
    }
    var hex = root.useBoldColors
      ? (onLight ? "#1D4ED8" : "#3B82F6")
      : (onLight ? "#2563EB" : "#60A5FA")
    return Qt.color(hex)
  }

  function resolveSolarColor(forPopup, isDaytime) {
    if (root.solarData && root.solarData.isBlueHour) {
      return root.resolveBlueHourColor(forPopup)
    }
    var onLight = forPopup ? root.isLightPopup : root.isLightBar
    if (root.useThemeColors) {
      if (!forPopup && Color.bar && Color.bar.active !== undefined) return Color.bar.active
      return Color.accent
    }
    if (root.ornatePalette) return isDaytime === false
      ? root.ornNightSunFor(onLight, root.surfaceBg(forPopup))
      : root.ornSunFor(onLight, root.surfaceBg(forPopup))
    var hex
    if (isDaytime === false) {
      // Twilight / solar night warm-amber or soft dusk indigo
      hex = root.useBoldColors
        ? (onLight ? "#D97706" : "#F59E0B")
        : (onLight ? "#B45309" : "#FBBF24")
    } else {
      hex = root.useBoldColors
        ? (onLight ? "#D95300" : "#FFB800")
        : (onLight ? "#C25E00" : "#FACC15")
    }
    return Qt.color(hex)
  }

  function resolveLunarColor(forPopup) {
    var onLight = forPopup ? root.isLightPopup : root.isLightBar
    if (root.useThemeColors) {
      if (!forPopup && Color.bar && Color.bar.text !== undefined) return Color.bar.text
      return Color.foreground
    }
    if (root.ornatePalette) return root.ornPrimaryFor(onLight, root.surfaceBg(forPopup))
    var hex = root.useBoldColors
      ? (onLight ? "#0284C7" : "#38BDF8")
      : (onLight ? "#334155" : "#93C5FD")
    return Qt.color(hex)
  }

  function resolveLunarLitColor(forPopup) {
    var onLight = forPopup ? root.isLightPopup : root.isLightBar
    if (root.useThemeColors) {
      return Color.accent
    }
    if (root.ornatePalette) return root.ornMoonlitFor(onLight, root.surfaceBg(forPopup))
    var hex = root.useBoldColors
      ? (onLight ? "#0284C7" : "#7DD3FC")
      : (onLight ? "#475569" : "#E2E8F0")
    return Qt.color(hex)
  }

  // ---- Location state (Manual settings -> Omarchy weather.json -> IP geo -> Timezone database -> UTC-offset estimate)
  property var weatherLocationState: ({ name: "", latitude: null, longitude: null })
  property var detectedLocationState: ({ name: "", latitude: null, longitude: null })
  property bool detectingGeo: false
  property string systemTimezone: ""
  property string zoneTabText: ""
  readonly property var timezoneLocationState: Model.parseZoneTab(root.zoneTabText, root.systemTimezone)

  readonly property var effectiveLocation: Model.resolveLocation(root.settings, root.weatherLocationState, root.detectedLocationState, root.timezoneLocationState)
  readonly property real activeLat: effectiveLocation.latitude
  readonly property real activeLon: effectiveLocation.longitude
  readonly property string activeLocationName: effectiveLocation.name

  FileView {
    id: weatherLocationFile
    path: Quickshell.env("HOME") + "/.local/state/omarchy/settings/weather.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      root.weatherLocationState = Model.parseLocationFile(text())
      root.weatherLocationChecked = true
      root.checkAutoGeo(false)
      root.recalculate()
    }
    onLoadFailed: {
      root.weatherLocationState = Model.parseLocationFile("")
      root.weatherLocationChecked = true
      root.checkAutoGeo(false)
      root.recalculate()
    }
  }

  // Offline location estimate: the system timezone's reference city from the tz database
  Process {
    id: tzProc
    running: true
    command: ["readlink", "-f", "/etc/localtime"]
    stdout: StdioCollector {
      onStreamFinished: {
        root.systemTimezone = Model.timezoneFromLocaltimeLink(text)
        root.recalculate()
      }
    }
  }

  FileView {
    id: zoneTabFile
    path: "/usr/share/zoneinfo/zone1970.tab"
    printErrors: false
    onLoaded: {
      root.zoneTabText = text()
      root.recalculate()
    }
  }

  // ---- Automatic IP geolocation: cached across restarts, retried with backoff while offline,
  // and refreshed periodically so the widget follows the user when they travel.
  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")
  readonly property string locationCacheDir: root.stateHome + "/omarchy/makehasteslowly.heliolune"
  readonly property int geoRefreshMs: 3 * 3600000
  readonly property int geoMaxBackoffMs: 15 * 60000
  property real geoFetchedAt: 0
  property real geoNextRetryAt: 0
  property int geoFailures: 0
  property bool geoSucceeded: false
  property bool locationCacheChecked: false
  property bool weatherLocationChecked: false

  // Only needed when the user hasn't pinned a location (manual override or Omarchy Weather)
  function geoWanted() {
    var src = root.effectiveLocation.source
    return src !== "manual" && src !== "weather"
  }

  function checkAutoGeo(force) {
    // Wait for weather.json and the cached lookup so a pinned or fresh location isn't refetched on every login
    if (!root.locationCacheChecked || !root.weatherLocationChecked || !root.geoWanted() || root.detectingGeo || geoProc.running) return
    var now = Date.now()
    var stale = root.detectedLocationState.latitude === null || (now - root.geoFetchedAt) > root.geoRefreshMs
    if (!force && (!stale || now < root.geoNextRetryAt)) return
    root.detectingGeo = true
    root.geoSucceeded = false
    tzProc.running = true   // re-read the system timezone too, in case it changed
    geoProc.running = true
  }

  Process {
    id: geoProc
    command: ["curl", "-fsS", "--max-time", "6", "https://geo.omarchy.org/"]
    stdout: StdioCollector {
      onStreamFinished: {
        var parsed = Model.parseLocationFile(text)
        if (parsed.latitude !== null && parsed.longitude !== null) {
          root.geoSucceeded = true
          root.geoFailures = 0
          root.geoNextRetryAt = 0
          root.geoFetchedAt = Date.now()
          root.detectedLocationState = parsed
          cacheWriteProc.payload = JSON.stringify({
            name: parsed.name,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            fetchedAt: root.geoFetchedAt
          })
          cacheWriteProc.running = true
          root.recalculate()
        }
      }
    }
    onExited: {
      root.detectingGeo = false
      if (!root.geoSucceeded) {
        // Offline or blocked: back off 1, 2, 4, 8, then every 15 minutes
        root.geoFailures += 1
        var delay = Math.min(root.geoMaxBackoffMs, 60000 * Math.pow(2, root.geoFailures - 1))
        root.geoNextRetryAt = Date.now() + delay
      }
    }
  }

  // ---- Current weather from Open-Meteo: only while enabled, every 30 minutes and
  // when the location changes. Coordinates are validated and rounded in Model.js.
  readonly property int weatherRefreshMs: 30 * 60000
  property var weatherNow: null
  property real weatherFetchedAt: 0
  property string weatherFetchedFor: ""
  readonly property string weatherLocationKey: root.activeLat.toFixed(2) + "," + root.activeLon.toFixed(2)

  function fetchWeather(force) {
    if (!root.weatherEnabled || weatherProc.running) return
    var url = Model.weatherUrl(root.activeLat, root.activeLon)
    if (url === "") return
    var fresh = root.weatherFetchedFor === root.weatherLocationKey && (Date.now() - root.weatherFetchedAt) < root.weatherRefreshMs
    if (!force && fresh) return
    weatherProc.command = ["curl", "-fsS", "--max-time", "5", "--max-filesize", String(Model.WEATHER_MAX_BYTES), url]
    weatherProc.requestedFor = root.weatherLocationKey
    weatherProc.running = true
  }

  onWeatherLocationKeyChanged: weatherDebounce.restart()
  onWeatherEnabledChanged: if (!root.weatherEnabled) root.weatherNow = null

  Timer {
    id: weatherDebounce
    interval: 1500
    onTriggered: root.fetchWeather(false)
  }

  Timer {
    interval: root.weatherRefreshMs
    running: root.weatherEnabled
    repeat: true
    triggeredOnStart: true
    onTriggered: root.fetchWeather(false)
  }

  Process {
    id: weatherProc
    property string requestedFor: ""
    onExited: function(code) { if (code !== 0) console.warn("heliolune: weather fetch failed (curl exit " + code + ")") }
    stdout: StdioCollector {
      onStreamFinished: {
        var w = Model.parseCurrentWeather(text)
        if (!w) console.warn("heliolune: weather response rejected")
        if (w && weatherProc.requestedFor === root.weatherLocationKey) {
          console.log("heliolune: weather updated")
          root.weatherNow = w
          root.weatherFetchedAt = Date.now()
          root.weatherFetchedFor = weatherProc.requestedFor
        }
      }
    }
  }

  readonly property string weatherText: root.weatherNow && root.weatherEnabled
    ? Model.formatTemperature(root.weatherNow.tempC, root.weatherImperial) + " " + strings.t("weather." + root.weatherNow.key)
    : ""

  // Atomic cache write that also creates the state directory on first use
  Process {
    id: cacheWriteProc
    property string payload: ""
    command: ["sh", "-c", "mkdir -p \"$1\" && printf '%s\\n' \"$2\" > \"$1/location.json.tmp\" && mv -f \"$1/location.json.tmp\" \"$1/location.json\"",
              "heliolune-cache", root.locationCacheDir, cacheWriteProc.payload]
  }

  // Last successful lookup, used immediately at startup (even offline) until a fresh one arrives
  FileView {
    id: locationCacheFile
    path: root.locationCacheDir + "/location.json"
    printErrors: false
    onLoaded: {
      var cached = Model.parseLocationFile(text())
      if (cached.latitude !== null && cached.longitude !== null && root.detectedLocationState.latitude === null) {
        root.detectedLocationState = cached
        root.geoFetchedAt = cached.fetchedAt
        root.recalculate()
      }
      root.locationCacheChecked = true
      root.checkAutoGeo(false)
    }
    onLoadFailed: {
      root.locationCacheChecked = true
      root.checkAutoGeo(false)
    }
  }

  // ---- Astronomical state
  property date currentDate: new Date()
  property var solarData: Model.computeSolarSummary(currentDate, activeLat, activeLon)
  property var lunarData: Model.computeLunarSummary(currentDate, activeLat, activeLon)
  property var seasonData: Model.computeSeasonSummary(currentDate, activeLat)
  property var skySamples: []
  property var analemmaData: null
  property string analemmaKey: ""

  readonly property var formatLocale: Qt.locale(Commons.I18n.formatLocale)

  // Next moonrise and moonset in time order, e.g. "↑ 6:12 PM  ↓ 8:40 AM"
  readonly property string moonRiseSetText: {
    var L = root.lunarData
    if (!L) return ""
    var ev = []
    if (L.nextMoonrise) ev.push({ t: L.nextMoonrise, mark: "↑" })
    if (L.nextMoonset) ev.push({ t: L.nextMoonset, mark: "↓" })
    if (ev.length === 0) return L.moonAlwaysUp ? strings.t("lunar.alwaysUp") : strings.t("lunar.alwaysDown")
    ev.sort(function(a, b) { return a.t.getTime() - b.t.getTime() })
    var parts = []
    for (var i = 0; i < ev.length; i++) parts.push(ev[i].mark + Model.formatTime(ev[i].t, root.timeFormatMode, root.formatLocale))
    return parts.join(" ")
  }
  // The very next moon event, for the bar tooltip
  readonly property string nextMoonEventText: {
    var L = root.lunarData
    if (!L || (!L.nextMoonrise && !L.nextMoonset)) return ""
    var riseFirst = L.nextMoonrise && (!L.nextMoonset || L.nextMoonrise.getTime() < L.nextMoonset.getTime())
    var t = riseFirst ? L.nextMoonrise : L.nextMoonset
    return strings.t(riseFirst ? "lunar.moonriseAt" : "lunar.moonsetAt").arg(Model.formatTime(t, root.timeFormatMode, root.formatLocale))
  }

  // ---- Time travel: the popup can show any date; 0 = live. Closing the popup
  // snaps back to live so the bar never stays on a browsed date.
  property int viewOffsetDays: 0
  readonly property bool browsing: root.viewOffsetDays !== 0
  readonly property int maxViewOffsetDays: 3660

  function viewDateFor(now) {
    if (root.viewOffsetDays === 0) return now
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + root.viewOffsetDays,
      now.getHours(), now.getMinutes(), now.getSeconds())
  }

  function setViewOffset(days) {
    var d = Math.max(-root.maxViewOffsetDays, Math.min(root.maxViewOffsetDays, Math.round(days)))
    if (d === root.viewOffsetDays) return
    root.viewOffsetDays = d
    root.recalculate()
  }

  function stepView(days) { root.setViewOffset(root.viewOffsetDays + days) }

  // Jump to the calendar date of `target` (keeps the current time of day)
  function viewDate(target) {
    var now = new Date()
    var a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    var b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
    root.setViewOffset(Math.round((b - a) / 86400000))
  }

  function recalculate() {
    var now = root.viewDateFor(new Date())
    root.currentDate = now
    root.solarData = Model.computeSolarSummary(now, root.activeLat, root.activeLon)
    root.lunarData = Model.computeLunarSummary(now, root.activeLat, root.activeLon)
    root.seasonData = Model.computeSeasonSummary(now, root.activeLat)
    if (root.opened) {
      root.rebuildSkySamples(now)
      root.rebuildAnalemma(now)
    }
  }

  // The year's curve only changes with the date or the location
  function rebuildAnalemma(refDate) {
    var d = refDate || root.currentDate
    var key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate()
      + "@" + root.activeLat.toFixed(3) + "," + root.activeLon.toFixed(3)
    if (key === root.analemmaKey && root.analemmaData) return
    root.analemmaData = Model.computeAnalemma(d, root.activeLat, root.activeLon,
      root.analemmaData ? root.analemmaData.curveData : null)
    root.analemmaKey = key
  }

  function rebuildSkySamples(refDate) {
    var d = refDate || root.currentDate
    var samples = []
    var steps = 48
    for (var i = 0; i <= steps; i++) {
      var mins = (i / steps) * 1440.0
      var hr = Math.floor(mins / 60)
      var mn = Math.round(mins % 60)
      var sampleDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hr, mn, 0)
      var sPos = Model.getSunPosition(sampleDate, root.activeLat, root.activeLon)
      var mPos = Model.getMoonPosition(sampleDate, root.activeLat, root.activeLon)
      samples.push({
        fraction: i / steps,
        sunAlt: sPos.altitude,
        moonAlt: mPos.altitude
      })
    }
    root.skySamples = samples
  }

  onActiveLatChanged: root.recalculate()
  onActiveLonChanged: root.recalculate()

  Timer {
    id: minuteTimer
    interval: 60000
    running: true
    repeat: true
    onTriggered: {
      root.checkAutoGeo(false)
      root.recalculate()
    }
  }

  Component.onCompleted: {
    weatherLocationFile.reload()
    root.recalculate()
  }

  // ---- Popup state & Omarchy bar popout contract
  property bool opened: false
  property bool settingsOpen: false
  property bool editingCustomCoords: false
  property string customLatInput: ""
  property string customLonInput: ""
  property string customNameInput: ""

  function open() {
    barButton.hideOwnTooltip()
    root.settingsOpen = false
    root.recalculate()
    root.rebuildSkySamples(root.currentDate)
    root.rebuildAnalemma(root.currentDate)
    root.fetchWeather(false)
    root.opened = true
  }

  function close() {
    root.opened = false
    root.settingsOpen = false
    root.editingCustomCoords = false
  }

  function togglePanel() {
    if (root.opened && !root.settingsOpen) {
      root.close()
    } else {
      root.open()
    }
  }

  function toggleSettings() {
    if (root.opened && root.settingsOpen) {
      root.close()
    } else {
      root.recalculate()
      root.rebuildSkySamples(root.currentDate)
      root.customLatInput = String(setting("latitude", ""))
      root.customLonInput = String(setting("longitude", ""))
      root.customNameInput = String(setting("locationName", ""))
      root.settingsOpen = true
      root.opened = true
    }
  }

  function refresh() {
    root.fetchWeather(true)
    weatherLocationFile.reload()
    root.checkAutoGeo(true)
    root.recalculate()
  }

  // ---- Persist settings helper
  function saveBarSetting(key, value) {
    if (root.bar) {
      root.bar.run("omarchy-bar set " + Util.shellQuote(root.pluginId) + " " + Util.shellQuote(key) + " " + Util.shellQuote(String(value)))
    }
  }

  function selectDisplayMode(mode) {
    var m = (mode === "compact" || mode === "detailed" || mode === "dynamic" || mode === "lunar" || mode === "solar") ? mode : "both"
    root.localDisplayModeOverride = m
    root.saveBarSetting("displayMode", m)
  }

  function selectColorMode(mode) {
    var m = (mode === "bold" || mode === "theme") ? mode : "celestial"
    root.localColorModeOverride = m
    root.saveBarSetting("colorMode", m)
  }

  function selectMoonStyle(style) {
    var s = (style === "deco" || style === "nouveau") ? style : "atomic"
    root.localMoonStyleOverride = s
    root.saveBarSetting("moonStyle", s)
  }

  function selectWeather(mode) {
    var m = (mode === "c" || mode === "f" || mode === "off") ? mode : "auto"
    root.localWeatherOverride = m
    root.saveBarSetting("weather", m)
    if (m !== "off") root.fetchWeather(false)
  }

  function selectTimeFormat(fmt) {
    var f = (fmt === "12" || fmt === "24") ? fmt : "auto"
    root.localTimeFormatOverride = f
    root.saveBarSetting("timeFormat", f)
  }

  function applyCustomCoords(latStr, lonStr, nameStr) {
    var lat = parseFloat(String(latStr || "").trim())
    var lon = parseFloat(String(lonStr || "").trim())
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return false
    var cleanName = Model.sanitizeText(nameStr || "", 60)
    root.saveBarSetting("latitude", String(lat))
    root.saveBarSetting("longitude", String(lon))
    root.saveBarSetting("locationName", cleanName)
    root.editingCustomCoords = false
    return true
  }

  function clearCustomCoords() {
    root.saveBarSetting("latitude", "")
    root.saveBarSetting("longitude", "")
    root.saveBarSetting("locationName", "")
    root.customLatInput = ""
    root.customLonInput = ""
    root.customNameInput = ""
    root.editingCustomCoords = false
  }

  ShellIpc {
    target: "makehasteslowly.heliolune"

    function refresh(): void { root.broadcast("refresh") }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    // Time travel from scripts and keybindings: move the popup's date by n days
    // (negative goes back), or return it to today.
    function stepDays(n: int): void { root.stepView(n) }
    function today(): void { root.setViewOffset(0) }
  }

  // ============================================================================
  // Reusable Vector Moon Disc Component (Exact spherical terminator projection)
  // ============================================================================
  component MoonDisc: Canvas {
    id: moonCanvas
    property real phase: 0.5          // 0.0 = New, 0.25 = First Quarter, 0.5 = Full, 0.75 = Last Quarter
    property color litColor: "#E2E8F0"
    property color darkColor: Qt.rgba(0.12, 0.16, 0.24, 0.72)
    property color rimColor: Qt.rgba(0.75, 0.84, 0.96, 0.38)
    property bool showCraters: false
    property real discSize: 14
    property string renderStyle: "atomic"   // "atomic" | "deco" | "nouveau" ("vector" = plain disc)

    width: discSize
    height: discSize
    antialiasing: true

    onPhaseChanged: requestPaint()
    onLitColorChanged: requestPaint()
    onDarkColorChanged: requestPaint()
    onRimColorChanged: requestPaint()
    onDiscSizeChanged: requestPaint()
    onRenderStyleChanged: requestPaint()

    // Art Deco: lit side drawn as stepped horizontal bands (streamline stripes,
    // ziggurat terminator), framed by a double rim with diamond studs.
    function paintDeco(ctx, cx, cy, r) {
      var p = ((phase % 1.0) + 1.0) % 1.0
      var distFromNew = Math.min(p, 1.0 - p)
      var waxing = p <= 0.5
      var termScale = Math.cos(p * Math.PI * 2.0)
      var hero = r >= 16
      var medium = r >= 8

      // 1. Unlit base sphere
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2.0)
      ctx.fillStyle = String(darkColor)
      ctx.fill()

      // 2. Banded illuminated portion, clipped to the disc
      if (distFromNew > 0.012) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2.0)
        ctx.clip()

        var bands = hero ? 9 : (medium ? 5 : 4)
        var gap = hero ? 1.6 : 1.0
        var top = cy - r
        var bandH = (2.0 * r - gap * (bands - 1)) / bands
        var full = Math.abs(p - 0.5) < 0.015

        ctx.fillStyle = String(litColor)
        for (var b = 0; b < bands; b++) {
          var y0 = top + b * (bandH + gap)
          var dy = (y0 + bandH / 2.0) - cy
          var dx = Math.sqrt(Math.max(0.0, r * r - dy * dy))
          var x0, x1
          if (full) {
            x0 = cx - r - 1; x1 = cx + r + 1
          } else if (waxing) {
            x0 = cx + termScale * dx; x1 = cx + r + 1
          } else {
            x0 = cx - r - 1; x1 = cx - termScale * dx
          }
          if (x1 - x0 > 0.3) ctx.fillRect(x0, y0, x1 - x0, bandH)
        }

        // Faint concentric inner ring across the lit face
        if (hero) {
          ctx.beginPath()
          ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2.0)
          ctx.lineWidth = 1.0
          ctx.strokeStyle = String(Qt.alpha(darkColor, 0.35))
          ctx.stroke()
        }
        ctx.restore()
      }

      // 3. Outer rim (+ inner rim on larger discs for the double-line frame)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2.0)
      ctx.lineWidth = hero ? 1.4 : 1.1
      ctx.strokeStyle = String(rimColor)
      ctx.stroke()

      if (medium) {
        ctx.beginPath()
        ctx.arc(cx, cy, r - (hero ? 3.0 : 2.2), 0, Math.PI * 2.0)
        ctx.lineWidth = 0.8
        ctx.strokeStyle = String(Qt.alpha(rimColor, rimColor.a * 0.7))
        ctx.stroke()
      }

      // 4. Diamond studs at the compass points
      if (hero) {
        var s = 2.4
        ctx.fillStyle = String(Qt.alpha(rimColor, Math.min(1.0, rimColor.a * 1.8)))
        var pts = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]
        for (var k = 0; k < pts.length; k++) {
          var px = pts[k][0], py = pts[k][1]
          ctx.beginPath()
          ctx.moveTo(px, py - s)
          ctx.lineTo(px + s, py)
          ctx.lineTo(px, py + s)
          ctx.lineTo(px - s, py)
          ctx.closePath()
          ctx.fill()
        }
      }
    }

    // Atomic Age: a flat poster-colour moon circled by tilted orbits with
    // electrons riding them, plus sparkles on the larger discs.
    function paintAtomic(ctx, cx, cy, r) {
      var p = ((phase % 1.0) + 1.0) % 1.0
      var distFromNew = Math.min(p, 1.0 - p)
      var waxing = p <= 0.5
      var termScale = Math.cos(p * Math.PI * 2.0)
      var hero = r >= 16
      var medium = r >= 8
      var rd = hero ? r * 0.6 : (medium ? r * 0.7 : r)
      var orbitColor = String(Qt.alpha(rimColor, Math.min(1.0, rimColor.a * 1.7)))
      var orbits = hero ? [[-0.5, 0.9], [0.5, 4.0]] : (medium ? [[-0.45, 0.6]] : [])
      var rx = r - 0.6, ry = r * (hero ? 0.32 : 0.36)

      // Orbits, back halves (behind the moon)
      ctx.strokeStyle = orbitColor
      ctx.lineWidth = hero ? 1.1 : 0.9
      for (var o = 0; o < orbits.length; o++) root.ornOrbit(ctx, cx, cy, rx, ry, orbits[o][0], "back")

      // Moon: shadow, flat lit portion, limb
      ctx.beginPath()
      ctx.arc(cx, cy, rd, 0, Math.PI * 2.0)
      ctx.fillStyle = String(darkColor)
      ctx.fill()
      if (distFromNew > 0.012) {
        ctx.beginPath()
        if (Math.abs(p - 0.5) < 0.015) {
          ctx.arc(cx, cy, rd, 0, Math.PI * 2.0)
        } else {
          var steps = 32
          for (var i = 0; i <= steps; i++) {
            var dy = (-1.0 + (2.0 * i) / steps) * rd
            var dx = Math.sqrt(Math.max(0.0, rd * rd - dy * dy))
            var xl = cx + (waxing ? dx : -dx)
            if (i === 0) ctx.moveTo(xl, cy + dy)
            else ctx.lineTo(xl, cy + dy)
          }
          for (var j = steps; j >= 0; j--) {
            var dyj = (-1.0 + (2.0 * j) / steps) * rd
            var dxj = Math.sqrt(Math.max(0.0, rd * rd - dyj * dyj))
            ctx.lineTo(cx + (waxing ? termScale * dxj : -termScale * dxj), cy + dyj)
          }
          ctx.closePath()
        }
        ctx.fillStyle = String(litColor)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(cx, cy, rd, 0, Math.PI * 2.0)
      ctx.lineWidth = hero ? 1.2 : 1.0
      ctx.strokeStyle = String(rimColor)
      ctx.stroke()

      // Orbits, front halves, and their electrons
      ctx.strokeStyle = orbitColor
      ctx.lineWidth = hero ? 1.1 : 0.9
      ctx.fillStyle = orbitColor
      for (var f = 0; f < orbits.length; f++) {
        root.ornOrbit(ctx, cx, cy, rx, ry, orbits[f][0], "front")
        var pt = root.ornOrbitPoint(cx, cy, rx, ry, orbits[f][0], orbits[f][1])
        ctx.beginPath()
        ctx.arc(pt[0], pt[1], hero ? 1.9 : 1.3, 0, Math.PI * 2.0)
        ctx.fill()
      }

      // Sparkles
      if (hero) {
        var sparks = [[cx + r * 0.78, cy - r * 0.78, 3.6], [cx - r * 0.82, cy + r * 0.74, 2.6]]
        ctx.strokeStyle = String(litColor)
        ctx.lineWidth = 1.0
        for (var k = 0; k < sparks.length; k++) {
          var sx = sparks[k][0], sy = sparks[k][1], sr = sparks[k][2]
          ctx.beginPath()
          ctx.moveTo(sx - sr, sy); ctx.lineTo(sx + sr, sy)
          ctx.moveTo(sx, sy - sr); ctx.lineTo(sx, sy + sr)
          ctx.stroke()
        }
      }
    }

    // Art Nouveau: softly shaded moon inside a beaded Mucha halo, with a vine
    // tendril and leaves winding across the lower limb on larger discs.
    function paintNouveau(ctx, cx, cy, r) {
      var p = ((phase % 1.0) + 1.0) % 1.0
      var distFromNew = Math.min(p, 1.0 - p)
      var waxing = p <= 0.5
      var termScale = Math.cos(p * Math.PI * 2.0)
      var hero = r >= 16
      var medium = r >= 8
      var rd = hero ? r - 3.5 : (medium ? r - 1.8 : r)
      var accent = Qt.alpha(rimColor, Math.min(1.0, rimColor.a * 1.8))

      // Halo rings (behind the disc)
      if (medium) {
        ctx.beginPath()
        ctx.arc(cx, cy, r - 0.6, 0, Math.PI * 2.0)
        ctx.lineWidth = 0.9
        ctx.strokeStyle = String(Qt.alpha(rimColor, rimColor.a * 0.8))
        ctx.stroke()
        if (hero) {
          ctx.fillStyle = String(accent)
          for (var b = 0; b < 12; b++) {
            var ba = b * Math.PI / 6.0 + Math.PI / 12.0
            ctx.beginPath()
            ctx.arc(cx + Math.cos(ba) * (r - 0.6), cy + Math.sin(ba) * (r - 0.6), 0.95, 0, Math.PI * 2.0)
            ctx.fill()
          }
        }
      }

      // 1. Unlit base sphere
      ctx.beginPath()
      ctx.arc(cx, cy, rd, 0, Math.PI * 2.0)
      ctx.fillStyle = String(darkColor)
      ctx.fill()

      // 2. Softly shaded lit portion (same exact terminator as the vector disc)
      if (distFromNew > 0.012) {
        ctx.beginPath()
        if (Math.abs(p - 0.5) < 0.015) {
          ctx.arc(cx, cy, rd, 0, Math.PI * 2.0)
        } else {
          var steps = 36
          for (var i = 0; i <= steps; i++) {
            var dy = (-1.0 + (2.0 * i) / steps) * rd
            var dx = Math.sqrt(Math.max(0.0, rd * rd - dy * dy))
            var xl = cx + (waxing ? dx : -dx)
            if (i === 0) ctx.moveTo(xl, cy + dy)
            else ctx.lineTo(xl, cy + dy)
          }
          for (var j = steps; j >= 0; j--) {
            var dyj = (-1.0 + (2.0 * j) / steps) * rd
            var dxj = Math.sqrt(Math.max(0.0, rd * rd - dyj * dyj))
            ctx.lineTo(cx + (waxing ? termScale * dxj : -termScale * dxj), cy + dyj)
          }
          ctx.closePath()
        }
        var grad = ctx.createRadialGradient(cx - rd * 0.35, cy - rd * 0.35, rd * 0.1, cx, cy, rd)
        grad.addColorStop(0, String(Qt.lighter(litColor, 1.08)))
        grad.addColorStop(1, String(Qt.darker(litColor, 1.18)))
        ctx.fillStyle = grad
        ctx.fill()
      }

      // 3. Limb
      ctx.beginPath()
      ctx.arc(cx, cy, rd, 0, Math.PI * 2.0)
      ctx.lineWidth = hero ? 1.2 : 1.0
      ctx.strokeStyle = String(rimColor)
      ctx.stroke()

      // 4. Vine tendril with leaves and a curl (hero disc only)
      if (hero) {
        ctx.strokeStyle = String(accent)
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(cx - rd * 1.05, cy + rd * 0.35)
        ctx.bezierCurveTo(cx - rd * 0.55, cy + rd * 1.15, cx + rd * 0.15, cy + rd * 0.35, cx + rd * 0.72, cy + rd * 0.95)
        ctx.stroke()
        root.ornCurl(ctx, cx + rd * 0.72, cy + rd * 0.95, 3.0, Math.PI * 1.25, 0.9, true)
        ctx.fillStyle = String(accent)
        root.ornLeaf(ctx, cx - rd * 0.62, cy + rd * 0.78, 2.3, 6.5, 2.4)
        root.ornLeaf(ctx, cx - rd * 0.12, cy + rd * 0.72, -1.1, 6.0, 2.2)
        root.ornLeaf(ctx, cx + rd * 0.38, cy + rd * 0.66, 0.9, 5.5, 2.0)
      }
    }

    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()

      var w = width
      var h = height
      var cx = w / 2.0
      var cy = h / 2.0
      var r = Math.max(2.0, Math.min(w, h) / 2.0 - 1.0)

      if (renderStyle === "nouveau") {
        paintNouveau(ctx, cx, cy, r)
        return
      }

      if (renderStyle === "atomic") {
        paintAtomic(ctx, cx, cy, r)
        return
      }

      if (renderStyle === "deco") {
        // Leave room for the diamond studs on the hero disc
        paintDeco(ctx, cx, cy, r >= 16 ? r - 1.5 : r)
        return
      }

      // 1. Unlit base sphere
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2.0)
      ctx.fillStyle = String(darkColor)
      ctx.fill()

      // 2. Illuminated portion with exact spherical terminator
      var p = ((phase % 1.0) + 1.0) % 1.0
      var distFromNew = Math.min(p, 1.0 - p)

      if (distFromNew > 0.012) {
        ctx.beginPath()
        if (Math.abs(p - 0.5) < 0.015) {
          // Full moon
          ctx.arc(cx, cy, r, 0, Math.PI * 2.0)
        } else {
          var steps = 36
          var waxing = p <= 0.5
          // cos(2*pi*p): +1 at New, 0 at Quarter, -1 at Full
          var termScale = Math.cos(p * Math.PI * 2.0)

          // Outer lit limb from top (-r) to bottom (+r)
          for (var i = 0; i <= steps; i++) {
            var t = -1.0 + (2.0 * i) / steps
            var dy = t * r
            var dx = Math.sqrt(Math.max(0.0, r * r - dy * dy))
            var xLimb = cx + (waxing ? dx : -dx)
            var yLimb = cy + dy
            if (i === 0) ctx.moveTo(xLimb, yLimb)
            else ctx.lineTo(xLimb, yLimb)
          }

          // Return along terminator from bottom (+r) to top (-r)
          for (var j = steps; j >= 0; j--) {
            var tj = -1.0 + (2.0 * j) / steps
            var dyj = tj * r
            var dxj = Math.sqrt(Math.max(0.0, r * r - dyj * dyj))
            var xTerm = cx + (waxing ? (termScale * dxj) : (-termScale * dxj))
            var yTerm = cy + dyj
            ctx.lineTo(xTerm, yTerm)
          }
          ctx.closePath()
        }
        ctx.fillStyle = String(litColor)
        ctx.fill()

        // Optional subtle lunar maria / craters on hero disc
        if (showCraters && r >= 16) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2.0)
          ctx.clip()

          ctx.fillStyle = Qt.rgba(0.08, 0.11, 0.18, 0.16)
          ctx.beginPath()
          ctx.arc(cx - r * 0.28, cy - r * 0.22, r * 0.22, 0, Math.PI * 2.0)
          ctx.fill()

          ctx.beginPath()
          ctx.arc(cx + r * 0.18, cy - r * 0.14, r * 0.17, 0, Math.PI * 2.0)
          ctx.fill()

          ctx.beginPath()
          ctx.arc(cx + r * 0.25, cy + r * 0.22, r * 0.14, 0, Math.PI * 2.0)
          ctx.fill()

          ctx.beginPath()
          ctx.arc(cx - r * 0.15, cy + r * 0.30, r * 0.12, 0, Math.PI * 2.0)
          ctx.fill()
          ctx.restore()
        }
      }

      // 3. Crisp outer limb ring so even New Moon is clearly visible
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2.0)
      ctx.lineWidth = r >= 16 ? 1.4 : 1.1
      ctx.strokeStyle = String(rimColor)
      ctx.stroke()
    }
  }

  // ============================================================================
  // Ornamental themes: Art Deco and Art Nouveau (follow the moon renderer)
  // ============================================================================
  readonly property bool decoStyle: root.moonStyle === "deco"
  readonly property bool nouveauStyle: root.moonStyle === "nouveau"
  readonly property bool atomicStyle: root.moonStyle === "atomic"
  readonly property bool ornate: root.decoStyle || root.nouveauStyle || root.atomicStyle
  // Soft/Bold pick the palette's intensity; Theme mode keeps the Omarchy theme colours.
  readonly property bool ornatePalette: root.ornate && !root.useThemeColors

  // Each colour: [soft on dark, soft on light, bold on dark, bold on light]
  readonly property var ornPalettes: ({
    // "Emerald & Ruby Deco": saturated jewels on black lacquer, bright gold as the metal
    deco: {
      metal:    ["#F2C94C", "#946B00", "#FFD23F", "#A87800"],
      primary:  ["#10C47E", "#007A4D", "#00F5A0", "#008F5A"],
      sun:      ["#FF2B2B", "#D10014", "#FF1A3C", "#E0001E"],
      nightSun: ["#E01445", "#A3002E", "#FF2D6F", "#C4003F"],
      moonlit:  ["#C9FBE4", "#007A4D", "#9DFFD6", "#008F5A"],
      blueHour: ["#14D6BA", "#007F70", "#00FFE0", "#008C7C"],
      flower:   ["#FF2B2B", "#D10014", "#FF1A3C", "#E0001E"],
      light: "#FFF6DD", dark: "#030605",
      shadow: [0.0, 0.03, 0.02], shadowLight: [0.0, 0.30, 0.19], card: [0.0, 0.05, 0.035],
      cardAlpha: 0.62, borderAlpha: 0.85, selectTextDark: true,
      // card surfaces on dark popups: Soft = dusty slate-green, Bold = emerald lacquer
      cardSoft: ["#24302C", 0.62], cardBold: ["#00301F", 0.9]
    },
    // "Mucha Botanical": sage and olive, dusty rose, amber, cream, bronze as the metal
    nouveau: {
      metal:    ["#C9A36B", "#7A5A2E", "#E0A84A", "#8A5B12"],
      primary:  ["#8FB08A", "#4F7A4A", "#A6D98A", "#3E7D2C"],
      sun:      ["#E3A34A", "#A8641A", "#FFB238", "#B86A00"],
      nightSun: ["#C77B86", "#9A4A5A", "#FF7A98", "#B8304F"],
      moonlit:  ["#F1E6CC", "#7A6A3E", "#FFF1C9", "#8A6F1E"],
      blueHour: ["#9FA8D6", "#5A63A0", "#AEB8FF", "#4652C2"],
      flower:   ["#D98C8C", "#A84F5A", "#FF8FA3", "#C2304A"],
      light: "#F6EEDB", dark: "#17140C",
      shadow: [0.07, 0.07, 0.04], shadowLight: [0.30, 0.28, 0.12], card: [0.07, 0.07, 0.04],
      // Soft = warm olive-grey, Bold = deep moss
      cardSoft: ["#302D24", 0.62], cardBold: ["#1B3010", 0.9]
    },
    // "Atomic Age": 1950s teal, atomic orange, mustard and cream on walnut
    atomic: {
      metal:    ["#E9C46A", "#9A7414", "#FFC93C", "#A87C00"],
      primary:  ["#2A9D8F", "#1E7A70", "#1FC7B4", "#138A7C"],
      sun:      ["#E76F51", "#C2492E", "#FF6B3D", "#D9461F"],
      nightSun: ["#C8553D", "#A23E2D", "#FF4F6D", "#C0294A"],
      moonlit:  ["#F4EBD0", "#7A5A2E", "#FFF4DA", "#8A5B12"],
      blueHour: ["#6EC5E9", "#2A7FA8", "#5BD1FF", "#1F78B4"],
      flower:   ["#F4A261", "#C2632A", "#FF9F43", "#D2691E"],
      light: "#F4EBD0", dark: "#1E1712",
      shadow: [0.10, 0.08, 0.06], shadowLight: [0.24, 0.17, 0.12], card: [0.12, 0.09, 0.07],
      // Soft = warm walnut-grey, Bold = deep atomic teal
      cardSoft: ["#332B25", 0.62], cardBold: ["#04332F", 0.9]
    }
  })
  readonly property var ornPal: root.atomicStyle ? root.ornPalettes.atomic
    : (root.nouveauStyle ? root.ornPalettes.nouveau : root.ornPalettes.deco)

  function ornHex(soft, softLight, bold, boldLight, onLight) {
    return Qt.color(root.useBoldColors ? (onLight ? boldLight : bold) : (onLight ? softLight : soft))
  }
  // ---- Adaptive contrast: palette colours are nudged toward black (light
  // surfaces) or white (dark surfaces) until they meet a WCAG contrast target
  // against the actual bar/popup background of the active Omarchy theme.
  function surfaceBg(forPopup) { return forPopup ? root.effectivePopupBg : root.effectiveBarBg }
  function ornLum(c) {
    function ch(x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
  }
  function ornContrast(a, b) {
    var la = root.ornLum(a), lb = root.ornLum(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }
  function ornEnsure(c, bg, target) {
    var col = Qt.color(c)
    var back = Qt.color(bg)
    var toward = root.ornLum(back) > 0.18 ? 0.0 : 1.0
    for (var i = 0; i < 16 && root.ornContrast(col, back) < target; i++) {
      col = Qt.rgba(col.r + (toward - col.r) * 0.1, col.g + (toward - col.g) * 0.1, col.b + (toward - col.b) * 0.1, col.a)
    }
    return col
  }
  // Text-bearing roles need 4.5:1; purely decorative accents 3:1.
  readonly property var ornContrastTargets: ({ flower: 3.0 })
  // Soft vs Bold are pulled apart on purpose: Soft is muted and slightly dimmed
  // (antique print), Bold is pushed to full saturation (poster ink).
  function ornIntensify(c, onLight) {
    if (c.hslHue < 0) return c   // greys stay greys
    if (root.useBoldColors) {
      return Qt.hsla(c.hslHue, Math.min(1.0, c.hslSaturation * 1.2 + 0.08), c.hslLightness, c.a)
    }
    return Qt.hsla(c.hslHue, c.hslSaturation * 0.55,
      onLight ? c.hslLightness : c.hslLightness * 0.88 + 0.03, c.a)
  }
  // Ornament weight: (soft, bold) opacity pairs for borders, rules and fills.
  function ornA(soft, bold) { return root.useBoldColors ? bold : soft }

  function ornPick(key, onLight, bg) {
    var v = root.ornPal[key]
    var base = root.ornIntensify(root.ornHex(v[0], v[1], v[2], v[3], onLight), onLight)
    var surface = bg !== undefined ? bg : root.surfaceBg(true)
    return root.ornEnsure(base, surface, root.ornContrastTargets[key] || 4.5)
  }
  function ornPrimaryFor(onLight, bg)  { return root.ornPick("primary", onLight, bg) }
  function ornSunFor(onLight, bg)      { return root.ornPick("sun", onLight, bg) }
  function ornNightSunFor(onLight, bg) { return root.ornPick("nightSun", onLight, bg) }
  function ornMoonlitFor(onLight, bg)  { return root.ornPick("moonlit", onLight, bg) }
  function ornBlueHourFor(onLight, bg) { return root.ornPick("blueHour", onLight, bg) }

  readonly property color ornMetal: root.useThemeColors ? Color.accent : root.ornPick("metal", root.isLightPopup)
  readonly property color ornPrimary: root.ornPrimaryFor(root.isLightPopup)
  readonly property color ornAccent: root.ornSunFor(root.isLightPopup)
  readonly property color ornFlower: root.useThemeColors ? Color.accent : root.ornPick("flower", root.isLightPopup)
  readonly property color ornLight: root.ornPal.light
  readonly property color ornDark: root.ornPal.dark
  readonly property color ornInk: root.useThemeColors
    ? Color.background
    : (root.isLightPopup ? "#FBF6E9" : "#15120C")
  // Selected controls: primary jewel/foliage with light lettering (metal with ink in Theme mode)
  readonly property color ornSelectFill: root.ornatePalette ? root.ornPrimary : root.ornMetal
  // Lettering on selected controls: whichever of dark/light reads better on the fill
  readonly property color ornSelectText: root.ornContrast(root.ornSelectFill, root.ornDark) >= root.ornContrast(root.ornSelectFill, root.ornLight)
    ? root.ornDark
    : root.ornLight
  readonly property color ornNotch: root.ornatePalette ? root.ornMetal : root.ornInk
  // Card surfaces differ in hue and depth between Soft and Bold, not just opacity:
  // Soft is a lifted, low-saturation tone; Bold a deep, saturated jewel tone.
  readonly property color ornCardTint: {
    if (root.isLightPopup) {
      return root.useBoldColors ? Qt.alpha(root.ornPrimary, 0.17) : Qt.alpha(root.ornMetal, 0.06)
    }
    var c = root.useBoldColors ? root.ornPal.cardBold : root.ornPal.cardSoft
    return Qt.alpha(Qt.color(c[0]), c[1])
  }
  function ornMoonShadow(onLight, alpha) {
    // alpha is the caller's light-surface opacity; dark surfaces always get a deep shadow
    var c = onLight ? root.ornPal.shadowLight : root.ornPal.shadow
    return Qt.rgba(c[0], c[1], c[2], onLight ? Math.max(0.18, alpha * 0.8) : 0.86)
  }

  // ---- Shared Art Nouveau drawing helpers (called from Canvas onPaint handlers)
  // Almond leaf from (x, y) pointing along angle.
  function ornLeaf(ctx, x, y, angle, len, wid) {
    var tx = x + Math.cos(angle) * len, ty = y + Math.sin(angle) * len
    var nx = -Math.sin(angle) * wid, ny = Math.cos(angle) * wid
    var mx = (x + tx) / 2.0, my = (y + ty) / 2.0
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty)
    ctx.quadraticCurveTo(mx - nx, my - ny, x, y)
    ctx.closePath()
    ctx.fill()
  }
  // Tendril curl: a shrinking spiral of the given turns starting at (x, y).
  function ornCurl(ctx, x, y, radius, startAngle, turns, clockwise) {
    var steps = Math.max(8, Math.round(turns * 24))
    var dir = clockwise ? 1 : -1
    var cxs = x - Math.cos(startAngle) * radius, cys = y - Math.sin(startAngle) * radius
    ctx.beginPath()
    for (var i = 0; i <= steps; i++) {
      var t = i / steps
      var a = startAngle + dir * t * turns * Math.PI * 2.0
      var rr = radius * (1.0 - 0.72 * t)
      var px = cxs + Math.cos(a) * rr, py = cys + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  // Five-petal blossom.
  function ornBlossom(ctx, x, y, size, petal, heart) {
    ctx.fillStyle = petal
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2.0 + i * Math.PI * 2.0 / 5.0
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * size * 0.55, y + Math.sin(a) * size * 0.55, size * 0.42, 0, Math.PI * 2.0)
      ctx.fill()
    }
    ctx.fillStyle = heart
    ctx.beginPath()
    ctx.arc(x, y, size * 0.32, 0, Math.PI * 2.0)
    ctx.fill()
  }
  // Atomic starburst: alternating long and short rays around (x, y).
  function ornStarburst(ctx, x, y, radius, rays, color) {
    ctx.strokeStyle = color
    for (var i = 0; i < rays * 2; i++) {
      var a = i * Math.PI / rays
      var len = (i % 2 === 0) ? radius : radius * 0.5
      ctx.lineWidth = (i % 2 === 0) ? 1.2 : 0.9
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2)
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
      ctx.stroke()
    }
  }
  // Tilted orbit ellipse; part = "back" | "front" | "all" (top half is "back").
  function ornOrbit(ctx, x, y, rx, ry, tilt, part) {
    var a0 = part === "front" ? 0 : Math.PI
    var a1 = part === "back" ? Math.PI * 2.0 : (part === "front" ? Math.PI : Math.PI * 3.0)
    var steps = 40
    ctx.beginPath()
    for (var i = 0; i <= steps; i++) {
      var t = a0 + (a1 - a0) * i / steps
      var ex = Math.cos(t) * rx, ey = Math.sin(t) * ry
      var px = x + ex * Math.cos(tilt) - ey * Math.sin(tilt)
      var py = y + ex * Math.sin(tilt) + ey * Math.cos(tilt)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  function ornOrbitPoint(x, y, rx, ry, tilt, t) {
    var ex = Math.cos(t) * rx, ey = Math.sin(t) * ry
    return [x + ex * Math.cos(tilt) - ey * Math.sin(tilt), y + ex * Math.sin(tilt) + ey * Math.cos(tilt)]
  }
  // Boomerang: a swept chevron with rounded tips, apex at (x, y) pointing along angle.
  function ornBoomerang(ctx, x, y, size, angle) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-size * 0.35, -size * 0.25, -size, -size * 0.55)
    ctx.quadraticCurveTo(-size * 0.55, -size * 0.05, -size * 0.45, 0)
    ctx.quadraticCurveTo(-size * 0.55, size * 0.05, -size, size * 0.55)
    ctx.quadraticCurveTo(-size * 0.35, size * 0.25, 0, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // Whiplash vine from (x0, y) to (x1, y): a sinuous stem with alternating leaves.
  function ornVine(ctx, x0, x1, y, amp, waves, stem, leaf) {
    var len = x1 - x0
    ctx.strokeStyle = stem
    ctx.lineWidth = 1.1
    ctx.beginPath()
    var steps = Math.max(12, Math.round(Math.abs(len) / 3))
    for (var i = 0; i <= steps; i++) {
      var t = i / steps
      var px = x0 + len * t
      var py = y + Math.sin(t * Math.PI * 2.0 * waves) * amp * Math.sin(t * Math.PI)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.fillStyle = leaf
    var leaves = Math.max(1, Math.round(waves * 2))
    for (var k = 1; k <= leaves; k++) {
      var tk = k / (leaves + 1)
      var lx = x0 + len * tk
      var ly = y + Math.sin(tk * Math.PI * 2.0 * waves) * amp * Math.sin(tk * Math.PI)
      var up = (k % 2 === 0)
      root.ornLeaf(ctx, lx, ly, (len > 0 ? 0 : Math.PI) + (up ? -0.9 : 0.9), 6.5, 2.4)
    }
  }

  // Choice button: stock Omarchy Button normally; a gilded deco plaque or a
  // bronze-rimmed nouveau pill with leaf tips in the ornamental themes.
  component ChoiceButton: Item {
    id: choice
    property string text: ""
    property bool selected: false
    signal clicked()

    readonly property bool hot: ornMouse.containsMouse
    implicitHeight: Style.space(28)
    implicitWidth: root.ornate
      ? ornLabel.implicitWidth + Style.space(root.decoStyle ? 18 : 22)
      : stockButton.implicitWidth

    Button {
      id: stockButton
      anchors.fill: parent
      visible: !root.ornate
      bordered: true
      selected: choice.selected
      text: choice.text
      onClicked: choice.clicked()
    }

    Rectangle {
      id: ornPlaque
      visible: root.ornate
      anchors.fill: parent
      radius: root.nouveauStyle ? height / 2.0 : (root.atomicStyle ? Style.space(8) : 0)
      color: choice.selected ? root.ornSelectFill
        : (choice.hot ? Qt.alpha(root.ornatePalette ? root.ornPrimary : root.ornMetal, 0.18) : "transparent")
      border.width: 1
      border.color: Qt.alpha(root.ornMetal, choice.selected || choice.hot ? root.ornA(0.75, 1.0) : root.ornA(0.4, 0.85))
      scale: ornMouse.pressed ? 0.97 : 1.0

      Behavior on color { ColorAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic } }
      Behavior on scale { NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic } }

      // Inner rule of the double-line frame (deco, nouveau)
      Rectangle {
        visible: !root.atomicStyle
        anchors.fill: parent
        anchors.margins: 2
        radius: root.nouveauStyle ? height / 2.0 : 0
        color: "transparent"
        border.width: 1
        border.color: choice.selected
          ? (root.ornatePalette ? Qt.alpha(root.ornMetal, 0.7) : Qt.alpha(root.ornInk, 0.45))
          : Qt.alpha(root.ornMetal, root.ornA(0.16, 0.45))
      }

      // Atomic selected marks: little four-point sparkles
      Repeater {
        model: (choice.selected && ornPlaque.width >= Style.space(48) && root.atomicStyle) ? [0, 1] : []
        Item {
          required property int modelData
          width: 7; height: 7
          anchors.verticalCenter: parent.verticalCenter
          x: modelData === 0 ? 5 : ornPlaque.width - width - 5
          Rectangle { anchors.centerIn: parent; width: 7; height: 1.4; radius: 0.7; color: root.ornNotch }
          Rectangle { anchors.centerIn: parent; width: 1.4; height: 7; radius: 0.7; color: root.ornNotch }
        }
      }

      // Selected marks: diamonds (deco) or tilted leaves (nouveau)
      Repeater {
        model: (choice.selected && ornPlaque.width >= Style.space(48) && !root.atomicStyle) ? [0, 1] : []
        Rectangle {
          required property int modelData
          width: root.nouveauStyle ? 7 : 5
          height: root.nouveauStyle ? 3 : 5
          radius: root.nouveauStyle ? 1.5 : 0
          rotation: root.nouveauStyle ? (modelData === 0 ? -35 : 35) : 45
          color: root.ornNotch
          anchors.verticalCenter: parent.verticalCenter
          x: modelData === 0 ? (root.nouveauStyle ? 6 : 4) : ornPlaque.width - width - (root.nouveauStyle ? 6 : 4)
        }
      }

      Text {
        id: ornLabel
        anchors.fill: parent
        // Narrow (icon) buttons get almost no padding so the glyph always fits
        readonly property real pad: ornPlaque.width < Style.space(48) ? Style.space(2) : Style.space(root.decoStyle ? 9 : 11)
        anchors.leftMargin: pad
        anchors.rightMargin: pad
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        textFormat: Text.PlainText
        text: choice.text
        elide: Text.ElideRight
        color: choice.selected ? root.ornSelectText : root.ornMetal
        font.family: Style.font.family
        font.pixelSize: Style.font.small || 11
        font.bold: root.decoStyle || root.atomicStyle || choice.selected
        font.capitalization: root.decoStyle ? Font.AllUppercase : Font.MixedCase
        font.letterSpacing: root.decoStyle ? 1.2 : (root.atomicStyle ? 0.4 : 0.6)
      }

      MouseArea {
        id: ornMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: choice.clicked()
      }
    }
  }

  // Whiplash vine running toward (or away from) a heading. Nouveau only.
  component NouveauVine: Canvas {
    id: vine
    property bool towardRight: true
    property color stem: Qt.alpha(root.ornMetal, 0.75)
    property color leaf: root.ornatePalette ? root.ornPrimary : root.ornMetal
    property color bud: root.ornFlower
    implicitHeight: 14
    antialiasing: true
    onStemChanged: requestPaint()
    onLeafChanged: requestPaint()
    onBudChanged: requestPaint()
    onWidthChanged: requestPaint()
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      var w = width, y = height / 2.0
      if (w < 12) return
      var x0 = towardRight ? 2 : w - 2
      var x1 = towardRight ? w - 9 : 9
      root.ornVine(ctx, x0, x1, y, 2.6, Math.max(1, Math.round(w / 70)), String(stem), String(leaf))
      // Curl at the heading end, then a rose bud
      ctx.strokeStyle = String(stem)
      ctx.lineWidth = 1.1
      root.ornCurl(ctx, x1, y, 3.6, towardRight ? Math.PI : 0, 0.85, towardRight)
      ctx.fillStyle = String(bud)
      ctx.beginPath()
      ctx.arc(towardRight ? w - 3 : 3, y, 2.1, 0, Math.PI * 2.0)
      ctx.fill()
    }
  }

  // Atomic rule: a line ending in an atom dot and a starburst at the heading end.
  component AtomicRule: Canvas {
    property bool towardRight: true
    property color line: Qt.alpha(root.ornMetal, 0.7)
    property color burst: root.ornatePalette ? root.ornAccent : root.ornMetal
    property color dot: root.ornatePalette ? root.ornPrimary : root.ornMetal
    implicitHeight: 14
    antialiasing: true
    onLineChanged: requestPaint()
    onBurstChanged: requestPaint()
    onDotChanged: requestPaint()
    onWidthChanged: requestPaint()
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      var w = width, y = height / 2.0
      if (w < 20) return
      var outer = towardRight ? 3 : w - 3
      var inner = towardRight ? w - 8 : 8
      ctx.strokeStyle = String(line)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(outer, y); ctx.lineTo(towardRight ? inner - 9 : inner + 9, y)
      ctx.stroke()
      ctx.fillStyle = String(dot)
      ctx.beginPath(); ctx.arc(outer, y, 2.4, 0, Math.PI * 2.0); ctx.fill()
      ctx.beginPath(); ctx.arc(towardRight ? outer + 10 : outer - 10, y, 1.3, 0, Math.PI * 2.0); ctx.fill()
      root.ornStarburst(ctx, inner, y, 6.0, 4, String(burst))
    }
  }

  // Section heading: plain caption normally; ──◆ TITLE ◆── (deco) or
  // vines curling into the title (nouveau).
  component SectionHeading: Item {
    id: heading
    property string text: ""
    Layout.fillWidth: true
    implicitHeight: root.ornate ? Style.space(18) : plainHeading.implicitHeight

    Text {
      id: plainHeading
      visible: !root.ornate
      textFormat: Text.PlainText
      text: heading.text
      color: Color.foreground
      opacity: 0.78
      font.family: Style.font.family
      font.pixelSize: Style.font.small || 11
      font.bold: true
    }

    RowLayout {
      visible: root.decoStyle
      anchors.fill: parent
      spacing: Style.space(6)

      Rectangle { Layout.fillWidth: true; height: root.useBoldColors ? 2 : 1; color: Qt.alpha(root.ornMetal, root.ornA(0.4, 0.9)) }
      Rectangle { width: 5; height: 5; rotation: 45; color: root.ornatePalette ? root.ornAccent : root.ornMetal }
      Text {
        textFormat: Text.PlainText
        text: heading.text
        color: root.ornMetal
        font.family: Style.font.family
        font.pixelSize: Style.font.small || 11
        font.bold: true
        font.capitalization: Font.AllUppercase
        font.letterSpacing: 2.4
      }
      Rectangle { width: 5; height: 5; rotation: 45; color: root.ornatePalette ? root.ornPrimary : root.ornMetal }
      Rectangle { Layout.fillWidth: true; height: root.useBoldColors ? 2 : 1; color: Qt.alpha(root.ornMetal, root.ornA(0.4, 0.9)) }
    }

    RowLayout {
      visible: root.nouveauStyle
      anchors.fill: parent
      spacing: Style.space(4)

      NouveauVine { Layout.fillWidth: true; Layout.preferredHeight: 14; towardRight: true }
      Text {
        textFormat: Text.PlainText
        text: heading.text
        color: root.ornMetal
        font.family: Style.font.family
        font.pixelSize: Style.font.small || 11
        font.bold: true
        font.letterSpacing: 1.4
      }
      NouveauVine { Layout.fillWidth: true; Layout.preferredHeight: 14; towardRight: false }
    }

    RowLayout {
      visible: root.atomicStyle
      anchors.fill: parent
      spacing: Style.space(4)

      AtomicRule { Layout.fillWidth: true; Layout.preferredHeight: 14; towardRight: true }
      Text {
        textFormat: Text.PlainText
        text: heading.text
        color: root.ornMetal
        font.family: Style.font.family
        font.pixelSize: Style.font.small || 11
        font.bold: true
        font.italic: true
        font.letterSpacing: 0.8
      }
      AtomicRule { Layout.fillWidth: true; Layout.preferredHeight: 14; towardRight: false }
    }
  }

  // Row label to the left of a choice group.
  component RowLabel: Text {
    Layout.preferredWidth: root.ornate ? Style.space(124) : Style.space(98)
    textFormat: Text.PlainText
    color: root.ornate ? root.ornMetal : Color.foreground
    font.family: Style.font.family
    font.pixelSize: root.ornate ? (Style.font.small || 11) : Style.font.body
    font.bold: root.ornate
    font.capitalization: root.decoStyle ? Font.AllUppercase : Font.MixedCase
    font.letterSpacing: root.decoStyle ? 1.0 : (root.nouveauStyle ? 0.5 : 0)
    font.italic: root.atomicStyle
    elide: Text.ElideRight
  }

  // Divider: hairline normally; double rule with a centre diamond (deco) or a
  // vine with a central blossom (nouveau).
  component OrnDivider: Item {
    Layout.fillWidth: true
    implicitHeight: root.decoStyle ? 9 : (root.nouveauStyle ? 16 : (root.atomicStyle ? 14 : 1))

    Rectangle {
      visible: !root.ornate
      anchors.fill: parent
      color: Color.foreground
      opacity: 0.12
    }

    Item {
      visible: root.decoStyle
      anchors.fill: parent
      Rectangle { y: 2; width: parent.width; height: 1; color: Qt.alpha(root.ornMetal, 0.6) }
      Rectangle { y: 6; width: parent.width; height: 1; color: Qt.alpha(root.ornMetal, 0.3) }
      Rectangle {
        width: 7; height: 7; rotation: 45
        anchors.centerIn: parent
        color: root.ornatePalette ? root.ornPrimary : root.ornInk
        border.width: 1
        border.color: root.ornMetal
      }
    }

    Canvas {
      visible: root.nouveauStyle
      anchors.fill: parent
      antialiasing: true
      property color stem: Qt.alpha(root.ornMetal, 0.7)
      property color leaf: root.ornatePalette ? root.ornPrimary : root.ornMetal
      property color petal: root.ornFlower
      property color heart: root.ornAccent
      onStemChanged: requestPaint()
      onLeafChanged: requestPaint()
      onPetalChanged: requestPaint()
      onWidthChanged: requestPaint()
      onVisibleChanged: if (visible) requestPaint()
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var w = width, y = height / 2.0, cx = w / 2.0
        if (w < 40) return
        var waves = Math.max(1, Math.round(w / 140))
        root.ornVine(ctx, 2, cx - 9, y, 3.0, waves, String(stem), String(leaf))
        root.ornVine(ctx, w - 2, cx + 9, y, 3.0, waves, String(stem), String(leaf))
        root.ornBlossom(ctx, cx, y, 7, String(petal), String(heart))
      }
    }

    Canvas {
      visible: root.atomicStyle
      anchors.fill: parent
      antialiasing: true
      property color line: Qt.alpha(root.ornMetal, 0.6)
      property color burst: root.ornatePalette ? root.ornAccent : root.ornMetal
      property color dot: root.ornatePalette ? root.ornPrimary : root.ornMetal
      onLineChanged: requestPaint()
      onBurstChanged: requestPaint()
      onWidthChanged: requestPaint()
      onVisibleChanged: if (visible) requestPaint()
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var w = width, y = height / 2.0, cx = w / 2.0
        if (w < 40) return
        ctx.strokeStyle = String(line)
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(4, y); ctx.lineTo(cx - 26, y)
        ctx.moveTo(cx + 26, y); ctx.lineTo(w - 4, y)
        ctx.stroke()
        ctx.fillStyle = String(dot)
        var dots = [4, cx - 20, cx - 14, cx + 14, cx + 20, w - 4]
        for (var i = 0; i < dots.length; i++) {
          ctx.beginPath()
          ctx.arc(dots[i], y, (i === 0 || i === dots.length - 1) ? 2.4 : 1.5, 0, Math.PI * 2.0)
          ctx.fill()
        }
        root.ornStarburst(ctx, cx, y, 7.0, 4, String(burst))
      }
    }
  }

  // Card ornament: inner rule plus stepped corner brackets (deco) or a rounded
  // inner rule with curling corner tendrils (nouveau).
  component OrnCardFrame: Item {
    anchors.fill: parent
    visible: root.ornate

    Rectangle {
      anchors.fill: parent
      anchors.margins: 3
      visible: !root.atomicStyle
      radius: root.nouveauStyle ? Style.space(9) : 0
      color: "transparent"
      border.width: 1
      border.color: Qt.alpha(root.ornMetal, root.ornA(0.12, 0.35))
    }

    Repeater {
      model: root.decoStyle ? [[0, 0], [1, 0], [0, 1], [1, 1]] : []
      Item {
        required property var modelData
        width: 10; height: 10
        x: modelData[0] ? parent.width - width - 1 : 1
        y: modelData[1] ? parent.height - height - 1 : 1
        Rectangle { width: 10; height: 2; color: root.ornMetal; y: modelData[1] ? 8 : 0 }
        Rectangle { width: 2; height: 10; color: root.ornMetal; x: modelData[0] ? 8 : 0 }
        Rectangle { width: 5; height: 1; color: root.ornatePalette ? root.ornPrimary : Qt.alpha(root.ornMetal, 0.7); y: modelData[1] ? 5 : 4; x: modelData[0] ? 2 : 3 }
        Rectangle { width: 1; height: 5; color: root.ornatePalette ? root.ornPrimary : Qt.alpha(root.ornMetal, 0.7); x: modelData[0] ? 5 : 4; y: modelData[1] ? 2 : 3 }
      }
    }

    Canvas {
      visible: root.nouveauStyle
      anchors.fill: parent
      antialiasing: true
      property color stem: Qt.alpha(root.ornMetal, 0.8)
      property color leaf: root.ornatePalette ? root.ornPrimary : root.ornMetal
      property color bud: root.ornFlower
      onStemChanged: requestPaint()
      onLeafChanged: requestPaint()
      onWidthChanged: requestPaint()
      onHeightChanged: requestPaint()
      onVisibleChanged: if (visible) requestPaint()
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var w = width, h = height
        if (w < 40 || h < 30) return
        // Top-left and bottom-right tendrils, diagonal pair like a Mucha panel
        var corners = [[0, 0, 1, 1], [w, h, -1, -1]]
        for (var i = 0; i < corners.length; i++) {
          var ox = corners[i][0], oy = corners[i][1], sx = corners[i][2], sy = corners[i][3]
          ctx.strokeStyle = String(stem)
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(ox + sx * 2, oy + sy * 22)
          ctx.bezierCurveTo(ox + sx * 3, oy + sy * 8, ox + sx * 8, oy + sy * 3, ox + sx * 24, oy + sy * 2)
          ctx.stroke()
          root.ornCurl(ctx, ox + sx * 24, oy + sy * 2, 3.2, sx > 0 ? Math.PI * 1.5 : Math.PI * 0.5, 0.8, sx < 0)
          ctx.fillStyle = String(leaf)
          root.ornLeaf(ctx, ox + sx * 5, oy + sy * 7, Math.atan2(sy, sx) + (sx > 0 ? 0.15 : 0.15), 7, 2.6)
          ctx.fillStyle = String(bud)
          ctx.beginPath()
          ctx.arc(ox + sx * 2, oy + sy * 24, 1.8, 0, Math.PI * 2.0)
          ctx.fill()
        }
      }
    }

    // Atomic: a starburst between two boomerangs on the bottom edge
    Canvas {
      visible: root.atomicStyle
      anchors.fill: parent
      antialiasing: true
      property color boom: root.ornatePalette ? Qt.alpha(root.ornPrimary, 0.55) : Qt.alpha(root.ornMetal, 0.45)
      property color burst: root.ornatePalette ? root.ornAccent : root.ornMetal
      onBoomChanged: requestPaint()
      onBurstChanged: requestPaint()
      onWidthChanged: requestPaint()
      onHeightChanged: requestPaint()
      onVisibleChanged: if (visible) requestPaint()
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var w = width, h = height
        if (w < 40 || h < 30) return
        // Centred on the bottom border, inside the card padding
        var cx = w / 2.0, y = h - 3.0
        ctx.fillStyle = String(boom)
        root.ornBoomerang(ctx, cx - 9, y, 10, 0)
        root.ornBoomerang(ctx, cx + 9, y, 10, Math.PI)
        root.ornStarburst(ctx, cx, y, 4.5, 4, String(burst))
      }
    }
  }

  // Card caption: muted bold normally; gold capitals (deco) or bronze lettering (nouveau).
  component CardTitle: Text {
    textFormat: Text.PlainText
    color: root.ornate ? root.ornMetal : Color.foreground
    opacity: root.ornate ? 1.0 : 0.72
    font.family: Style.font.family
    font.pixelSize: Style.font.small || 11
    font.bold: true
    font.capitalization: root.decoStyle ? Font.AllUppercase : Font.MixedCase
    font.letterSpacing: root.decoStyle ? 1.8 : (root.nouveauStyle ? 0.8 : (root.atomicStyle ? 0.6 : 0))
    font.italic: root.atomicStyle
  }

  // Crest over the settings panel: deco sunburst fan or a Mucha halo with blossom and vines.
  component OrnCrest: Canvas {
    id: burst
    property color gold: root.ornMetal
    property color jewel: root.ornatePalette ? root.ornPrimary : root.ornMetal
    property color sun: root.ornatePalette ? root.ornAccent : root.ornMetal
    property color petal: root.ornFlower
    property bool nouveau: root.nouveauStyle
    property bool atomic: root.atomicStyle
    onAtomicChanged: requestPaint()
    onJewelChanged: requestPaint()
    onSunChanged: requestPaint()
    onPetalChanged: requestPaint()
    onNouveauChanged: requestPaint()
    Layout.fillWidth: true
    implicitHeight: Style.space(30)
    antialiasing: true
    onGoldChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()

    function paintDecoCrest(ctx, w, h) {
      var cx = w / 2.0, base = h - 1.5
      var R = h - 3.0
      var g = String(gold)

      // Horizon rules running out to both sides
      ctx.strokeStyle = String(Qt.alpha(gold, 0.6))
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, base); ctx.lineTo(w, base)
      ctx.moveTo(w * 0.12, base - 4); ctx.lineTo(cx - R - 6, base - 4)
      ctx.moveTo(cx + R + 6, base - 4); ctx.lineTo(w * 0.88, base - 4)
      ctx.stroke()

      // Stepped ziggurat shoulders
      ctx.fillStyle = String(Qt.alpha(gold, 0.22))
      for (var s = 0; s < 3; s++) {
        var sw = R + 10 + s * 9
        var sh = 3 + (2 - s) * 3
        ctx.fillRect(cx - sw, base - sh, 7, sh)
        ctx.fillRect(cx + sw - 7, base - sh, 7, sh)
      }

      // Rays fanning from the horizon
      var rays = 13
      for (var i = 0; i < rays; i++) {
        var a = Math.PI + (Math.PI * (i + 0.5)) / rays
        var isLong = (i % 2 === 0)
        var r0 = R * 0.38, r1 = isLong ? R : R * 0.78
        ctx.lineWidth = isLong ? 1.3 : 0.9
        ctx.strokeStyle = (!isLong && root.ornatePalette) ? String(jewel) : g
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r0, base + Math.sin(a) * r0)
        ctx.lineTo(cx + Math.cos(a) * r1, base + Math.sin(a) * r1)
        ctx.stroke()
      }

      // Outer arc and the rising half-sun
      ctx.lineWidth = 1
      ctx.strokeStyle = String(Qt.alpha(gold, 0.55))
      ctx.beginPath()
      ctx.arc(cx, base, R + 2, Math.PI, Math.PI * 2.0)
      ctx.stroke()

      ctx.fillStyle = String(sun)
      ctx.beginPath()
      ctx.arc(cx, base, R * 0.3, Math.PI, Math.PI * 2.0)
      ctx.closePath()
      ctx.fill()
    }

    function paintNouveauCrest(ctx, w, h) {
      var cx = w / 2.0, cy = h * 0.52
      var R = h * 0.46

      // Vines sweeping out from the halo
      root.ornVine(ctx, cx - R - 4, w * 0.04, cy + 3, 3.4, Math.max(1, Math.round(w / 180)), String(Qt.alpha(gold, 0.75)), String(jewel))
      root.ornVine(ctx, cx + R + 4, w * 0.96, cy + 3, 3.4, Math.max(1, Math.round(w / 180)), String(Qt.alpha(gold, 0.75)), String(jewel))
      ctx.strokeStyle = String(Qt.alpha(gold, 0.75))
      ctx.lineWidth = 1.1
      root.ornCurl(ctx, w * 0.04, cy + 3, 3.4, 0, 0.85, true)
      root.ornCurl(ctx, w * 0.96, cy + 3, 3.4, Math.PI, 0.85, false)

      // Mucha halo: double ring studded with beads
      ctx.strokeStyle = String(gold)
      ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2.0); ctx.stroke()
      ctx.strokeStyle = String(Qt.alpha(gold, 0.5))
      ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(cx, cy, R - 3.2, 0, Math.PI * 2.0); ctx.stroke()
      ctx.fillStyle = String(gold)
      for (var b = 0; b < 16; b++) {
        var ba = b * Math.PI * 2.0 / 16
        ctx.beginPath()
        ctx.arc(cx + Math.cos(ba) * (R - 1.6), cy + Math.sin(ba) * (R - 1.6), 0.9, 0, Math.PI * 2.0)
        ctx.fill()
      }

      // Sun-blossom at the heart of the halo
      root.ornBlossom(ctx, cx, cy, R * 0.52, String(petal), String(sun))
    }

    function paintAtomicCrest(ctx, w, h) {
      var cx = w / 2.0, cy = h / 2.0
      var rx = h * 0.95, ry = h * 0.3

      // Lines out to starbursts, with atom dots along them
      ctx.strokeStyle = String(Qt.alpha(gold, 0.6))
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(w * 0.06, cy); ctx.lineTo(cx - rx - 6, cy)
      ctx.moveTo(cx + rx + 6, cy); ctx.lineTo(w * 0.94, cy)
      ctx.stroke()
      ctx.fillStyle = String(jewel)
      var dx = [0.14, 0.22, 0.28, 0.72, 0.78, 0.86]
      for (var d = 0; d < dx.length; d++) {
        ctx.beginPath(); ctx.arc(w * dx[d], cy, d % 3 === 0 ? 2.2 : 1.4, 0, Math.PI * 2.0); ctx.fill()
      }
      root.ornStarburst(ctx, w * 0.04, cy, 7.0, 4, String(sun))
      root.ornStarburst(ctx, w * 0.96, cy, 7.0, 4, String(sun))

      // The atom: three orbits around a glowing nucleus, electrons riding them
      var tilts = [0, Math.PI / 3.0, -Math.PI / 3.0]
      ctx.strokeStyle = String(gold)
      ctx.lineWidth = 1.1
      for (var o = 0; o < tilts.length; o++) root.ornOrbit(ctx, cx, cy, rx, ry, tilts[o], "all")
      ctx.fillStyle = String(sun)
      ctx.beginPath(); ctx.arc(cx, cy, h * 0.17, 0, Math.PI * 2.0); ctx.fill()
      ctx.fillStyle = String(jewel)
      var phases = [0.4, 2.3, 4.4]
      for (var e = 0; e < tilts.length; e++) {
        var pt = root.ornOrbitPoint(cx, cy, rx, ry, tilts[e], phases[e])
        ctx.beginPath(); ctx.arc(pt[0], pt[1], 2.2, 0, Math.PI * 2.0); ctx.fill()
      }
    }

    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      if (width < 40) return
      if (atomic) paintAtomicCrest(ctx, width, height)
      else if (nouveau) paintNouveauCrest(ctx, width, height)
      else paintDecoCrest(ctx, width, height)
    }
  }

  // ============================================================================
  // Bar Button Presentation
  // ============================================================================
  readonly property bool showSolarOnBar: {
    if (root.displayMode === "lunar") return false
    if (root.displayMode === "dynamic") return root.solarData.isDay
    return true
  }

  readonly property bool showLunarOnBar: {
    if (root.displayMode === "solar") return false
    if (root.displayMode === "dynamic") return !root.solarData.isDay
    return true
  }

  readonly property string barSolarText: {
    if (root.displayMode === "detailed" || root.displayMode === "solar") {
      return Model.formatTime(root.solarData.nextEventTime, root.timeFormatMode, root.formatLocale)
    }
    return ""
  }

  readonly property string barLunarText: {
    if (root.displayMode === "compact") return ""
    return Commons.I18n.formatNumber(root.lunarData.illuminationPct) + "%"
  }

  readonly property color barSolarColor: root.resolveSolarColor(false, root.solarData.isDay)
  readonly property color barLunarColor: root.resolveLunarColor(false)
  readonly property color barLunarLitColor: root.resolveLunarLitColor(false)

  // Bar-surface ornament tones (checked against the bar background, not the popup's)
  readonly property color barMetal: root.useThemeColors ? Color.accent : root.ornPick("metal", root.isLightBar, root.effectiveBarBg)
  readonly property color barPrimary: root.useThemeColors ? Color.accent : root.ornPick("primary", root.isLightBar, root.effectiveBarBg)
  readonly property bool barCapsuleOn: root.ornate && (root.showSolarOnBar || root.showLunarOnBar)

  implicitWidth: root.vertical ? root.barSize : Math.max(Style.bar.iconSlot, barContentRow.implicitWidth + Style.space(root.barCapsuleOn ? 24 : 16))
  implicitHeight: root.vertical ? Math.max(Style.bar.iconSlot, barContentCol.implicitHeight + Style.space(root.barCapsuleOn ? 20 : 12)) : root.barSize

  WidgetButton {
    id: barButton
    anchors.fill: parent
    bar: root.bar
    text: ""
    labelVisible: false
    hasVisualContent: true
    active: root.opened
    tooltipText: root.opened ? "" : (
      root.solarData.phaseName + " (" + Math.round(root.solarData.altitude) + "°) · "
      + root.lunarData.phaseName + " (" + root.lunarData.illuminationPct + "%)"
      + (root.nextMoonEventText !== "" ? " · " + root.nextMoonEventText : "")
      + " · Right-click: settings"
    )

    onPressed: function(b) {
      if (b === Qt.RightButton) {
        root.toggleSettings()
      } else if (b === Qt.MiddleButton) {
        root.refresh()
      } else {
        root.togglePanel()
      }
    }

    // One themed capsule framing sun + moon as a single control
    Rectangle {
      id: barCapsule
      visible: root.barCapsuleOn
      readonly property Item content: root.vertical ? barContentCol : barContentRow
      readonly property bool lit: barButton.active || barButton.tooltipHovered
      anchors.centerIn: parent
      width: root.vertical
        ? Math.min(parent.width - Style.space(4), content.implicitWidth + Style.space(10))
        : content.implicitWidth + Style.space(16)
      height: root.vertical
        ? content.implicitHeight + Style.space(12)
        : Math.min(parent.height - Style.space(6), Style.space(22))
      radius: root.decoStyle ? 0 : (root.nouveauStyle ? Math.min(width, height) / 2.0 : Style.space(7))
      color: root.useBoldColors
        ? Qt.alpha(root.barPrimary, root.isLightBar ? 0.14 : (lit ? 0.3 : 0.2))
        : Qt.alpha(root.barMetal, lit ? 0.12 : 0.06)
      border.width: 1
      border.color: Qt.alpha(root.barMetal, lit ? 1.0 : root.ornA(0.5, 0.85))
      scale: barButton.pressScale

      Behavior on color { ColorAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic } }
      Behavior on border.color { ColorAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic } }

      // Inner rule: the deco double frame / the nouveau doubled pill
      Rectangle {
        visible: !root.atomicStyle
        anchors.fill: parent
        anchors.margins: 2
        radius: root.nouveauStyle ? height / 2.0 : 0
        color: "transparent"
        border.width: 1
        border.color: Qt.alpha(root.barMetal, root.ornA(0.18, 0.4))
      }
    }

    // Horizontal bar layout
    Row {
      id: barContentRow
      visible: !root.vertical
      anchors.centerIn: parent
      spacing: Style.space(6)
      scale: barButton.pressScale

      // Solar group
      Row {
        visible: root.showSolarOnBar
        spacing: Style.space(4)
        anchors.verticalCenter: parent.verticalCenter

        Text {
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: root.solarData.phaseIcon
          color: root.barSolarColor
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Math.round(Style.font.body * 1.12)
          renderType: Text.CurveRendering
        }

        Text {
          visible: root.barSolarText !== ""
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: root.barSolarText
          color: root.useThemeColors ? barButton.foreground : Color.foreground
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }
      }

      // Separator between sun and moon: plain dot, or the theme's mark
      Item {
        visible: root.showSolarOnBar && root.showLunarOnBar
        width: root.ornate ? 7 : 3
        height: 7
        anchors.verticalCenter: parent.verticalCenter

        Rectangle {
          visible: !root.ornate
          anchors.centerIn: parent
          width: 3; height: 3; radius: 1.5
          color: Color.foreground
          opacity: 0.32
        }
        // Deco: diamond
        Rectangle {
          visible: root.decoStyle
          anchors.centerIn: parent
          width: 5; height: 5; rotation: 45
          color: root.barMetal
        }
        // Nouveau: a leaf sprig with a rose bud
        Rectangle {
          visible: root.nouveauStyle
          x: -1; y: 2
          width: 7; height: 3; radius: 1.5
          rotation: -40
          color: Qt.alpha(root.barPrimary, 0.9)
        }
        Rectangle {
          visible: root.nouveauStyle
          x: 4.5; y: -0.5
          width: 3.2; height: 3.2; radius: 1.6
          color: root.ornatePalette ? root.ornPick("flower", root.isLightBar, root.effectiveBarBg) : root.barMetal
        }
        // Atomic: four-point sparkle
        Rectangle { visible: root.atomicStyle; anchors.centerIn: parent; width: 7; height: 1.4; radius: 0.7; color: root.barMetal }
        Rectangle { visible: root.atomicStyle; anchors.centerIn: parent; width: 1.4; height: 7; radius: 0.7; color: root.barMetal }
      }

      // Lunar group
      Row {
        visible: root.showLunarOnBar
        spacing: Style.space(4)
        anchors.verticalCenter: parent.verticalCenter

        MoonDisc {
          renderStyle: root.moonStyle
          anchors.verticalCenter: parent.verticalCenter
          discSize: 13
          phase: root.lunarData.phase
          litColor: root.barLunarLitColor
          darkColor: root.ornatePalette ? root.ornMoonShadow(root.isLightBar, 0.22) : (root.isLightBar ? Qt.rgba(0.15, 0.2, 0.3, 0.22) : Qt.rgba(0.06, 0.09, 0.16, 0.72))
          rimColor: Qt.alpha(root.barLunarColor, root.isLightBar ? 0.55 : 0.45)
        }

        Text {
          visible: root.barLunarText !== ""
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: root.barLunarText
          color: root.useThemeColors ? barButton.foreground : Color.foreground
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }
      }
    }

    // Vertical bar layout
    Column {
      id: barContentCol
      visible: root.vertical
      anchors.centerIn: parent
      spacing: Style.space(4)
      scale: barButton.pressScale

      Text {
        visible: root.showSolarOnBar
        anchors.horizontalCenter: parent.horizontalCenter
        textFormat: Text.PlainText
        text: root.solarData.phaseIcon
        color: root.barSolarColor
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Math.round(Style.font.body * 1.1)
      }

      Rectangle {
        visible: root.ornate && root.showSolarOnBar && root.showLunarOnBar
        anchors.horizontalCenter: parent.horizontalCenter
        width: root.decoStyle ? 4 : 8
        height: root.decoStyle ? 4 : 1.2
        rotation: root.decoStyle ? 45 : 0
        radius: root.decoStyle ? 0 : 0.6
        color: root.nouveauStyle ? root.barPrimary : root.barMetal
      }

      MoonDisc {
        visible: root.showLunarOnBar
        renderStyle: root.moonStyle
        anchors.horizontalCenter: parent.horizontalCenter
        discSize: 13
        phase: root.lunarData.phase
        litColor: root.barLunarLitColor
        darkColor: root.ornatePalette ? root.ornMoonShadow(root.isLightBar, 0.22) : (root.isLightBar ? Qt.rgba(0.15, 0.2, 0.3, 0.22) : Qt.rgba(0.06, 0.09, 0.16, 0.72))
        rimColor: Qt.alpha(root.barLunarColor, 0.48)
      }
    }
  }

  // Popup always opens, and switches views, scrolled to the top
  onSettingsOpenChanged: popupScroll.contentY = 0
  onOpenedChanged: {
    if (root.opened) {
      popupScroll.contentY = 0
    } else if (root.viewOffsetDays !== 0) {
      root.viewOffsetDays = 0
      root.recalculate()
    }
  }

  // ============================================================================
  // Main Tracker & Settings PopupCard
  // ============================================================================
  KeyboardPanel {
    id: trackerPopup
    owner: root
    anchorItem: barButton
    bar: root.bar
    open: root.opened
    focusTarget: popupScroll
    contentWidth: Style.space(456)
    contentHeight: fittedContentHeight(mainColumn.implicitHeight)

    readonly property color popupSolarColor: root.resolveSolarColor(true, root.solarData.isDay)
    readonly property color popupBlueHourColor: root.resolveBlueHourColor(true)
    readonly property color popupLunarColor: root.resolveLunarColor(true)
    readonly property color popupLunarLitColor: root.resolveLunarLitColor(true)
    readonly property color cardSurfaceColor: root.ornatePalette
      ? root.ornCardTint
      : root.isLightPopup
      ? Qt.alpha(Color.foreground, 0.05)
      : Qt.rgba(0, 0, 0, 0.24)
    readonly property color cardBorderColor: root.ornate
      ? Qt.alpha(root.ornMetal, root.ornA((root.ornPal.borderAlpha || 0.55) * 0.6, 1.0))
      : Qt.alpha(Color.foreground, root.isLightPopup ? 0.12 : 0.14)
    readonly property real cardRadius: root.decoStyle ? 0
      : (root.nouveauStyle ? Style.space(12) : (root.atomicStyle ? Style.space(14) : Math.max(4, Style.cornerRadius - 2)))
    readonly property real chipRadius: root.decoStyle ? 0
      : (root.nouveauStyle ? Style.space(9) : (root.atomicStyle ? Style.space(8) : Math.max(3, Style.cornerRadius - 3)))
    readonly property real barRadius: root.decoStyle ? 0 : 2.5
    readonly property color barTrackColor: root.ornate
      ? Qt.alpha(root.ornMetal, root.ornA(0.1, 0.24))
      : Qt.alpha(Color.foreground, 0.12)

    // Scrolls when the tracker is taller than the screen allows (PopupCard caps
    // its height at the available screen space and does not scroll on its own).
    Flickable {
      id: popupScroll
      width: parent.width
      height: Math.max(0, trackerPopup.contentHeight - trackerPopup.verticalContentInset)
      contentWidth: width
      contentHeight: mainColumn.implicitHeight
      clip: true
      interactive: contentHeight > height + 1
      boundsBehavior: Flickable.StopAtBounds
      flickableDirection: Flickable.VerticalFlick
      focus: true

      function scrollBy(dy) {
        contentY = Math.max(0, Math.min(Math.max(0, contentHeight - height), contentY + dy))
      }

      // Keyboard: ←/→ day (Shift: week), T today, S settings, R refresh,
      // ↑/↓ PgUp/PgDn Home scroll, Esc close; in settings 1/2/3 pick the theme.
      Keys.onPressed: function(event) {
        var shift = (event.modifiers & Qt.ShiftModifier) !== 0
        var k = event.key
        if (k === Qt.Key_Escape) {
          if (root.editingCustomCoords) root.editingCustomCoords = false
          else root.close()
        } else if (k === Qt.Key_Left && !root.settingsOpen) {
          root.stepView(shift ? -7 : -1)
        } else if (k === Qt.Key_Right && !root.settingsOpen) {
          root.stepView(shift ? 7 : 1)
        } else if (k === Qt.Key_T) {
          root.setViewOffset(0)
        } else if (k === Qt.Key_S) {
          root.settingsOpen = !root.settingsOpen
        } else if (k === Qt.Key_R) {
          root.refresh()
        } else if (k === Qt.Key_Down) {
          scrollBy(Style.space(40))
        } else if (k === Qt.Key_Up) {
          scrollBy(-Style.space(40))
        } else if (k === Qt.Key_PageDown || k === Qt.Key_Space) {
          scrollBy(height * 0.85)
        } else if (k === Qt.Key_PageUp) {
          scrollBy(-height * 0.85)
        } else if (k === Qt.Key_Home) {
          contentY = 0
        } else if (root.settingsOpen && k >= Qt.Key_1 && k <= Qt.Key_3) {
          root.selectMoonStyle(["atomic", "deco", "nouveau"][k - Qt.Key_1])
        } else {
          return
        }
        event.accepted = true
      }

      ColumnLayout {
        id: mainColumn
        width: popupScroll.width
        spacing: Style.space(10)

        // ---- Top Header Row: Title, Location Badge, Daylight Delta, and Actions
        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(8)

          ColumnLayout {
            Layout.fillWidth: true
            spacing: Style.space(2)

            RowLayout {
              spacing: Style.space(6)

              Text {
                textFormat: Text.PlainText
                readonly property bool deco: root.decoStyle
                text: root.settingsOpen ? strings.t("section.settings") : strings.t("plugin.title")
                color: root.ornate ? root.ornMetal : Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.body
                font.bold: true
                font.capitalization: deco ? Font.AllUppercase : Font.MixedCase
                font.letterSpacing: deco ? 3.0 : (root.nouveauStyle ? 1.2 : (root.atomicStyle ? 0.8 : 0))
                font.italic: root.atomicStyle
              }

              // Daylight vs yesterday badge
              Rectangle {
                visible: !root.settingsOpen
                height: Style.space(18)
                width: deltaLabel.implicitWidth + Style.space(10)
                radius: trackerPopup.chipRadius
                color: Qt.alpha(trackerPopup.popupSolarColor, root.isLightPopup ? 0.14 : 0.18)
                border.width: 1
                border.color: root.ornate ? Qt.alpha(root.ornMetal, 0.7) : Qt.alpha(trackerPopup.popupSolarColor, 0.35)

                Text {
                  id: deltaLabel
                  anchors.centerIn: parent
                  textFormat: Text.PlainText
                  text: "󰖙 " + Model.formatDaylightDiff(root.solarData.dayDiffSeconds)
                  color: trackerPopup.popupSolarColor
                  font.family: Style.font.family
                  font.pixelSize: Style.font.small || 11
                  font.bold: true
                }
              }
            }

            // Location subtitle: city, current weather, then coordinates (trimmed first)
            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(6)

              Text {
                textFormat: Text.PlainText
                text: "󰍎 " + root.activeLocationName
                color: Color.foreground
                opacity: 0.62
                font.family: Style.font.family
                font.pixelSize: Style.font.small || 11
                elide: Text.ElideRight
                Layout.maximumWidth: Style.space(170)
              }

              // Date and ISO week of the day shown (follows time travel)
              Text {
                textFormat: Text.PlainText
                text: root.currentDate.toLocaleDateString(root.formatLocale, "ddd, MMM d")
                  + " · " + strings.t("header.week").arg(Model.isoWeek(root.currentDate).week)
                color: root.browsing ? trackerPopup.popupSolarColor : Color.foreground
                opacity: root.browsing ? 1.0 : 0.62
                font.family: Style.font.family
                font.pixelSize: Style.font.small || 11
                font.bold: root.browsing
              }

              Row {
                visible: root.weatherText !== "" && !root.browsing
                spacing: Style.space(4)
                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: root.weatherNow ? root.weatherNow.icon : ""
                  color: trackerPopup.popupSolarColor
                  font.family: Style.font.family
                  font.pixelSize: Math.round((Style.font.small || 11) * 1.25)
                }
                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: root.weatherText
                  color: root.ornate ? root.ornMetal : Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.small || 11
                  font.bold: true
                }
              }

              Text {
                textFormat: Text.PlainText
                text: "(" + (root.activeLat >= 0 ? root.activeLat.toFixed(2) + "°N" : Math.abs(root.activeLat).toFixed(2) + "°S")
                  + ", " + (root.activeLon >= 0 ? root.activeLon.toFixed(2) + "°E" : Math.abs(root.activeLon).toFixed(2) + "°W") + ")"
                color: Color.foreground
                opacity: 0.45
                font.family: Style.font.family
                font.pixelSize: Style.font.small || 11
                elide: Text.ElideRight
                Layout.fillWidth: true
              }
            }
          }

          // Refresh button
          ChoiceButton {
            Layout.preferredWidth: Style.space(28)
            Layout.preferredHeight: Style.space(28)
            text: "󰑐"
            onClicked: root.refresh()
          }

          // Toggle Settings / Tracker view button
          ChoiceButton {
            Layout.preferredWidth: Style.space(28)
            Layout.preferredHeight: Style.space(28)
            selected: root.settingsOpen
            text: root.settingsOpen ? "󰅖" : "󰒓"
            onClicked: {
              if (!root.settingsOpen) {
                root.customLatInput = String(setting("latitude", ""))
                root.customLonInput = String(setting("longitude", ""))
                root.customNameInput = String(setting("locationName", ""))
              }
              root.settingsOpen = !root.settingsOpen
            }
          }
        }

        // ---- Time-travel chip: shown while the popup is on another date
        Rectangle {
          visible: root.browsing && !root.settingsOpen
          Layout.fillWidth: true
          implicitHeight: viewRow.implicitHeight + Style.space(8)
          radius: trackerPopup.chipRadius
          color: Qt.alpha(trackerPopup.popupSolarColor, root.isLightPopup ? 0.1 : 0.14)
          border.width: 1
          border.color: Qt.alpha(trackerPopup.popupSolarColor, 0.5)

          RowLayout {
            id: viewRow
            anchors.fill: parent
            anchors.leftMargin: Style.space(8)
            anchors.rightMargin: Style.space(4)
            spacing: Style.space(6)

            ChoiceButton {
              Layout.preferredWidth: Style.space(26)
              Layout.preferredHeight: Style.space(22)
              text: "‹"
              onClicked: root.stepView(-1)
            }
            Text {
              Layout.fillWidth: true
              textFormat: Text.PlainText
              text: strings.t("view.viewing")
                .arg(root.currentDate.toLocaleDateString(root.formatLocale, "ddd, MMM d, yyyy"))
                .arg(strings.t(root.viewOffsetDays > 0 ? "view.ahead" : "view.ago").arg(Math.abs(root.viewOffsetDays)))
              color: trackerPopup.popupSolarColor
              font.family: Style.font.family
              font.pixelSize: Style.font.small || 11
              font.bold: true
              elide: Text.ElideRight
            }
            ChoiceButton {
              Layout.preferredWidth: Style.space(26)
              Layout.preferredHeight: Style.space(22)
              text: "›"
              onClicked: root.stepView(1)
            }
            ChoiceButton {
              Layout.preferredHeight: Style.space(22)
              text: strings.t("view.today")
              selected: true
              onClicked: root.setViewOffset(0)
            }
          }
        }

        // ======================================================================
        // MAIN TRACKER VIEW
        // ======================================================================
        ColumnLayout {
          id: trackerView
          visible: !root.settingsOpen
          Layout.fillWidth: true
          spacing: Style.space(10)

          // ---- 1. 24-Hour Sky & Horizon Path Card
          Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: Style.space(114)
            radius: trackerPopup.cardRadius
            color: trackerPopup.cardSurfaceColor
            border.width: 1
            border.color: trackerPopup.cardBorderColor
            OrnCardFrame {}
            clip: true

            ColumnLayout {
              anchors.fill: parent
              anchors.margins: Style.space(8)
              spacing: Style.space(4)

              RowLayout {
                Layout.fillWidth: true
                spacing: Style.space(6)

                CardTitle {
                  text: (root.decoStyle ? "◆ " : (root.nouveauStyle ? "󰌪 " : (root.atomicStyle ? "✦ " : ""))) + strings.t("section.skyHorizon")
                }

                Item { Layout.fillWidth: true }

                Text {
                  textFormat: Text.PlainText
                  text: root.solarData.nextEventName !== ""
                    ? strings.t("solar.next")
                        .arg(root.solarData.nextEventName)
                        .arg(Model.formatTime(root.solarData.nextEventTime, root.timeFormatMode, root.formatLocale))
                    : ""
                  color: trackerPopup.popupSolarColor
                  font.family: Style.font.family
                  font.pixelSize: Style.font.small || 11
                  font.bold: true
                }
              }

              // 24h Sky Horizon Canvas
              Canvas {
                id: skyArcCanvas
                Layout.fillWidth: true
                Layout.fillHeight: true
                antialiasing: true

                property var samples: root.skySamples
                property date nowDate: root.currentDate
                property color sunColor: trackerPopup.popupSolarColor
                property color moonColor: trackerPopup.popupLunarColor
                property color fgColor: Color.foreground
                property bool deco: root.decoStyle
                property bool nouveau: root.nouveauStyle
                property bool atomic: root.atomicStyle
                property color leafColor: root.ornatePalette ? root.ornPrimary : root.ornMetal
                property color petalColor: root.ornFlower
                property color goldColor: root.ornMetal

                onSamplesChanged: requestPaint()
                onNowDateChanged: requestPaint()
                onSunColorChanged: requestPaint()
                onMoonColorChanged: requestPaint()
                onFgColorChanged: requestPaint()
                onDecoChanged: requestPaint()
                onNouveauChanged: requestPaint()
                onAtomicChanged: requestPaint()
                onLeafColorChanged: requestPaint()
                onGoldColorChanged: requestPaint()

                onPaint: {
                  var ctx = getContext("2d")
                  ctx.reset()

                  var w = width
                  var h = height
                  if (w <= 10 || h <= 10) return

                  var padL = 8
                  var padR = 8
                  var padT = 10
                  var padB = 16
                  var plotW = w - padL - padR
                  var plotH = h - padT - padB
                  var horizonY = padT + plotH * 0.54

                  function altToY(altDeg) {
                    var clamped = Math.max(-75.0, Math.min(75.0, altDeg))
                    if (clamped >= 0) {
                      return horizonY - (clamped / 75.0) * (horizonY - padT)
                    }
                    return horizonY + (Math.abs(clamped) / 75.0) * (padT + plotH - horizonY)
                  }

                  function fracToX(f) {
                    return padL + Math.max(0.0, Math.min(1.0, f)) * plotW
                  }

                  // Horizon line (0° altitude)
                  if (deco) {
                    // Double gold horizon rule with diamond hour marks
                    ctx.strokeStyle = Qt.alpha(goldColor, 0.6)
                    ctx.lineWidth = 1
                    ctx.beginPath()
                    ctx.moveTo(padL, horizonY - 1.5); ctx.lineTo(padL + plotW, horizonY - 1.5)
                    ctx.stroke()
                    ctx.strokeStyle = Qt.alpha(goldColor, 0.3)
                    ctx.beginPath()
                    ctx.moveTo(padL, horizonY + 1.5); ctx.lineTo(padL + plotW, horizonY + 1.5)
                    ctx.stroke()
                    ctx.fillStyle = String(goldColor)
                    for (var q = 0; q <= 4; q++) {
                      var qx = fracToX(q / 4.0)
                      ctx.beginPath()
                      ctx.moveTo(qx, horizonY - 3.5); ctx.lineTo(qx + 3.5, horizonY)
                      ctx.lineTo(qx, horizonY + 3.5); ctx.lineTo(qx - 3.5, horizonY)
                      ctx.closePath()
                      ctx.fill()
                    }
                  } else if (atomic) {
                    // Horizon line strung with atom dots every six hours
                    ctx.strokeStyle = Qt.alpha(goldColor, 0.65)
                    ctx.lineWidth = 1.2
                    ctx.beginPath()
                    ctx.moveTo(padL, horizonY); ctx.lineTo(padL + plotW, horizonY)
                    ctx.stroke()
                    ctx.fillStyle = String(leafColor)
                    for (var aq = 0; aq <= 4; aq++) {
                      ctx.beginPath()
                      ctx.arc(fracToX(aq / 4.0), horizonY, (aq % 2 === 0) ? 2.6 : 1.8, 0, Math.PI * 2.0)
                      ctx.fill()
                    }
                  } else if (nouveau) {
                    // Undulating horizon vine with leaves at the quarter hours
                    ctx.strokeStyle = Qt.alpha(goldColor, 0.7)
                    ctx.lineWidth = 1.1
                    ctx.beginPath()
                    for (var vx = 0; vx <= plotW; vx += 2) {
                      var vy = horizonY + Math.sin(vx / plotW * Math.PI * 8.0) * 1.6
                      if (vx === 0) ctx.moveTo(padL + vx, vy)
                      else ctx.lineTo(padL + vx, vy)
                    }
                    ctx.stroke()
                    ctx.fillStyle = String(leafColor)
                    for (var lq = 1; lq <= 3; lq++) {
                      var lqx = fracToX(lq / 4.0)
                      root.ornLeaf(ctx, lqx, horizonY, -2.2, 6.0, 2.2)
                      root.ornLeaf(ctx, lqx, horizonY, -0.9, 6.0, 2.2)
                    }
                  } else {
                    ctx.save()
                    ctx.beginPath()
                    ctx.setLineDash([3, 3])
                    ctx.moveTo(padL, horizonY)
                    ctx.lineTo(padL + plotW, horizonY)
                    ctx.strokeStyle = Qt.alpha(fgColor, 0.24)
                    ctx.lineWidth = 1
                    ctx.stroke()
                    ctx.restore()
                  }

                  var pts = samples || []
                  if (pts.length > 1) {
                    // Daylight fill under positive sun altitude
                    ctx.save()
                    ctx.beginPath()
                    ctx.rect(padL, padT - 4, plotW, horizonY - padT + 4)
                    ctx.clip()

                    ctx.beginPath()
                    for (var i = 0; i < pts.length; i++) {
                      var sx = fracToX(pts[i].fraction)
                      var sy = altToY(pts[i].sunAlt)
                      if (i === 0) ctx.moveTo(sx, sy)
                      else ctx.lineTo(sx, sy)
                    }
                    ctx.lineTo(padL + plotW, horizonY)
                    ctx.lineTo(padL, horizonY)
                    ctx.closePath()
                    var grad = ctx.createLinearGradient(0, padT, 0, horizonY)
                    grad.addColorStop(0, Qt.alpha(sunColor, root.ornate ? root.ornA(0.16, 0.42) : 0.28))
                    grad.addColorStop(1, Qt.alpha(sunColor, 0.03))
                    ctx.fillStyle = grad
                    ctx.fill()

                    if (deco) {
                      // Vertical sunburst pinstripes inside the daylight dome
                      ctx.clip()
                      ctx.strokeStyle = Qt.alpha(goldColor, 0.22)
                      ctx.lineWidth = 1
                      for (var px = padL + 4; px < padL + plotW; px += 6) {
                        ctx.beginPath()
                        ctx.moveTo(px, padT - 4); ctx.lineTo(px, horizonY)
                        ctx.stroke()
                      }
                    }
                    ctx.restore()

                    // Moon 24h altitude trajectory (subtle dashed curve)
                    ctx.save()
                    ctx.beginPath()
                    ctx.setLineDash([2, 3])
                    for (var m = 0; m < pts.length; m++) {
                      var mx = fracToX(pts[m].fraction)
                      var my = altToY(pts[m].moonAlt)
                      if (m === 0) ctx.moveTo(mx, my)
                      else ctx.lineTo(mx, my)
                    }
                    ctx.strokeStyle = Qt.alpha(moonColor, 0.45)
                    ctx.lineWidth = 1.3
                    ctx.stroke()
                    ctx.restore()

                    // Sun 24h altitude trajectory (solid curve)
                    ctx.beginPath()
                    for (var k = 0; k < pts.length; k++) {
                      var kx = fracToX(pts[k].fraction)
                      var ky = altToY(pts[k].sunAlt)
                      if (k === 0) ctx.moveTo(kx, ky)
                      else ctx.lineTo(kx, ky)
                    }
                    ctx.strokeStyle = String(sunColor)
                    ctx.lineWidth = 2.0
                    ctx.stroke()
                  }

                  // Current time marker ("Now")
                  var nowFrac = (nowDate.getHours() * 60 + nowDate.getMinutes()) / 1440.0
                  var nowX = fracToX(nowFrac)
                  var curSunY = altToY(root.solarData.altitude)
                  var curMoonY = altToY(root.lunarData.altitude)

                  // Vertical cursor line
                  ctx.beginPath()
                  ctx.moveTo(nowX, padT)
                  ctx.lineTo(nowX, padT + plotH)
                  ctx.strokeStyle = Qt.alpha(fgColor, 0.22)
                  ctx.lineWidth = 1
                  ctx.stroke()

                  // Live Moon position dot on sky curve
                  ctx.beginPath()
                  ctx.arc(nowX, curMoonY, 3.6, 0, Math.PI * 2.0)
                  ctx.fillStyle = String(moonColor)
                  ctx.fill()
                  ctx.lineWidth = 1.2
                  ctx.strokeStyle = Qt.alpha(fgColor, 0.5)
                  ctx.stroke()

                  // Live Sun glow & position dot on sky curve
                  ctx.beginPath()
                  ctx.arc(nowX, curSunY, 7.0, 0, Math.PI * 2.0)
                  ctx.fillStyle = Qt.alpha(sunColor, 0.25)
                  ctx.fill()

                  if (atomic) {
                    // Sun as a starburst
                    root.ornStarburst(ctx, nowX, curSunY, 9.0, 6, String(sunColor))
                    ctx.beginPath()
                    ctx.arc(nowX, curSunY, 3.0, 0, Math.PI * 2.0)
                    ctx.fillStyle = String(sunColor)
                    ctx.fill()
                  } else if (nouveau) {
                    // Sun as a blossom
                    root.ornBlossom(ctx, nowX, curSunY, 7.5, String(petalColor), String(sunColor))
                  } else if (deco) {
                    // Sun as a rayed medallion
                    ctx.strokeStyle = String(sunColor)
                    ctx.lineWidth = 1
                    for (var ray = 0; ray < 8; ray++) {
                      var ra = ray * Math.PI / 4.0
                      ctx.beginPath()
                      ctx.moveTo(nowX + Math.cos(ra) * 5.0, curSunY + Math.sin(ra) * 5.0)
                      ctx.lineTo(nowX + Math.cos(ra) * 8.5, curSunY + Math.sin(ra) * 8.5)
                      ctx.stroke()
                    }
                    ctx.beginPath()
                    ctx.moveTo(nowX, curSunY - 4.2); ctx.lineTo(nowX + 4.2, curSunY)
                    ctx.lineTo(nowX, curSunY + 4.2); ctx.lineTo(nowX - 4.2, curSunY)
                    ctx.closePath()
                    ctx.fillStyle = String(sunColor)
                    ctx.fill()
                  } else {
                    ctx.beginPath()
                    ctx.arc(nowX, curSunY, 4.2, 0, Math.PI * 2.0)
                    ctx.fillStyle = String(sunColor)
                    ctx.fill()
                  }

                  // Time axis labels (00:00, 06:00, 12:00, 18:00, 24:00)
                  ctx.fillStyle = (deco || nouveau || atomic) ? Qt.alpha(goldColor, 0.8) : Qt.alpha(fgColor, 0.48)
                  ctx.font = deco ? "bold 9px sans-serif" : (nouveau ? "italic 10px serif" : (atomic ? "italic bold 10px sans-serif" : "10px sans-serif"))
                  ctx.textAlign = "left"
                  ctx.fillText("00:00", padL, h - 2)
                  ctx.textAlign = "center"
                  ctx.fillText("06:00", fracToX(0.25), h - 2)
                  ctx.fillText("12:00", fracToX(0.50), h - 2)
                  ctx.fillText("18:00", fracToX(0.75), h - 2)
                  ctx.textAlign = "right"
                  ctx.fillText("24:00", padL + plotW, h - 2)
                }
              }
            }
          }

          // ---- 2. Solar & Lunar Side-by-Side Hero Cards
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(8)

            // ================= SOLAR CARD =================
            Rectangle {
              Layout.fillWidth: true
              Layout.preferredWidth: 1
              Layout.fillHeight: true
              implicitHeight: solarCardCol.implicitHeight + Style.space(16)
              radius: trackerPopup.cardRadius
              color: trackerPopup.cardSurfaceColor
              border.width: 1
              border.color: trackerPopup.cardBorderColor
              OrnCardFrame {}

              ColumnLayout {
                id: solarCardCol
                anchors.fill: parent
                anchors.margins: Style.space(9)
                spacing: Style.space(6)

                // Solar Header
                RowLayout {
                  Layout.fillWidth: true
                  spacing: Style.space(8)

                  Rectangle {
                    width: Style.space(34)
                    height: Style.space(34)
                    radius: trackerPopup.cardRadius
                    color: Qt.alpha(trackerPopup.popupSolarColor, 0.16)
                    border.width: 1
                    border.color: root.ornate ? Qt.alpha(root.ornMetal, 0.7) : Qt.alpha(trackerPopup.popupSolarColor, 0.36)

                    Text {
                      anchors.centerIn: parent
                      textFormat: Text.PlainText
                      text: root.solarData.phaseIcon
                      color: trackerPopup.popupSolarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.space(18)
                    }
                  }

                  ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 1

                    Text {
                      textFormat: Text.PlainText
                      text: root.solarData.phaseName
                      color: Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.body
                      font.bold: true
                      font.capitalization: root.decoStyle ? Font.AllUppercase : Font.MixedCase
                      font.letterSpacing: root.decoStyle ? 1.2 : (root.nouveauStyle || root.atomicStyle ? 0.4 : 0)
                      elide: Text.ElideRight
                      Layout.fillWidth: true
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: (root.solarData.altitude >= 0 ? "+" : "")
                        + root.solarData.altitude.toFixed(1) + "° · "
                        + Math.round(root.solarData.azimuth) + "° " + root.solarData.compassDir
                      color: Color.foreground
                      opacity: 0.65
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }
                  }
                }

                // Daylight Length & Progress Bar
                ColumnLayout {
                  Layout.fillWidth: true
                  spacing: Style.space(3)

                  RowLayout {
                    Layout.fillWidth: true
                    Text {
                      textFormat: Text.PlainText
                      text: strings.t("solar.dayLength")
                      color: Color.foreground
                      opacity: 0.65
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                      textFormat: Text.PlainText
                      text: Model.formatDurationHm(root.solarData.dayLengthSeconds)
                      color: trackerPopup.popupSolarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      font.bold: true
                    }
                  }

                  Rectangle {
                    Layout.fillWidth: true
                    height: 5
                    radius: trackerPopup.barRadius
                    color: trackerPopup.barTrackColor

                    Rectangle {
                      width: Math.max(4, parent.width * Math.min(1.0, Math.max(0.0, root.solarData.dayLengthSeconds / 86400.0)))
                      height: parent.height
                      radius: parent.radius
                      color: trackerPopup.popupSolarColor
                    }
                  }
                }

                // Solar Timetable rows (Chronological with Blue Hour AM/PM & Golden Hour windows, zero redundancy)
                Repeater {
                  model: [
                    {
                      icon: "󰖚",
                      label: strings.t("solar.blueHourAm"),
                      value: Model.formatTimeRange(root.solarData.blueHourMorningStart, root.solarData.blueHourMorningEnd, root.timeFormatMode, root.formatLocale),
                      isBlue: true
                    },
                    {
                      icon: "󰖜",
                      label: strings.t("solar.sunrise"),
                      value: Model.formatTime(root.solarData.sunrise, root.timeFormatMode, root.formatLocale),
                      isBlue: false
                    },
                    {
                      icon: "󰖨",
                      label: strings.t(root.solarData.goldenHourIsMorning ? "solar.goldenHourAm" : "solar.goldenHourPm"),
                      value: Model.formatTimeRange(root.solarData.goldenHourWindowStart, root.solarData.goldenHourWindowEnd, root.timeFormatMode, root.formatLocale),
                      isBlue: false
                    },
                    {
                      icon: "󰖙",
                      label: strings.t("solar.solarNoon"),
                      value: Model.formatTime(root.solarData.solarNoon, root.timeFormatMode, root.formatLocale),
                      isBlue: false
                    },
                    {
                      icon: "󰖛",
                      label: strings.t("solar.sunset"),
                      value: Model.formatTime(root.solarData.sunset, root.timeFormatMode, root.formatLocale),
                      isBlue: false
                    },
                    {
                      icon: "󰖚",
                      label: strings.t("solar.blueHourPm"),
                      value: Model.formatTimeRange(root.solarData.blueHourEveningStart, root.solarData.blueHourEveningEnd, root.timeFormatMode, root.formatLocale),
                      isBlue: true
                    }
                  ]

                  RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: Style.space(4)

                    Text {
                      textFormat: Text.PlainText
                      text: modelData.icon
                      color: modelData.isBlue ? trackerPopup.popupBlueHourColor : trackerPopup.popupSolarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: modelData.label
                      color: modelData.isBlue ? trackerPopup.popupBlueHourColor : Color.foreground
                      opacity: modelData.isBlue ? 0.92 : 0.72
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      Layout.fillWidth: true
                      elide: Text.ElideRight
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: modelData.value
                      color: modelData.isBlue ? trackerPopup.popupBlueHourColor : Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      font.bold: true
                    }
                  }
                }
              }
            }

            // ================= LUNAR CARD =================
            Rectangle {
              Layout.fillWidth: true
              Layout.preferredWidth: 1
              Layout.fillHeight: true
              implicitHeight: lunarCardCol.implicitHeight + Style.space(16)
              radius: trackerPopup.cardRadius
              color: trackerPopup.cardSurfaceColor
              border.width: 1
              border.color: trackerPopup.cardBorderColor
              OrnCardFrame {}

              ColumnLayout {
                id: lunarCardCol
                anchors.fill: parent
                anchors.margins: Style.space(9)
                spacing: Style.space(6)

                // Lunar Hero Header with 40x40 Realistic Vector Moon Disc
                RowLayout {
                  Layout.fillWidth: true
                  spacing: Style.space(8)

                  MoonDisc {
                    discSize: 38
                    phase: root.lunarData.phase
                    litColor: trackerPopup.popupLunarLitColor
                    darkColor: root.ornatePalette ? root.ornMoonShadow(root.isLightPopup, 0.24) : (root.isLightPopup ? Qt.rgba(0.14, 0.19, 0.28, 0.24) : Qt.rgba(0.05, 0.08, 0.14, 0.85))
                    rimColor: Qt.alpha(trackerPopup.popupLunarColor, 0.55)
                    showCraters: true
                    renderStyle: root.moonStyle
                  }

                  ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 1

                    Text {
                      textFormat: Text.PlainText
                      text: root.lunarData.phaseName
                      color: Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.body
                      font.bold: true
                      font.capitalization: root.decoStyle ? Font.AllUppercase : Font.MixedCase
                      font.letterSpacing: root.decoStyle ? 1.2 : (root.nouveauStyle || root.atomicStyle ? 0.4 : 0)
                      elide: Text.ElideRight
                      Layout.fillWidth: true
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: strings.t("lunar.illumination").arg(Commons.I18n.formatNumber(root.lunarData.illuminationPct))
                        + " · " + (root.lunarData.waxing ? strings.t("lunar.waxing") : strings.t("lunar.waning"))
                      color: trackerPopup.popupLunarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      font.bold: true
                      elide: Text.ElideRight
                      Layout.fillWidth: true
                    }
                  }
                }

                // Illumination bar
                ColumnLayout {
                  Layout.fillWidth: true
                  spacing: Style.space(3)

                  RowLayout {
                    Layout.fillWidth: true
                    Text {
                      textFormat: Text.PlainText
                      text: strings.t("lunar.age")
                      color: Color.foreground
                      opacity: 0.65
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                      textFormat: Text.PlainText
                      text: Model.formatAgeDays(root.lunarData.ageDays) + " / 29.5d"
                      color: trackerPopup.popupLunarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      font.bold: true
                    }
                  }

                  Rectangle {
                    Layout.fillWidth: true
                    height: 5
                    radius: trackerPopup.barRadius
                    color: trackerPopup.barTrackColor

                    Rectangle {
                      width: Math.max(4, parent.width * Math.min(1.0, Math.max(0.0, root.lunarData.fraction)))
                      height: parent.height
                      radius: parent.radius
                      color: trackerPopup.popupLunarColor
                    }
                  }
                }

                // Lunar telemetry rows
                Repeater {
                  model: [
                    {
                      icon: "󰍍",
                      label: strings.t("solar.altitude"),
                      value: (root.lunarData.altitude >= 0 ? "+" : "") + root.lunarData.altitude.toFixed(1) + "° " + root.lunarData.compassDir
                    },
                    {
                      icon: "󰽥",
                      label: strings.t("lunar.riseSet"),
                      value: root.moonRiseSetText
                    },
                    {
                      icon: "󰞍",
                      label: strings.t("lunar.distance"),
                      value: Commons.I18n.formatNumber(root.lunarData.distanceKm) + " km"
                    },
                    {
                      icon: "󰭦",
                      label: strings.t("lunar.zodiac"),
                      value: root.lunarData.zodiacName
                    },
                    {
                      icon: root.lunarData.nextQuarterIsFirst ? "󰽡" : "󰽣",
                      label: strings.t("lunar.nextQuarter"),
                      value: root.lunarData.nextQuarterDate.toLocaleDateString(root.formatLocale, "MMM d") + " (" + Model.formatCountdownDays(root.lunarData.daysToQuarter) + ")"
                    },
                    {
                      icon: "󰽢",
                      label: strings.t("lunar.nextFull"),
                      value: root.lunarData.nextFullDate.toLocaleDateString(root.formatLocale, "MMM d") + " (" + Model.formatCountdownDays(root.lunarData.daysToFull) + ")"
                    },
                    {
                      icon: "󰽤",
                      label: strings.t("lunar.nextNew"),
                      value: root.lunarData.nextNewDate.toLocaleDateString(root.formatLocale, "MMM d") + " (" + Model.formatCountdownDays(root.lunarData.daysToNew) + ")"
                    }
                  ]

                  RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: Style.space(4)

                    Text {
                      textFormat: Text.PlainText
                      text: modelData.icon
                      color: trackerPopup.popupLunarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: modelData.label
                      color: Color.foreground
                      opacity: 0.72
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      Layout.fillWidth: true
                      elide: Text.ElideRight
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: modelData.value
                      color: Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                      font.bold: true
                    }
                  }
                }
              }
            }
          }

          // ---- 3. 7-Day Lunar Phase Forecast Strip
          Rectangle {
            Layout.fillWidth: true
            implicitHeight: forecastCol.implicitHeight + Style.space(14)
            radius: trackerPopup.cardRadius
            color: trackerPopup.cardSurfaceColor
            border.width: 1
            border.color: trackerPopup.cardBorderColor
            OrnCardFrame {}

            ColumnLayout {
              id: forecastCol
              anchors.fill: parent
              anchors.margins: Style.space(8)
              spacing: Style.space(6)

              RowLayout {
                Layout.fillWidth: true
                CardTitle {
                  text: (root.decoStyle ? "◆ " : (root.nouveauStyle ? "󰌪 " : (root.atomicStyle ? "✦ " : ""))) + strings.t("section.upcomingMoon")
                }
                Item { Layout.fillWidth: true }
                Text {
                  textFormat: Text.PlainText
                  text: root.lunarData.phaseName
                  color: trackerPopup.popupLunarColor
                  font.family: Style.font.family
                  font.pixelSize: Style.font.small || 11
                }
              }

              RowLayout {
                Layout.fillWidth: true
                spacing: Style.space(4)

                Repeater {
                  model: root.lunarData.forecast || []

                  Rectangle {
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    Layout.preferredHeight: Style.space(64)
                    radius: trackerPopup.chipRadius
                    color: index === 0
                      ? Qt.alpha(trackerPopup.popupLunarColor, root.isLightPopup ? 0.14 : 0.18)
                      : Qt.alpha(Color.foreground, root.isLightPopup ? 0.03 : 0.04)
                    // non-current days get a faint gold hairline in deco mode
                    readonly property color ornHairline: Qt.alpha(root.ornMetal, 0.25)
                    border.width: index === 0 ? 1 : (root.ornate ? 1 : 0)
                    border.color: index === 0
                      ? (root.ornate ? Qt.alpha(root.ornMetal, 0.8) : Qt.alpha(trackerPopup.popupLunarColor, 0.42))
                      : ornHairline

                    ColumnLayout {
                      anchors.fill: parent
                      anchors.margins: Style.space(4)
                      spacing: 2

                      Text {
                        Layout.alignment: Qt.AlignHCenter
                        textFormat: Text.PlainText
                        text: index === 0
                          ? "Now"
                          : modelData.date.toLocaleDateString(root.formatLocale, "ddd")
                        color: index === 0 ? trackerPopup.popupLunarColor : Color.foreground
                        opacity: index === 0 ? 1.0 : 0.72
                        font.family: Style.font.family
                        font.pixelSize: Style.font.small || 10
                        font.bold: index === 0
                      }

                      MoonDisc {
                        Layout.alignment: Qt.AlignHCenter
                        discSize: 20
                        phase: modelData.phase
                        litColor: trackerPopup.popupLunarLitColor
                        darkColor: root.ornatePalette ? root.ornMoonShadow(root.isLightPopup, 0.22) : (root.isLightPopup ? Qt.rgba(0.14, 0.19, 0.28, 0.22) : Qt.rgba(0.05, 0.08, 0.14, 0.82))
                        rimColor: Qt.alpha(trackerPopup.popupLunarColor, 0.5)
                        renderStyle: root.moonStyle
                      }

                      Text {
                        Layout.alignment: Qt.AlignHCenter
                        textFormat: Text.PlainText
                        text: Commons.I18n.formatNumber(modelData.illuminationPct) + "%"
                        color: Color.foreground
                        opacity: 0.85
                        font.family: Style.font.family
                        font.pixelSize: Style.font.small || 10
                        font.bold: index === 0
                      }
                    }
                  }
                }
              }
            }
          }

          // ---- 4. Sun's Yearly Path: analemma figure-8 + next equinox/solstice countdown
          Rectangle {
            Layout.fillWidth: true
            implicitHeight: seasonCol.implicitHeight + Style.space(14)
            radius: trackerPopup.cardRadius
            color: trackerPopup.cardSurfaceColor
            border.width: 1
            border.color: trackerPopup.cardBorderColor
            OrnCardFrame {}

            ColumnLayout {
              id: seasonCol
              anchors.fill: parent
              anchors.margins: Style.space(8)
              spacing: Style.space(6)

              RowLayout {
                Layout.fillWidth: true
                CardTitle {
                  text: (root.decoStyle ? "◆ " : (root.nouveauStyle ? "󰌪 " : (root.atomicStyle ? "✦ " : ""))) + strings.t("section.analemma")
                }
                Item { Layout.fillWidth: true }
                Text {
                  textFormat: Text.PlainText
                  text: root.analemmaData
                    ? strings.t("analemma.summary")
                        .arg(Model.formatSundialOffset(root.analemmaData.today.eot))
                        .arg(Math.round(root.analemmaData.today.alt))
                    : ""
                  color: trackerPopup.popupSolarColor
                  font.family: Style.font.family
                  font.pixelSize: Style.font.small || 11
                  font.bold: true
                }
              }

              Canvas {
                id: analemmaCanvas
                Layout.fillWidth: true
                Layout.preferredHeight: Style.space(72)
                visible: root.analemmaData !== null
                antialiasing: true

                property var analemma: root.analemmaData
                property color lineColor: root.ornate ? root.ornMetal : Color.foreground
                property color pathColor: trackerPopup.popupSolarColor
                property color markColor: root.ornate && root.ornatePalette ? root.ornPrimary : trackerPopup.popupLunarColor
                property color petalColor: root.ornFlower
                property color textColor: Color.foreground
                property string style: root.moonStyle
                property bool bold: root.useBoldColors
                readonly property real plotPadL: 44
                readonly property real plotPadR: 44
                readonly property real plotPadT: 14
                readonly property real plotPadB: 16

                // Nearest day of the year on the figure-8 to a point. Where the two loops cross,
                // several days are equally near: take the one closest in time to the date shown,
                // so a drag follows the loop it is on instead of jumping to the other.
                function dayNear(px, py) {
                  var a = analemma
                  if (!a) return -1
                  var w = width, h = height
                  var altSpan = Math.max(1.0, a.maxAlt - a.minAlt)
                  var eotSpan = Math.max(Math.abs(a.minEot), Math.abs(a.maxEot), 1.0)
                  var midY = plotPadT + (h - plotPadT - plotPadB) / 2.0
                  var dist = []
                  var bestD = 1e9
                  for (var i = 0; i < a.curve.length; i++) {
                    var p = a.curve[i]
                    var x = plotPadL + (p.alt - a.minAlt) / altSpan * (w - plotPadL - plotPadR)
                    var y = midY - p.eot / eotSpan * ((h - plotPadT - plotPadB) / 2.0)
                    var dd = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py))
                    dist.push(dd)
                    if (dd < bestD) bestD = dd
                  }
                  var shown = Math.round((Date.UTC(root.currentDate.getFullYear(), root.currentDate.getMonth(), root.currentDate.getDate())
                    - Date.UTC(a.year, 0, 1)) / 86400000)
                  var best = -1, bestGap = 1e9
                  for (var k = 0; k < dist.length; k++) {
                    if (dist[k] > bestD + 5) continue
                    var gap = Math.abs(k - shown)
                    gap = Math.min(gap, 366 - gap)
                    if (gap < bestGap) { bestGap = gap; best = k }
                  }
                  return best
                }
                function jumpTo(px, py) {
                  var i = dayNear(px, py)
                  if (i < 0) return
                  root.viewDate(new Date(analemma.year, 0, 1 + i, 12, 0, 0))
                }

                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  acceptedButtons: Qt.LeftButton
                  onPressed: function(mouse) { analemmaCanvas.jumpTo(mouse.x, mouse.y) }
                  onPositionChanged: function(mouse) { if (pressed) analemmaCanvas.jumpTo(mouse.x, mouse.y) }
                  onWheel: function(wheel) {
                    var step = (wheel.modifiers & Qt.ShiftModifier) ? 7 : 1
                    var dir = (wheel.angleDelta.y !== 0 ? wheel.angleDelta.y : wheel.angleDelta.x) > 0 ? -1 : 1
                    root.stepView(dir * step)
                    wheel.accepted = true
                  }
                }

                onAnalemmaChanged: requestPaint()
                onLineColorChanged: requestPaint()
                onPathColorChanged: requestPaint()
                onMarkColorChanged: requestPaint()
                onTextColorChanged: requestPaint()
                onStyleChanged: requestPaint()
                onBoldChanged: requestPaint()
                onWidthChanged: requestPaint()

                onPaint: {
                  var ctx = getContext("2d")
                  ctx.reset()
                  var a = analemma
                  var w = width, h = height
                  if (!a || w < 80 || h < 40) return

                  // Lying on its side: x = noon altitude (low -> high), y = equation of time (sundial fast = up)
                  var padL = plotPadL, padR = plotPadR, padT = plotPadT, padB = plotPadB
                  var altSpan = Math.max(1.0, a.maxAlt - a.minAlt)
                  var eotSpan = Math.max(Math.abs(a.minEot), Math.abs(a.maxEot), 1.0)
                  var midY = padT + (h - padT - padB) / 2.0
                  function X(p) { return padL + (p.alt - a.minAlt) / altSpan * (w - padL - padR) }
                  function Y(p) { return midY - p.eot / eotSpan * ((h - padT - padB) / 2.0) }

                  // Clock = sundial reference line
                  ctx.save()
                  ctx.setLineDash([2, 4])
                  ctx.strokeStyle = Qt.alpha(textColor, 0.25)
                  ctx.lineWidth = 1
                  ctx.beginPath(); ctx.moveTo(padL - 6, midY); ctx.lineTo(w - padR + 6, midY); ctx.stroke()
                  ctx.restore()

                  function trace(points, close) {
                    ctx.beginPath()
                    for (var i = 0; i < points.length; i++) {
                      if (i === 0) ctx.moveTo(X(points[i]), Y(points[i]))
                      else ctx.lineTo(X(points[i]), Y(points[i]))
                    }
                    if (close) ctx.closePath()
                  }

                  // The figure-8
                  var curveWidth = bold ? 2.0 : 1.3
                  if (style === "deco") {
                    // gilded double line
                    ctx.strokeStyle = Qt.alpha(lineColor, 0.35)
                    ctx.lineWidth = curveWidth + 2.6
                    trace(a.curve, true); ctx.stroke()
                  }
                  ctx.strokeStyle = String(lineColor)
                  ctx.lineWidth = curveWidth
                  trace(a.curve, true); ctx.stroke()

                  // Monthly beads: diamonds (deco), leaves (nouveau), atom dots (atomic)
                  ctx.fillStyle = String(markColor)
                  for (var m = 15; m < a.curve.length; m += 30) {
                    var mp = a.curve[m], mx = X(mp), my = Y(mp)
                    if (style === "deco") {
                      ctx.beginPath(); ctx.moveTo(mx, my - 2.4); ctx.lineTo(mx + 2.4, my); ctx.lineTo(mx, my + 2.4); ctx.lineTo(mx - 2.4, my); ctx.closePath(); ctx.fill()
                    } else if (style === "nouveau") {
                      var nb = a.curve[Math.min(a.curve.length - 1, m + 1)]
                      var ang = Math.atan2(Y(nb) - my, X(nb) - mx) + ((m / 30) % 2 === 0 ? -1.2 : 1.2)
                      root.ornLeaf(ctx, mx, my, ang, 6.0, 2.2)
                    } else {
                      ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2.0); ctx.fill()
                    }
                  }

                  // Today -> next equinox/solstice, drawn bright
                  if (a.path && a.path.length > 1) {
                    ctx.strokeStyle = String(pathColor)
                    ctx.lineWidth = curveWidth + 1.4
                    ctx.lineCap = "round"
                    trace(a.path, false); ctx.stroke()
                  }

                  // Equinox / solstice markers and labels
                  ctx.font = (style === "nouveau" ? "italic " : (style === "atomic" ? "italic bold " : "bold ")) + "9px sans-serif"
                  for (var e = 0; e < a.events.length; e++) {
                    var ev = a.events[e]
                    var ex = X(ev), ey = Y(ev)
                    var isNext = ev.kind === a.nextKind
                    ctx.fillStyle = isNext ? String(pathColor) : String(markColor)
                    ctx.beginPath(); ctx.arc(ex, ey, isNext ? 3.4 : 2.6, 0, Math.PI * 2.0); ctx.fill()
                    ctx.strokeStyle = String(lineColor); ctx.lineWidth = 1
                    ctx.stroke()

                    var line1 = ev.date.toLocaleDateString(root.formatLocale, "MMM d")
                    var line2 = strings.t(ev.isSolstice ? "analemma.solstice" : "analemma.equinox")
                    ctx.fillStyle = isNext ? String(pathColor) : Qt.alpha(textColor, 0.75)
                    if (ev.isSolstice) {
                      // beside the tips of the 8
                      var left = ex < w / 2.0
                      ctx.textAlign = left ? "right" : "left"
                      var tx = left ? ex - 7 : ex + 7
                      ctx.fillText(line1, tx, ey - 1)
                      ctx.fillText(line2, tx, ey + 9)
                    } else {
                      // above the upper loop point, below the lower one
                      ctx.textAlign = "center"
                      var above = ey <= midY
                      var ty = above ? ey - 14 : ey + 12
                      ctx.fillText(line1 + " · " + line2, ex, ty + (above ? 0 : 2))
                    }
                  }

                  // Today's Sun, in the theme's mark
                  var tp = a.today, tX = X(tp), tY = Y(tp)
                  if (style === "atomic") {
                    root.ornStarburst(ctx, tX, tY, 8.0, 6, String(pathColor))
                    ctx.fillStyle = String(pathColor)
                    ctx.beginPath(); ctx.arc(tX, tY, 2.8, 0, Math.PI * 2.0); ctx.fill()
                  } else if (style === "nouveau") {
                    root.ornBlossom(ctx, tX, tY, 7.0, String(petalColor), String(pathColor))
                  } else {
                    ctx.fillStyle = String(pathColor)
                    ctx.beginPath(); ctx.moveTo(tX, tY - 5); ctx.lineTo(tX + 5, tY); ctx.lineTo(tX, tY + 5); ctx.lineTo(tX - 5, tY); ctx.closePath(); ctx.fill()
                    ctx.strokeStyle = String(lineColor); ctx.lineWidth = 1; ctx.stroke()
                  }

                  // Axis hints
                  ctx.fillStyle = Qt.alpha(textColor, 0.45)
                  ctx.font = "8px sans-serif"
                  ctx.textAlign = "left"
                  ctx.fillText(Math.round(a.minAlt) + "°", 2, h - 3)
                  ctx.textAlign = "right"
                  ctx.fillText(Math.round(a.maxAlt) + "°", w - 2, h - 3)
                  ctx.textAlign = "left"
                  ctx.fillText(strings.t("analemma.fast"), 2, 9)
                  ctx.fillText(strings.t("analemma.slow"), 2, midY + (h - padB - midY) - 2)
                }
              }

              // Hairline between the figure-8 and the countdown it leads to
              Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                color: root.ornate ? Qt.alpha(root.ornMetal, root.ornA(0.25, 0.5)) : Qt.alpha(Color.foreground, 0.12)
              }

              RowLayout {
                Layout.fillWidth: true
                spacing: Style.space(8)

                Text {
                  Layout.alignment: Qt.AlignVCenter
                  textFormat: Text.PlainText
                  text: root.seasonData.nextIcon
                  color: trackerPopup.popupSolarColor
                  font.family: Style.font.family
                  font.pixelSize: Math.round((Style.font.size || 13) * 1.6)
                }

                ColumnLayout {
                  Layout.fillWidth: true
                  spacing: 1

                  RowLayout {
                    Layout.fillWidth: true
                    Text {
                      textFormat: Text.PlainText
                      text: root.seasonData.nextEventName
                      color: root.ornate ? root.ornMetal : Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.size || 13
                      font.bold: true
                      font.capitalization: root.decoStyle ? Font.AllUppercase : Font.MixedCase
                      font.letterSpacing: root.decoStyle ? 1.6 : (root.nouveauStyle ? 0.6 : 0)
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                      textFormat: Text.PlainText
                      text: Model.formatSeasonCountdown(root.seasonData.calendarDaysUntil)
                      color: trackerPopup.popupSolarColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.size || 13
                      font.bold: true
                    }
                  }

                  RowLayout {
                    Layout.fillWidth: true
                    Text {
                      textFormat: Text.PlainText
                      text: root.seasonData.nextDate.toLocaleDateString(root.formatLocale, "ddd, MMM d")
                        + " · " + Model.formatTime(root.seasonData.nextDate, root.timeFormatMode, root.formatLocale)
                      color: Color.foreground
                      opacity: 0.72
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                      textFormat: Text.PlainText
                      text: strings.t("season.dayOf")
                        .arg(root.seasonData.currentSeasonName)
                        .arg(root.seasonData.seasonDay)
                        .arg(root.seasonData.seasonLengthDays)
                      color: Color.foreground
                      opacity: 0.72
                      font.family: Style.font.family
                      font.pixelSize: Style.font.small || 11
                    }
                  }
                }
              }

              Rectangle {
                Layout.fillWidth: true
                height: 5
                radius: trackerPopup.barRadius
                color: trackerPopup.barTrackColor

                Rectangle {
                  width: Math.max(4, parent.width * root.seasonData.seasonProgress)
                  height: parent.height
                  radius: parent.radius
                  color: trackerPopup.popupSolarColor
                }
              }
            }
          }
        }

        // ======================================================================
        // SETTINGS VIEW (Right-click or Gear button)
        // ======================================================================
        ColumnLayout {
          id: settingsView
          visible: root.settingsOpen
          Layout.fillWidth: true
          spacing: Style.space(8)

          OrnCrest {
            visible: root.ornate
          }

          // Bar Display Mode selector
          SectionHeading {
            text: strings.t("settings.barDisplay")
          }

          GridLayout {
            Layout.fillWidth: true
            columns: 3
            columnSpacing: Style.space(4)
            rowSpacing: Style.space(4)

            Repeater {
              model: [
                { key: "both",     label: "󰖙 󰽢 Both" },
                { key: "compact",  label: "󰖙 󰽥 Icons" },
                { key: "detailed", label: "󰖜 󰽢 Detailed" },
                { key: "dynamic",  label: "󰖨 Dynamic" },
                { key: "lunar",    label: "󰽢 Lunar" },
                { key: "solar",    label: "󰖙 Solar" }
              ]

              ChoiceButton {
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredHeight: Style.space(28)
                selected: root.displayMode === modelData.key
                text: modelData.label
                onClicked: root.selectDisplayMode(modelData.key)
              }
            }
          }

          // Color Mode selector
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(4)

            RowLabel {
              text: strings.t("settings.colorMode")
            }

            Repeater {
              model: [
                { key: "celestial", label: "Soft" },
                { key: "bold",      label: "Bold" },
                { key: "theme",     label: "Theme" }
              ]

              ChoiceButton {
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredHeight: Style.space(28)
                selected: root.colorMode === modelData.key
                text: modelData.label
                onClicked: root.selectColorMode(modelData.key)
              }
            }
          }

          // Moon Renderer selector
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(4)

            RowLabel {
              text: strings.t("settings.moonStyle")
            }

            Repeater {
              model: [
                { key: "atomic",  label: "Atomic" },
                { key: "deco",    label: "Art Deco" },
                { key: "nouveau", label: "Art Nouveau" }
              ]

              ChoiceButton {
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredHeight: Style.space(28)
                selected: root.moonStyle === modelData.key
                text: modelData.label
                onClicked: root.selectMoonStyle(modelData.key)
              }
            }
          }

          // Time Format selector
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(4)

            RowLabel {
              text: strings.t("settings.timeFormat")
            }

            Repeater {
              model: [
                { key: "auto", label: "Auto" },
                { key: "12",   label: "12-Hour" },
                { key: "24",   label: "24-Hour" }
              ]

              ChoiceButton {
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredHeight: Style.space(28)
                selected: root.timeFormatMode === modelData.key
                text: modelData.label
                onClicked: root.selectTimeFormat(modelData.key)
              }
            }
          }

          // Weather next to the city
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(4)

            RowLabel {
              text: strings.t("settings.weather")
            }

            Repeater {
              model: [
                { key: "auto", label: "Auto" },
                { key: "c",    label: "°C" },
                { key: "f",    label: "°F" },
                { key: "off",  label: "Off" }
              ]

              ChoiceButton {
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredHeight: Style.space(28)
                selected: root.weatherMode === modelData.key
                text: modelData.label
                onClicked: root.selectWeather(modelData.key)
              }
            }
          }

          // Location Source & Override section
          OrnDivider {}

          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(6)

            Text {
              textFormat: Text.PlainText
              text: strings.t("settings.locationSource") + ": "
                + (root.effectiveLocation.source === "manual" ? "Manual Override"
                  : (root.effectiveLocation.source === "weather" ? "Omarchy Weather Sync"
                  : (root.effectiveLocation.source === "geo" ? "Auto IP Geolocation"
                  : (root.effectiveLocation.source === "timezone" ? "System Timezone (" + root.systemTimezone + ")" : "UTC Offset Estimate"))))
              color: root.ornate ? root.ornMetal : Color.foreground
              opacity: root.ornate ? 0.92 : 0.78
              font.family: Style.font.family
              font.pixelSize: Style.font.small || 11
              font.bold: true
              font.letterSpacing: root.ornate ? 0.8 : 0
              elide: Text.ElideRight
              Layout.fillWidth: true
            }

            ChoiceButton {
              visible: root.effectiveLocation.source === "manual"
              Layout.preferredHeight: Style.space(24)
              text: "Use Auto"
              onClicked: root.clearCustomCoords()
            }

            ChoiceButton {
              Layout.preferredHeight: Style.space(24)
              selected: root.editingCustomCoords
              text: root.editingCustomCoords ? "Cancel" : "Set Lat/Lon"
              onClicked: {
                if (!root.editingCustomCoords) {
                  latField.text = String(setting("latitude", "")) || String(root.activeLat.toFixed(4))
                  lonField.text = String(setting("longitude", "")) || String(root.activeLon.toFixed(4))
                  nameField.text = String(setting("locationName", "")) || root.activeLocationName
                }
                root.editingCustomCoords = !root.editingCustomCoords
              }
            }
          }

          // Manual Coordinate Input Row
          ColumnLayout {
            visible: root.editingCustomCoords
            Layout.fillWidth: true
            spacing: Style.space(6)

            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(6)

              TextField {
                id: nameField
                accent: root.ornate ? root.ornMetal : Color.accent
                Layout.fillWidth: true
                placeholderText: "Label (e.g. Lisbon)"
              }

              TextField {
                id: latField
                accent: root.ornate ? root.ornMetal : Color.accent
                Layout.preferredWidth: Style.space(92)
                placeholderText: "Lat (38.72)"
              }

              TextField {
                id: lonField
                accent: root.ornate ? root.ornMetal : Color.accent
                Layout.preferredWidth: Style.space(92)
                placeholderText: "Lon (-9.14)"
              }

              ChoiceButton {
                Layout.preferredHeight: Style.space(30)
                selected: true
                text: "Save"
                onClicked: {
                  root.applyCustomCoords(latField.text, lonField.text, nameField.text)
                }
              }
            }
          }
        }
      }
    }

    // Fade hinting at more content below
    Rectangle {
      visible: popupScroll.interactive && !popupScroll.atYEnd
      anchors.bottom: popupScroll.bottom
      width: popupScroll.width
      height: Style.space(22)
      gradient: Gradient {
        GradientStop { position: 0.0; color: "transparent" }
        GradientStop { position: 1.0; color: Color.popups.background }
      }
    }
  }
}
