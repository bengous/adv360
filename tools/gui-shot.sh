#!/usr/bin/env bash
# Plays a GUI script on a headless Hyprland output far from every real monitor, so a
# visual check never draws on the user's workspaces. The GUI runs as a layer surface
# bound to that output, on a copy of tests/fixtures/real/.
#
#   tools/gui-shot.sh <out-dir> <script-file>
#   tools/gui-shot.sh --teardown        removes the output (end of an implementation session)
#
# Script, one step per line, `#` at the start of a line for a comment:
#   cli <verb> [args...]     adv360 on the copy, stdout in <out-dir>/cli-<n>.json; the cli steps
#                            before the first ipc or shot step run before the GUI starts
#   ipc <function> [args...] quickshell ipc --pid <pid> call adv360 <function> [args...]
#   shot <name>              <out-dir>/<name>.png and <out-dir>/state-<name>.json
#   status <file|->          `vdrive status` answers this JSON file (path relative to the
#                            script); "-" gives the real verb back
#   expect <file> <jq>       jq -e <jq> on <out-dir>/<file>; a .log file is read as one string
# Every verb the GUI runs lands in <out-dir>/calls.log.
#
# Exit: 0 ok, 1 virtual screen unavailable, 2 the bench spilled onto the session,
#       3 IPC without answer, 4 capture blocked, 5 an expect failed, 64 usage.
# Never: close a window, add a window rule, change another monitor, write outside
# <out-dir> and its own temporary directory.
set -euo pipefail

OUTPUT=adv360-shot
MODE=1280x760@60
X=20000
WIDTH=1280
HEIGHT=760

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid=""
tmp=""

die() {
  local code=$1
  shift
  echo "gui-shot: $*" >&2
  exit "$code"
}

monitor() {
  hyprctl monitors -j | jq -c --arg n "$OUTPUT" '.[] | select(.name == $n)'
}

placed() {
  jq -e --argjson x "$X" --argjson w "$WIDTH" --argjson h "$HEIGHT" \
    '.x == $x and .y == 0 and .width == $w and .height == $h and .scale == 1' <<<"$1" >/dev/null 2>&1
}

# Runtime rules, set before the output exists so it never appears next to a real monitor.
# The named workspace keeps the output off the numbered ones (SUPER + 3 stays on the user's side).
place_rules() {
  hyprctl eval "hl.monitor({ output = \"$OUTPUT\", mode = \"$MODE\", position = \"${X}x0\", scale = 1 })" >/dev/null
  hyprctl eval "hl.workspace_rule({ workspace = \"name:$OUTPUT\", monitor = \"$OUTPUT\", default = true })" >/dev/null
}

wait_placed() {
  local mon=""
  for _ in $(seq 50); do
    mon="$(monitor)"
    placed "$mon" && return 0
    sleep 0.1
  done
  die 1 "output $OUTPUT is not at ${X}x0 in ${WIDTH}x${HEIGHT}: ${mon:-absent}"
}

ensure_output() {
  local mon
  mon="$(monitor)"
  if [ -z "$mon" ]; then
    place_rules
    hyprctl output create headless "$OUTPUT" >/dev/null || die 1 "hyprctl output create headless failed"
  elif ! placed "$mon"; then
    # A Hyprland reload drops runtime rules and re-places the output beside the real monitors.
    place_rules
  fi
  wait_placed
}

others() {
  hyprctl monitors -j |
    jq -c --arg n "$OUTPUT" '[.[] | select(.name != $n) | {name, width, height, refreshRate, x, y, scale}] | sort_by(.name)'
}

guard() {
  local now windows stray
  now="$(others)"
  [ "$now" = "$others_before" ] || die 2 "a real monitor changed: before $others_before, now $now"
  placed "$(monitor)" || die 2 "output $OUTPUT moved: $(monitor)"
  [ -n "$pid" ] || return 0
  windows="$(hyprctl clients -j | jq -c --argjson p "$pid" '[.[] | select(.pid == $p) | {title, workspace: .workspace.name}]')"
  [ "$windows" = "[]" ] || die 2 "quickshell $pid mapped a window: $windows"
  stray="$(hyprctl layers -j | jq -c --argjson p "$pid" --arg n "$OUTPUT" \
    '[to_entries[] | select(.key != $n) | {monitor: .key, layer: (.value.levels[][] | select(.pid == $p) | .namespace)}]')"
  [ "$stray" = "[]" ] || die 2 "quickshell $pid has layers off $OUTPUT: $stray"
}

