#!/bin/bash
# Live test: drives the running Heliolune through every theme and color mode,
# opens each view (Sun, Moon, Weather, Settings), and checks that the popup
# really draws (a capture with it open must differ clearly from one with it
# closed), that Heliolune answers its IPC, that the bar alert and the sky-light
# preview run, and that the shell logs no Heliolune errors. Settings are
# changed with omarchy-bar (the safe, serialized path) and restored.
#
# Captures stay in a temporary folder and may show your location; they are
# for checking only. Usage: tests/live.sh [output-dir]
set -u
H=makehasteslowly.heliolune
OUT=${1:-$(mktemp -d)}
mkdir -p "$OUT"
REGION="0,28 620x560"   # where the popup opens, under the bar's left side

OS=$(omarchy-bar get $H moonStyle); OC=$(omarchy-bar get $H colorMode)
P0=$(hyprctl cursorpos)
restore() {
  omarchy-shell $H close >/dev/null 2>&1
  omarchy-bar set $H moonStyle "${OS:-deco}" >/dev/null; omarchy-bar set $H colorMode "${OC:-celestial}" >/dev/null
  hyprctl dispatch "hl.dsp.cursor.move({x=${P0%,*},y=${P0#*, }})" >/dev/null
}
trap restore EXIT
hyprctl dispatch 'hl.dsp.cursor.move({x=1400,y=450})' >/dev/null
LOG=$(ls -t /run/user/$(id -u)/quickshell/by-pid/*/log.log | head -1)
LOGSTART=$(wc -l < "$LOG")

changed() {   # percent of pixels that differ by more than 20 levels (of 255) in any channel
  python3 - "$1" "$2" <<'PY'
import subprocess,re,sys
def load(f):
    out=subprocess.check_output(['magick',f,'-depth','8','txt:-']).decode().splitlines()[1:]
    return [tuple(map(int,m.groups())) for l in out if (m:=re.match(r'\d+,\d+: \((\d+),(\d+),(\d+)',l))]
a,b=load(sys.argv[1]),load(sys.argv[2])
n=sum(1 for p,q in zip(a,b) if max(abs(x-y) for x,y in zip(p,q))>20)
print(round(100*n/max(1,len(a)),1))
PY
}

pass=0; fail=0
note() { if [[ $2 == ok ]]; then pass=$((pass+1)); else fail=$((fail+1)); fi; printf "  %-34s %s\n" "$1" "$2"; }

ready=0; for i in $(seq 1 20); do omarchy-shell $H refresh >/dev/null 2>&1 && { ready=1; break; }; sleep 1; done
[[ $ready -eq 1 ]] && note "answers IPC" ok || note "answers IPC (waited 20 s)" FAIL

for style in nouveau deco atomic; do
  for mode in celestial bold theme; do
    echo "$style / $mode"
    omarchy-bar set $H moonStyle $style >/dev/null; omarchy-bar set $H colorMode $mode >/dev/null
    omarchy-shell $H close >/dev/null 2>&1; sleep 1.4
    grim -g "$REGION" "$OUT/$style-$mode-closed.png"
    for view in sun moon weather settings; do
      omarchy-shell $H close >/dev/null 2>&1; sleep 0.5
      if [[ $view == sun ]]; then omarchy-shell $H open >/dev/null 2>&1; else omarchy-shell $H $view >/dev/null 2>&1; fi
      sleep 1.6
      f="$OUT/$style-$mode-$view.png"; grim -g "$REGION" "$f"
      pct=$(changed "$OUT/$style-$mode-closed.png" "$f")
      if python3 -c "import sys;sys.exit(0 if $pct>=15 else 1)"; then note "$view draws (${pct}% of area)" ok
      else note "$view draws (${pct}% of area)" "FAIL"; fi
    done
    omarchy-shell $H close >/dev/null 2>&1; sleep 0.4
    # Each command opened its own view: the views share a header, but their
    # bodies must differ
    for pair in "sun moon" "sun weather" "moon weather" "sun settings"; do
      set -- $pair
      pct=$(changed "$OUT/$style-$mode-$1.png" "$OUT/$style-$mode-$2.png")
      if python3 -c "import sys;sys.exit(0 if $pct>=6 else 1)"; then note "$1 ≠ $2 (${pct}%)" ok; else note "$1 ≠ $2 (${pct}%)" FAIL; fi
    done
  done
done

# Bar effects run without errors (checked through the log below)
omarchy-shell $H testAlert >/dev/null 2>&1 && note "test alert runs" ok || note "test alert runs" FAIL
sleep 3
omarchy-shell $H testSky >/dev/null 2>&1 && note "sky-light preview runs" ok || note "sky-light preview runs" FAIL
sleep 4

ERR=$(tail -n +$LOGSTART "$LOG" | grep -aiE 'TypeError|ReferenceError|failed|error' | grep -ai "$H" | grep -v "outside of the config")
if [[ -z $ERR ]]; then note "shell log clean" ok; else note "shell log clean" FAIL; echo "$ERR" | tail -5 | sed 's/^/      /'; fi

echo "Live: $pass passed, $fail failed  (captures in $OUT)"
[[ $fail -eq 0 ]]
