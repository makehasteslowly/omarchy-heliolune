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
  moduleName: "solar-lunar-tracker"
  readonly property string pluginId: "solar-lunar-tracker"

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
    var v = String(setting("moonStyle", "vector")).toLowerCase()
    if (v === "vector" || v === "glyph") return v
    return "vector"
  }
  readonly property string moonStyle: root.localMoonStyleOverride !== ""
    ? root.localMoonStyleOverride
    : root.configuredMoonStyle

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

  function resolveSolarColor(forPopup, isDaytime) {
    var onLight = forPopup ? root.isLightPopup : root.isLightBar
    if (root.useThemeColors) {
      if (!forPopup && Color.bar && Color.bar.active !== undefined) return Color.bar.active
      return Color.accent
    }
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
    var hex = root.useBoldColors
      ? (onLight ? "#0284C7" : "#7DD3FC")
      : (onLight ? "#475569" : "#E2E8F0")
    return Qt.color(hex)
  }

  // ---- Location state (Manual settings -> Omarchy weather.json -> IP geo -> Timezone fallback)
  property var weatherLocationState: ({ name: "", latitude: null, longitude: null })
  property var detectedLocationState: ({ name: "", latitude: null, longitude: null })
  property bool detectingGeo: false

  readonly property var effectiveLocation: Model.resolveLocation(root.settings, root.weatherLocationState, root.detectedLocationState)
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
      root.recalculate()
    }
    onLoadFailed: {
      root.weatherLocationState = Model.parseLocationFile("")
      root.checkAutoGeo()
      root.recalculate()
    }
  }

  function checkAutoGeo() {
    if (root.effectiveLocation.source === "fallback" && !root.detectingGeo && !geoProc.running) {
      root.detectingGeo = true
      geoProc.running = true
    }
  }

  Process {
    id: geoProc
    command: ["curl", "-fsS", "--max-time", "4", "https://geo.omarchy.org/"]
    stdout: StdioCollector {
      onStreamFinished: {
        var parsed = Model.parseLocationFile(text)
        if (parsed.latitude !== null && parsed.longitude !== null) {
          root.detectedLocationState = parsed
          root.recalculate()
        }
      }
    }
    onExited: {
      root.detectingGeo = false
    }
  }

  // ---- Astronomical state
  property date currentDate: new Date()
  property var solarData: Model.computeSolarSummary(currentDate, activeLat, activeLon)
  property var lunarData: Model.computeLunarSummary(currentDate, activeLat, activeLon)
  property var skySamples: []

  readonly property var formatLocale: Qt.locale(Commons.I18n.formatLocale)

  function recalculate() {
    var now = new Date()
    root.currentDate = now
    root.solarData = Model.computeSolarSummary(now, root.activeLat, root.activeLon)
    root.lunarData = Model.computeLunarSummary(now, root.activeLat, root.activeLon)
    if (root.opened) {
      root.rebuildSkySamples(now)
    }
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
    onTriggered: root.recalculate()
  }

  Component.onCompleted: {
    weatherLocationFile.reload()
    root.recalculate()
    Qt.callLater(root.checkAutoGeo)
  }

  // ---- Popup state & Omarchy bar popout contract
  property bool opened: false
  property bool settingsOpen: false
  property bool editingCustomCoords: false
  property string customLatInput: ""
  property string customLonInput: ""
  property string customNameInput: ""

  function open() {
    root.settingsOpen = false
    root.recalculate()
    root.rebuildSkySamples(root.currentDate)
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
    weatherLocationFile.reload()
    if (root.effectiveLocation.source === "fallback" || root.effectiveLocation.source === "geo") {
      root.checkAutoGeo()
    }
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
    var s = (style === "glyph") ? "glyph" : "vector"
    root.localMoonStyleOverride = s
    root.saveBarSetting("moonStyle", s)
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
    target: "solar-lunar-tracker"

    function refresh(): void { root.broadcast("refresh") }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
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

    width: discSize
    height: discSize
    antialiasing: true

    onPhaseChanged: requestPaint()
    onLitColorChanged: requestPaint()
    onDarkColorChanged: requestPaint()
    onRimColorChanged: requestPaint()
    onDiscSizeChanged: requestPaint()

    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()

      var w = width
      var h = height
      var cx = w / 2.0
      var cy = h / 2.0
      var r = Math.max(2.0, Math.min(w, h) / 2.0 - 1.0)

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

  implicitWidth: root.vertical ? root.barSize : Math.max(Style.bar.iconSlot, barContentRow.implicitWidth + Style.space(16))
  implicitHeight: root.vertical ? Math.max(Style.bar.iconSlot, barContentCol.implicitHeight + Style.space(12)) : root.barSize

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
      + root.lunarData.phaseName + " (" + root.lunarData.illuminationPct + "%) · Right-click: settings"
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

      // Subtle separator when both Solar & Lunar are shown
      Rectangle {
        visible: root.showSolarOnBar && root.showLunarOnBar
        width: 3
        height: 3
        radius: 1.5
        anchors.verticalCenter: parent.verticalCenter
        color: Color.foreground
        opacity: 0.32
      }

      // Lunar group
      Row {
        visible: root.showLunarOnBar
        spacing: Style.space(4)
        anchors.verticalCenter: parent.verticalCenter

        MoonDisc {
          visible: root.moonStyle === "vector"
          anchors.verticalCenter: parent.verticalCenter
          discSize: 13
          phase: root.lunarData.phase
          litColor: root.barLunarLitColor
          darkColor: root.isLightBar ? Qt.rgba(0.15, 0.2, 0.3, 0.22) : Qt.rgba(0.06, 0.09, 0.16, 0.72)
          rimColor: Qt.alpha(root.barLunarColor, root.isLightBar ? 0.55 : 0.45)
        }

        Text {
          visible: root.moonStyle === "glyph"
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: root.lunarData.phaseIcon
          color: root.barLunarColor
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Math.round(Style.font.body * 1.12)
          renderType: Text.CurveRendering
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

      MoonDisc {
        visible: root.showLunarOnBar && root.moonStyle === "vector"
        anchors.horizontalCenter: parent.horizontalCenter
        discSize: 13
        phase: root.lunarData.phase
        litColor: root.barLunarLitColor
        darkColor: root.isLightBar ? Qt.rgba(0.15, 0.2, 0.3, 0.22) : Qt.rgba(0.06, 0.09, 0.16, 0.72)
        rimColor: Qt.alpha(root.barLunarColor, 0.48)
      }

      Text {
        visible: root.showLunarOnBar && root.moonStyle === "glyph"
        anchors.horizontalCenter: parent.horizontalCenter
        textFormat: Text.PlainText
        text: root.lunarData.phaseIcon
        color: root.barLunarColor
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Math.round(Style.font.body * 1.1)
      }
    }
  }

  // ============================================================================
  // Main Tracker & Settings PopupCard
  // ============================================================================
  PopupCard {
    id: trackerPopup
    owner: root
    anchorItem: barButton
    bar: root.bar
    open: root.opened
    contentWidth: Style.space(456)
    contentHeight: fittedContentHeight(mainColumn.implicitHeight)

    readonly property color popupSolarColor: root.resolveSolarColor(true, root.solarData.isDay)
    readonly property color popupLunarColor: root.resolveLunarColor(true)
    readonly property color popupLunarLitColor: root.resolveLunarLitColor(true)
    readonly property color cardSurfaceColor: root.isLightPopup
      ? Qt.alpha(Color.foreground, 0.05)
      : Qt.rgba(0, 0, 0, 0.24)
    readonly property color cardBorderColor: Qt.alpha(Color.foreground, root.isLightPopup ? 0.12 : 0.14)

    ColumnLayout {
      id: mainColumn
      width: parent.width
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
              text: root.settingsOpen ? strings.t("section.settings") : strings.t("plugin.title")
              color: Color.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              font.bold: true
            }

            // Daylight vs yesterday badge
            Rectangle {
              visible: !root.settingsOpen
              height: Style.space(18)
              width: deltaLabel.implicitWidth + Style.space(10)
              radius: Math.max(3, Style.cornerRadius - 3)
              color: Qt.alpha(trackerPopup.popupSolarColor, root.isLightPopup ? 0.14 : 0.18)
              border.width: 1
              border.color: Qt.alpha(trackerPopup.popupSolarColor, 0.35)

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

          // Location subtitle
          Text {
            textFormat: Text.PlainText
            text: "󰍎 " + root.activeLocationName
              + "  (" + (root.activeLat >= 0 ? root.activeLat.toFixed(2) + "°N" : Math.abs(root.activeLat).toFixed(2) + "°S")
              + ", " + (root.activeLon >= 0 ? root.activeLon.toFixed(2) + "°E" : Math.abs(root.activeLon).toFixed(2) + "°W") + ")"
            color: Color.foreground
            opacity: 0.62
            font.family: Style.font.family
            font.pixelSize: Style.font.small || 11
            elide: Text.ElideRight
            Layout.fillWidth: true
          }
        }

        // Refresh button
        Button {
          Layout.preferredWidth: Style.space(28)
          Layout.preferredHeight: Style.space(28)
          bordered: true
          text: "󰑐"
          onClicked: root.refresh()
        }

        // Toggle Settings / Tracker view button
        Button {
          Layout.preferredWidth: Style.space(28)
          Layout.preferredHeight: Style.space(28)
          bordered: true
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
          radius: Math.max(4, Style.cornerRadius - 2)
          color: trackerPopup.cardSurfaceColor
          border.width: 1
          border.color: trackerPopup.cardBorderColor
          clip: true

          ColumnLayout {
            anchors.fill: parent
            anchors.margins: Style.space(8)
            spacing: Style.space(4)

            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(6)

              Text {
                textFormat: Text.PlainText
                text: strings.t("section.skyHorizon")
                color: Color.foreground
                opacity: 0.72
                font.family: Style.font.family
                font.pixelSize: Style.font.small || 11
                font.bold: true
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

              onSamplesChanged: requestPaint()
              onNowDateChanged: requestPaint()
              onSunColorChanged: requestPaint()
              onMoonColorChanged: requestPaint()
              onFgColorChanged: requestPaint()

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
                ctx.save()
                ctx.beginPath()
                ctx.setLineDash([3, 3])
                ctx.moveTo(padL, horizonY)
                ctx.lineTo(padL + plotW, horizonY)
                ctx.strokeStyle = Qt.alpha(fgColor, 0.24)
                ctx.lineWidth = 1
                ctx.stroke()
                ctx.restore()

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
                  grad.addColorStop(0, Qt.alpha(sunColor, 0.28))
                  grad.addColorStop(1, Qt.alpha(sunColor, 0.03))
                  ctx.fillStyle = grad
                  ctx.fill()
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

                ctx.beginPath()
                ctx.arc(nowX, curSunY, 4.2, 0, Math.PI * 2.0)
                ctx.fillStyle = String(sunColor)
                ctx.fill()

                // Time axis labels (00:00, 06:00, 12:00, 18:00, 24:00)
                ctx.fillStyle = Qt.alpha(fgColor, 0.48)
                ctx.font = "10px sans-serif"
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
            radius: Math.max(4, Style.cornerRadius - 2)
            color: trackerPopup.cardSurfaceColor
            border.width: 1
            border.color: trackerPopup.cardBorderColor

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
                  radius: Math.max(4, Style.cornerRadius - 2)
                  color: Qt.alpha(trackerPopup.popupSolarColor, 0.16)
                  border.width: 1
                  border.color: Qt.alpha(trackerPopup.popupSolarColor, 0.36)

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
                  radius: 2.5
                  color: Qt.alpha(Color.foreground, 0.12)

                  Rectangle {
                    width: Math.max(4, parent.width * Math.min(1.0, Math.max(0.0, root.solarData.dayLengthSeconds / 86400.0)))
                    height: parent.height
                    radius: parent.radius
                    color: trackerPopup.popupSolarColor
                  }
                }
              }

              // Solar Timetable rows
              Repeater {
                model: [
                  { icon: "󰖜", label: strings.t("solar.dawn"),       value: Model.formatTime(root.solarData.dawn, root.timeFormatMode, root.formatLocale) },
                  { icon: "󰖜", label: strings.t("solar.sunrise"),    value: Model.formatTime(root.solarData.sunrise, root.timeFormatMode, root.formatLocale) },
                  { icon: "󰖨", label: strings.t("solar.goldenHour"), value: Model.formatTime(root.solarData.goldenHourStart, root.timeFormatMode, root.formatLocale) },
                  { icon: "󰖙", label: strings.t("solar.solarNoon"),  value: Model.formatTime(root.solarData.solarNoon, root.timeFormatMode, root.formatLocale) },
                  { icon: "󰖛", label: strings.t("solar.sunset"),     value: Model.formatTime(root.solarData.sunset, root.timeFormatMode, root.formatLocale) },
                  { icon: "󰖔", label: strings.t("solar.dusk"),       value: Model.formatTime(root.solarData.dusk, root.timeFormatMode, root.formatLocale) }
                ]

                RowLayout {
                  required property var modelData
                  Layout.fillWidth: true
                  spacing: Style.space(4)

                  Text {
                    textFormat: Text.PlainText
                    text: modelData.icon
                    color: trackerPopup.popupSolarColor
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

          // ================= LUNAR CARD =================
          Rectangle {
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            Layout.fillHeight: true
            implicitHeight: lunarCardCol.implicitHeight + Style.space(16)
            radius: Math.max(4, Style.cornerRadius - 2)
            color: trackerPopup.cardSurfaceColor
            border.width: 1
            border.color: trackerPopup.cardBorderColor

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
                  darkColor: root.isLightPopup ? Qt.rgba(0.14, 0.19, 0.28, 0.24) : Qt.rgba(0.05, 0.08, 0.14, 0.85)
                  rimColor: Qt.alpha(trackerPopup.popupLunarColor, 0.55)
                  showCraters: true
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
                  radius: 2.5
                  color: Qt.alpha(Color.foreground, 0.12)

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
          radius: Math.max(4, Style.cornerRadius - 2)
          color: trackerPopup.cardSurfaceColor
          border.width: 1
          border.color: trackerPopup.cardBorderColor

          ColumnLayout {
            id: forecastCol
            anchors.fill: parent
            anchors.margins: Style.space(8)
            spacing: Style.space(6)

            RowLayout {
              Layout.fillWidth: true
              Text {
                textFormat: Text.PlainText
                text: strings.t("section.upcomingMoon")
                color: Color.foreground
                opacity: 0.72
                font.family: Style.font.family
                font.pixelSize: Style.font.small || 11
                font.bold: true
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
                  radius: Math.max(3, Style.cornerRadius - 3)
                  color: index === 0
                    ? Qt.alpha(trackerPopup.popupLunarColor, root.isLightPopup ? 0.14 : 0.18)
                    : Qt.alpha(Color.foreground, root.isLightPopup ? 0.03 : 0.04)
                  border.width: index === 0 ? 1 : 0
                  border.color: Qt.alpha(trackerPopup.popupLunarColor, 0.42)

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
                      darkColor: root.isLightPopup ? Qt.rgba(0.14, 0.19, 0.28, 0.22) : Qt.rgba(0.05, 0.08, 0.14, 0.82)
                      rimColor: Qt.alpha(trackerPopup.popupLunarColor, 0.5)
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
      }

      // ======================================================================
      // SETTINGS VIEW (Right-click or Gear button)
      // ======================================================================
      ColumnLayout {
        id: settingsView
        visible: root.settingsOpen
        Layout.fillWidth: true
        spacing: Style.space(8)

        // Bar Display Mode selector
        Text {
          textFormat: Text.PlainText
          text: strings.t("settings.barDisplay")
          color: Color.foreground
          opacity: 0.78
          font.family: Style.font.family
          font.pixelSize: Style.font.small || 11
          font.bold: true
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

            Button {
              required property var modelData
              Layout.fillWidth: true
              Layout.preferredHeight: Style.space(28)
              bordered: true
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

          Text {
            Layout.preferredWidth: Style.space(98)
            textFormat: Text.PlainText
            text: strings.t("settings.colorMode")
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          Repeater {
            model: [
              { key: "celestial", label: "Soft" },
              { key: "bold",      label: "Bold" },
              { key: "theme",     label: "Theme" }
            ]

            Button {
              required property var modelData
              Layout.fillWidth: true
              Layout.preferredHeight: Style.space(28)
              bordered: true
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

          Text {
            Layout.preferredWidth: Style.space(98)
            textFormat: Text.PlainText
            text: strings.t("settings.moonStyle")
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          Repeater {
            model: [
              { key: "vector", label: "Vector Disc" },
              { key: "glyph",  label: "Nerd Glyph" }
            ]

            Button {
              required property var modelData
              Layout.fillWidth: true
              Layout.preferredHeight: Style.space(28)
              bordered: true
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

          Text {
            Layout.preferredWidth: Style.space(98)
            textFormat: Text.PlainText
            text: strings.t("settings.timeFormat")
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          Repeater {
            model: [
              { key: "auto", label: "Auto" },
              { key: "12",   label: "12-Hour" },
              { key: "24",   label: "24-Hour" }
            ]

            Button {
              required property var modelData
              Layout.fillWidth: true
              Layout.preferredHeight: Style.space(28)
              bordered: true
              selected: root.timeFormatMode === modelData.key
              text: modelData.label
              onClicked: root.selectTimeFormat(modelData.key)
            }
          }
        }

        // Location Source & Override section
        Rectangle {
          Layout.fillWidth: true
          Layout.preferredHeight: 1
          color: Color.foreground
          opacity: 0.12
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(6)

          Text {
            textFormat: Text.PlainText
            text: strings.t("settings.locationSource") + ": "
              + (root.effectiveLocation.source === "manual" ? "Manual Override"
                : (root.effectiveLocation.source === "weather" ? "Omarchy Weather Sync"
                : (root.effectiveLocation.source === "geo" ? "Auto IP Geolocation" : "Timezone Estimate")))
            color: Color.foreground
            opacity: 0.78
            font.family: Style.font.family
            font.pixelSize: Style.font.small || 11
            font.bold: true
            Layout.fillWidth: true
          }

          Button {
            visible: root.effectiveLocation.source === "manual"
            Layout.preferredHeight: Style.space(24)
            bordered: true
            text: "Use Auto"
            onClicked: root.clearCustomCoords()
          }

          Button {
            Layout.preferredHeight: Style.space(24)
            bordered: true
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
              Layout.fillWidth: true
              placeholderText: "Label (e.g. Lisbon)"
            }

            TextField {
              id: latField
              Layout.preferredWidth: Style.space(92)
              placeholderText: "Lat (38.72)"
            }

            TextField {
              id: lonField
              Layout.preferredWidth: Style.space(92)
              placeholderText: "Lon (-9.14)"
            }

            Button {
              Layout.preferredHeight: Style.space(30)
              bordered: true
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
}
