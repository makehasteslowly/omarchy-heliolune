# Heliolune

**Sun, Moon & Seasons for the Omarchy bar.**

*Helio*, sun + *lune*, moon. Heliolune puts the sky on your bar: where the Sun and Moon are now, when they rise and set, how the light will change tonight, and where the year is heading. Everything is computed offline, checked against the US Naval Observatory, and drawn in one of three period themes.

![Heliolune in its three themes: Atomic, Art Deco and Art Nouveau](docs/screenshots/hero.png)

```bash
omarchy plugin add https://github.com/makehasteslowly/omarchy-heliolune.git --enable
```

---

## Why Heliolune

There are good moon widgets and good sunrise widgets for Omarchy. Heliolune is one instrument for both, plus the seasons that connect them.

- **The Sun's yearly figure-8.** The *analemma*, computed for your latitude: today's Sun on the curve, the equinoxes and solstices, and the path to the next one. Drag along it to travel through the year.
- **Three themes that restyle everything.** Not just colours: the Moon itself, the cards, buttons, dividers and sky chart change shape. Each has a Soft and a Bold intensity, and adapts its colours to stay readable on light Omarchy themes.
- **Measured accuracy.** Sunrise, sunset, moonrise and moonset agree with the US Naval Observatory to within a minute, from the equator to the Arctic. The test suite ships in the repo.
- **Zero setup, no dependencies.** It finds your location from Omarchy Weather, your IP or your time zone. Pure QML and JavaScript: no Python, no API keys, no accounts.

---

## A tour

### On the bar

The Sun and Moon share one themed capsule (here in `detailed` mode: Atomic, Art Deco and Art Nouveau, Soft and Bold):

![The bar capsule in each theme](docs/screenshots/bar.png)

Pick what it shows from six modes:

| Mode | Shows |
|---|---|
| `both` (default) | Sun phase icon · Moon disc · illumination % |
| `compact` | Sun and Moon icons only |
| `detailed` | Sun icon · next sunrise or sunset · Moon disc · illumination % |
| `dynamic` | The Sun by day, the Moon by night |
| `solar` | Sun phase · next sun event |
| `lunar` | Moon disc · illumination % |

Hover for a summary that includes the next moonrise or moonset.

### In the popup

![The Heliolune popup in the default Atomic theme](docs/screenshots/popup.png)