cleanup() {
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    for _ in $(seq 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  [ -z "$tmp" ] || rm -rf -- "$tmp"
}

ipc() {
  quickshell ipc --pid "$pid" call adv360 "$@"
}

state_json() {
  ipc state 2>/dev/null
}

wait_ready() {
  for _ in $(seq 50); do
    kill -0 "$pid" 2>/dev/null || die 3 "quickshell exited: $(tail -n 5 "$out/quickshell.log")"
    state_json >/dev/null && return 0
    sleep 0.2
  done
  die 3 "no answer from quickshell $pid within 10 s"
}

wait_idle() {
  for _ in $(seq 50); do
    [ "$(state_json | jq -r .busy 2>/dev/null)" = false ] && return 0
    sleep 0.2
  done
  die 3 "the GUI stayed busy for 10 s"
}

launch() {
  ADV360_SCREEN="$OUTPUT" \
    ADV360_CMD="$(jq -cn --arg c "$repo/tools/gui-cli.sh" '[$c]')" \
    ADV360_SHOT_OUT="$out" \
    quickshell -p "$repo/gui" >"$out/quickshell.log" 2>&1 &
  pid=$!
  wait_ready
  wait_idle
  guard
}

status_polls() {
  grep -c '^vdrive status' "$out/calls.log" 2>/dev/null || true
}

step() {
  local verb=$1 rest=$2 args
  read -r -a args <<<"$rest"
  case "$verb" in
    cli)
      cli_n=$((cli_n + 1))
      local rc=0
      bun "$repo/src/main.ts" "${args[@]}" >"$out/cli-$cli_n.json" 2>>"$out/cli.err" || rc=$?
      printf '%s %s %s\n' "$cli_n" "$rc" "$rest" >>"$out/cli.log"
      ;;
    ipc)
      [ -n "$pid" ] || launch
      printf '> %s\n' "$rest" >>"$out/ipc.log"
      ipc "${args[@]}" >>"$out/ipc.log" 2>&1 || die 3 "ipc $rest failed: $(tail -n 3 "$out/ipc.log")"
      wait_idle
      ;;
    shot)
      [ -n "$pid" ] || launch
      sleep 0.3
      local rc=0
      timeout 5 grim -o "$OUTPUT" "$out/${args[0]}.png" || rc=$?
      [ "$rc" = 0 ] || die 4 "grim -o $OUTPUT exited $rc"
      state_json | jq . >"$out/state-${args[0]}.json"
      ;;
    status)
      local before
      before="$(status_polls)"
      if [ "${args[0]}" = - ]; then
        rm -f -- "$out/status.json"
      else
        jq -c . "$script_dir/${args[0]}" >"$out/status.json"
      fi
      if [ -n "$pid" ]; then
        for _ in $(seq 50); do
          [ "$(status_polls)" -ge $((before + 2)) ] && break
          sleep 0.1
        done
        wait_idle
      fi
      ;;
    expect)
      local file=${args[0]} filter=${rest#*"${args[0]}"}
      local mode=()
      case "$file" in *.log) mode=(-R -s) ;; esac
      jq "${mode[@]}" -e "$filter" "$out/$file" >/dev/null || die 5 "expect $file $filter"
      ;;
    *) die 64 "unknown step: $verb $rest" ;;
  esac
}

if [ "${1:-}" = --teardown ]; then
  [ -z "$(monitor)" ] || hyprctl output remove "$OUTPUT" >/dev/null
  exit 0
fi

[ $# = 2 ] || die 64 "usage: gui-shot.sh <out-dir> <script-file> | --teardown"
mkdir -p "$1"
out="$(cd "$1" && pwd)"
# The marker proves the directory holds only earlier results, which the run replaces.
if [ -n "$(ls -A "$out")" ] && [ ! -f "$out/.gui-shot" ]; then
  die 64 "$out is not empty and holds no earlier gui-shot.sh results"
fi
script="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
script_dir="$(dirname "$script")"
[ -f "$script" ] || die 64 "no script at $2"

exec 9>"${XDG_RUNTIME_DIR:?}/adv360-shot.lock"
flock -w 300 9 || die 1 "another gui-shot.sh run holds the lock"

trap cleanup EXIT
tmp="$(mktemp -d)"
mkdir -p "$tmp/source" "$tmp/state"
cp -r "$repo/tests/fixtures/real/." "$tmp/source/"
export ADV360_SOURCE="$tmp/source" XDG_STATE_HOME="$tmp/state"
find "$out" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
touch "$out/.gui-shot"

ensure_output
others_before="$(others)"
cli_n=0

while IFS= read -r line || [ -n "$line" ]; do
  line="${line#"${line%%[![:space:]]*}"}"
  case "$line" in '' | '#'*) continue ;; esac
  verb="${line%% *}"
  rest=""
  [ "$verb" = "$line" ] || rest="${line#* }"
  step "$verb" "$rest"
  guard
done <"$script"
