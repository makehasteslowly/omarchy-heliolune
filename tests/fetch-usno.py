#!/usr/bin/env python3
"""Download reference data from the US Naval Observatory Astronomical Applications API
(https://aa.usno.navy.mil/data/api) into tests/fixtures/ for the offline accuracy suite.

Only fixed public test cities are queried, never the user's location. Re-run to refresh:
    python3 -I tests/fetch-usno.py
"""
import json, os, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixtures")
API = "https://aa.usno.navy.mil/api"

CITIES = [
    # name, lat, lon, standard UTC offset (hours, DST ignored on purpose)
    ("Greenwich", 51.48, 0.0, 0),
    ("New York", 40.71, -74.01, -5),
    ("Sydney", -33.87, 151.21, 10),
    ("Singapore", 1.35, 103.82, 8),
    ("Reykjavik", 64.15, -21.94, 0),
    ("Tromso", 69.65, 18.96, 1),
]
YEAR = 2026
DAYS = [(m, 15) for m in range(1, 13)] + [(3, 20), (6, 21), (9, 23), (12, 21)]


def get(path, **params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "heliolune-accuracy-tests"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.length is not None and r.length > 2_000_000:
                    raise ValueError("response too large")
                return json.loads(r.read(2_000_000))
        except Exception as e:  # network hiccup: back off and retry
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def main():
    os.makedirs(OUT, exist_ok=True)
    rstt = []
    for name, lat, lon, tz in CITIES:
        for month, day in DAYS:
            date = f"{YEAR}-{month:02d}-{day:02d}"
            data = get("rstt/oneday", date=date, coords=f"{lat},{lon}", tz=tz, dst="false")
            p = data["properties"]["data"]
            rstt.append({"city": name, "lat": lat, "lon": lon, "tz": tz, "date": date,
                         "sundata": p.get("sundata", []), "moondata": p.get("moondata", []),
                         "fracillum": p.get("fracillum"), "curphase": p.get("curphase")})
            time.sleep(0.4)
        print(f"  {name}: {len(DAYS)} days", file=sys.stderr)
    json.dump(rstt, open(os.path.join(OUT, "usno-rstt.json"), "w"), indent=1)

    phases = []
    for y in (YEAR - 1, YEAR, YEAR + 1):
        phases += get("moon/phases/year", year=y)["phasedata"]
        time.sleep(0.4)
    json.dump(phases, open(os.path.join(OUT, "usno-moon-phases.json"), "w"), indent=1)

    seasons = []
    for y in range(YEAR - 2, YEAR + 5):
        seasons += [e for e in get("seasons", year=y, tz=0)["data"] if e["phenom"] in ("Equinox", "Solstice")]
        time.sleep(0.4)
    json.dump(seasons, open(os.path.join(OUT, "usno-seasons.json"), "w"), indent=1)

    meta = {"source": API, "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "year": YEAR,
            "cities": CITIES, "days": DAYS}
    json.dump(meta, open(os.path.join(OUT, "README.json"), "w"), indent=1)
    print(f"rstt={len(rstt)} phases={len(phases)} seasons={len(seasons)}", file=sys.stderr)


if __name__ == "__main__":
    main()