- **Header:** the **current weather** up top: a large drawn icon for the conditions, the temperature, the sky, and feels-like, wind and humidity (optional, see [Privacy](#privacy--network)). Below it, your city and coordinates, the **date and ISO week number** (e.g. `Mon, Nov 2, 2026 · Week 45`), and the daylight gained or lost since yesterday.
- **24-hour sky path:** the Sun's and Moon's altitude through the day against your horizon, and where they are right now.
- **The Sun:** sky phase (from astronomical night through blue hour, golden hour and solar noon), altitude and compass bearing, day length, and the day's timetable: blue hour, sunrise, golden hour, solar noon, sunset, blue hour.
- **The Moon:** phase, illumination, waxing or waning, age, **moonrise and moonset**, altitude, distance, ecliptic sign, and countdowns to the next quarter, full and new Moon.
- **7-day Moon forecast.**
- **The Sun's yearly path:** the analemma, then the countdown to the next equinox or solstice with the current season's progress (*Autumn · day 41 of 90*). Hemisphere-aware: in Sydney, June brings the Winter Solstice.

### Time travel

Look at any date up to ten years either way, and every card follows.

- **Drag or click the figure-8** to jump to that day of the year. Where the two loops cross, the drag stays on the loop you are on.
- **Scroll over it** to step a day at a time (Shift: a week), or use **← / →**, and **T** for today.
- A *Viewing …* chip shows the date you are on. Closing the popup always returns to live.

![Stepping through half a year: the sky path, timetable, Moon, forecast and countdowns follow, and today's Sun travels round the figure-8](docs/screenshots/time-travel.gif)

---

## Themes

Right-click the widget and pick a **Moon Render**: the choice restyles the whole widget.


| | Atomic (default) | Art Deco | Art Nouveau |
|---|---|---|---|
| **The Moon** | Flat poster disc circled by orbiting electrons | Streamline bands with a stepped terminator, double rim and diamond studs | Softly shaded disc in a beaded halo, with a vine and leaves |
| **Palette** | *Atomic Age:* teal, atomic orange, mustard, cream on walnut | *Emerald & Ruby:* emerald, ruby red, gold on onyx | *Mucha Botanical:* sage, amber, dusty rose, bronze, cream |
| **Ornament** | Starbursts, boomerangs, atom dots, rounded tabs | Sunburst crest, gilded double frames, ziggurat steps, spaced capitals | Halo-and-blossom crest, vine dividers, curling corner tendrils, pill buttons |
| **Weather icons** | Flat poster shapes: starburst sun, bold-outlined clouds, teardrop rain, sparkle snow | Stepped gilded geometry: sunburst-fan sun, ziggurat clouds, straight rain, diamond snow | Organic forms: flame-ray sun, scroll-curl clouds, teardrops, blossom snowflakes |

**Celestial Colors** sets the intensity:

- **Soft:** muted, printed tones and a light hand with the ornament.
- **Bold:** full-saturation colour, heavy rules and deep jewel-toned cards.
- **Theme:** keeps the theme's shapes but takes its colours from your Omarchy theme.

| Atomic: Soft / Bold | Art Deco: Soft / Bold | Art Nouveau: Soft / Bold |
|---|---|---|
| ![Atomic, Soft and Bold](docs/screenshots/theme-atomic.png) | ![Art Deco, Soft and Bold](docs/screenshots/theme-deco.png) | ![Art Nouveau, Soft and Bold](docs/screenshots/theme-nouveau.png) |

On light themes, every colour is checked against the actual bar and popup background and darkened until it meets WCAG contrast (4.5:1 for text), so nothing washes out.

---

## Install

Requires **Omarchy 4** or newer (the Quickshell shell). Tested on Omarchy 4.5.

```bash
omarchy plugin add https://github.com/makehasteslowly/omarchy-heliolune.git --enable
```

Move it to another part of the bar:

```bash
omarchy bar move makehasteslowly.heliolune --section right
```

Update or remove:

```bash
omarchy plugin update makehasteslowly.heliolune
omarchy plugin remove makehasteslowly.heliolune
```

> Omarchy plugins run unsandboxed inside the shell. Read the code before enabling any plugin, this one included. The widget itself is two files, `BarWidget.qml` and `Model.js`.

---

## Controls

| | |
|---|---|
| **Left-click** | Open or close the popup |
| **Right-click** | Open settings |
| **Middle-click** | Refresh location, weather and astronomy |
| **← / →** | Previous / next day (Shift: a week) |
| **T** | Back to today |
| **S** / **R** | Settings / refresh |
| **↑ ↓ PgUp PgDn Home** | Scroll |
| **Esc** | Close |
| **1 / 2 / 3** (in settings) | Atomic / Art Deco / Art Nouveau |

From a script or keybinding:

```bash
omarchy-shell makehasteslowly.heliolune toggle   # also: open, close, refresh
omarchy-shell makehasteslowly.heliolune stepDays 7   # time travel: +/- n days
omarchy-shell makehasteslowly.heliolune today
```

---

## Settings

Everything is in the right-click panel. The same keys can be set on the widget's entry in `~/.config/omarchy/shell.json`:

| Key | Values | Default |
|---|---|---|
| `displayMode` | `both` · `compact` · `detailed` · `dynamic` · `solar` · `lunar` | `both` |
| `moonStyle` | `atomic` · `deco` · `nouveau` | `atomic` |
| `colorMode` | `celestial` (Soft) · `bold` · `theme` | `celestial` |
| `timeFormat` | `auto` · `12` · `24` | `auto` |
| `weather` | `auto` (°F for US locales, °C elsewhere) · `c` · `f` · `off` | `auto` |
| `latitude`, `longitude`, `locationName` | Manual location override | empty (automatic) |

```json
{ "id": "makehasteslowly.heliolune", "moonStyle": "deco", "colorMode": "bold", "displayMode": "detailed" }
```

---

## Accuracy

All astronomy runs locally in `Model.js`:

- **Sun:** Meeus ch. 25, with nutation and aberration.
- **Moon:** the main periodic terms of Meeus ch. 47.
- **Time:** IAU sidereal time and ΔT.
- **Events:** rise, set and transit times are solved iteratively at the event itself.

An offline test suite compares Heliolune with the **US Naval Observatory**. It covers six cities from the equator to the Arctic (Greenwich, New York, Sydney, Singapore, Reykjavik and Tromsø), including polar day, polar night and days when the Moon rises twice.

| Quantity | Comparisons | Max error vs USNO |
|---|---|---|
| Sunrise / sunset | 186 | 0.1 min |
| Civil twilight | 178 | 0.1 min |
| Solar noon | 94 | < 0.1 min |
| Moonrise / moonset | 181 | 0.3 min |
| Equation of time (the analemma) | 94 | < 0.1 min |
| Moon phases, 2025–2027 | 148 | 1.4 min (mean 0.2) |
| Equinoxes & solstices, 2024–2030 | 28 | 0.6 min |

USNO publishes times to the minute; errors are measured after allowing for that rounding.

```bash
node tests/accuracy.mjs            # summary; exits non-zero on any regression
node tests/accuracy.mjs --verbose  # every comparison
node tests/calendar.mjs            # ISO week numbers, incl. New Year edge cases
python3 -I tests/fetch-usno.py     # refresh the reference data (public test cities only)
```

---

## Privacy & network

Heliolune makes at most two kinds of request, both over HTTPS, both size-capped and validated before use:

| What | Where | When | Turn it off |
|---|---|---|---|
| **Your approximate location**, only if Omarchy Weather has no location and you set none | `geo.omarchy.org`, Omarchy's own geolocation service | At startup, then every 3 hours; cached for offline use | Set a location in Omarchy Weather or in Heliolune's settings |
| **Current weather** for your coordinates rounded to ~1 km | `api.open-meteo.com`, no account or key | At startup, every 30 minutes, and when your location changes | Set **Weather** to **Off** |

With a location set and weather off, Heliolune makes no network requests at all. All astronomy is computed on your machine, and nothing else is sent anywhere.

Omarchy does not share its weather with other plugins, which is why Heliolune fetches its own from the same provider.

---

## See also

Other sky widgets for Omarchy, each good at its own thing:

- [**Moonshot**](https://github.com/rodrix2000/omarchy-moonshot): a deep Moon companion with a lunar calendar, eclipse tracking and saved places.
- [**omarchy-sun**](https://github.com/steveclarke/omarchy-sun): a minimal sunrise/sunset widget.
- [**Moon Arc**](https://github.com/rookepoole/omarchy-moon-arc) and [**Moon Phase**](https://github.com/jeffmtb/omarchy-moon-phase): light, location-free moon phase indicators.
- [**Âm lịch**](https://github.com/hoojiNT/omarchy-lunar-calendar): the Vietnamese lunar calendar.

## Credits

- Astronomy after Jean Meeus, *Astronomical Algorithms* (2nd ed.).
- Reference data from the [US Naval Observatory Astronomical Applications API](https://aa.usno.navy.mil/data/api).
- Weather by [Open-Meteo](https://open-meteo.com/).
- Built for [Omarchy](https://omarchy.org/).

## License

[MIT](LICENSE) © 2026 makehasteslowly
