# Solar & Lunar Phase Tracker (`solar-lunar-tracker`)

A real-time **Solar & Lunar Phase Tracker** bar widget and popup panel for [Omarchy](https://omarchy.org/).

## Features

- **Combined Solar & Lunar Bar Indicator**:
  - Displays both your current **Solar Phase** and **Lunar Phase** side-by-side at a glance.
  - Choose between 6 bar display modes via right-click or `shell.json`:
    - `both` — Solar phase icon + Lunar phase disc/icon + illumination `%`
    - `compact` — Compact Solar & Lunar icons only
    - `detailed` — Solar icon + next sunrise/sunset time + Lunar icon + illumination `%`
    - `dynamic` — Sun by day, Moon by night
    - `lunar` — Lunar phase + illumination `%` only
    - `solar` — Solar phase + next sun event time only
- **Vector Spherical Moon Disc or Nerd Font Glyphs**:
  - Custom `Canvas` moon renderer draws the exact spherical terminator curve for any illumination angle (`0%` to `100%`, waxing or waning) with subtle lunar maria craters in the hero view.
  - Or switch to Nerd Font moon phase glyphs (`󰽤 󰽧 󰽡 󰽨 󰽢 󰽦 󰽣 󰽥`) anytime.
- **24-Hour Sky & Horizon Path**:
  - Plots the Sun's and Moon's 24-hour altitude curves relative to your local horizon (`0°`), with live position markers and daylight shading.
- **Solar Cycle Telemetry**:
  - Civil Dawn, Sunrise, Golden Hour, Solar Noon, Sunset, Civil Dusk, Day Length, and daily daylight change compared to yesterday (`±m/s`).
  - Real-time solar altitude (`°`) and compass azimuth.
- **Lunar Phase Telemetry & 7-Day Forecast**:
  - Phase name, illumination percentage, waxing/waning state, lunar age (`d h / 29.5d`), earth-moon distance (`km`), ecliptic zodiac sign, and countdowns to the **Next Full Moon** and **Next New Moon**.
  - 7-day upcoming lunar forecast strip with daily vector moon discs.
- **Zero-Config Offline Astronomy + Smart Location Sync**:
  - All solar and lunar math runs 100% locally using NOAA and Jean Meeus astronomical equations.
  - Automatically syncs coordinates from Omarchy Weather (`~/.local/state/omarchy/settings/weather.json`), falls back to `geo.omarchy.org` IP geolocation if unset, or accepts manual `latitude`/`longitude` overrides directly in the widget settings.

## Mouse & IPC Controls

- **Left-click**: Open/close the Solar & Lunar Tracker popup card
- **Right-click**: Open the quick Settings panel (Bar Display Mode, Colors, Moon Renderer, Time Format, Location Override)
- **Middle-click**: Refresh location & astronomical telemetry immediately
- **IPC**:
  ```bash
  omarchy-shell shell toggle solar-lunar-tracker
  ```
