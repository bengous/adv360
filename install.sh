#!/usr/bin/env bash
# Builds the adv360 binary and installs it for the current user.
# Side effects: writes $SHAREDIR (gui + data), $BINDIR/adv360, $APPDIR/adv360.desktop,
# $ICONDIR/adv360.png, and adds one row to ~/.config/omarchy/extensions/omarchy-menu.jsonc
# when the "kinesis" id is absent.
# It never touches Hyprland config: the bind line is printed for you to paste.
set -euo pipefail

BINDIR="${BINDIR:-$HOME/.local/bin}"
SHAREDIR="${SHAREDIR:-$HOME/.local/share/kinesis-smartset-arch}"
APPDIR="${APPDIR:-$HOME/.local/share/applications}"
ICONDIR="${ICONDIR:-$HOME/.local/share/icons/hicolor/256x256/apps}"
MENU_EXT="${MENU_EXT:-$HOME/.config/omarchy/extensions/omarchy-menu.jsonc}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

command -v bun >/dev/null || { echo "install.sh: bun is required (mise use -g bun)" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
bun build --compile --outfile "$tmp/adv360" src/main.ts >/dev/null

# Data first, binary last: a half-finished install never leaves a newer binary
# looking for gui files that are not there yet.
install -d "$SHAREDIR" "$BINDIR"
rm -rf -- "$SHAREDIR/gui" "$SHAREDIR/data"
cp -r gui data "$SHAREDIR/"
install -Dm644 omarchy/adv360.png "$ICONDIR/adv360.png"
install -Dm644 omarchy/adv360.desktop "$APPDIR/adv360.desktop"
update-desktop-database "$APPDIR" &>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" &>/dev/null || true

binary_tmp="$(mktemp "$BINDIR/.adv360.tmp.XXXXXX")"
install -m 755 "$tmp/adv360" "$binary_tmp"
mv -f -- "$binary_tmp" "$BINDIR/adv360"

if [[ -f $MENU_EXT ]] && ! grep -q '"kinesis"' "$MENU_EXT"; then
  # First member of the object; the menu parser drops the trailing comma when nothing follows.
  entry="$(cat omarchy/menu-entry.jsonc)"
  awk -v entry="$entry" 'BEGIN { done = 0 } { print } /^[[:space:]]*\{[[:space:]]*$/ && !done { print entry; done = 1 }' "$MENU_EXT" >"$tmp/menu.jsonc"
  cp -- "$tmp/menu.jsonc" "$MENU_EXT"
  echo "added the Kinesis 360 row to $MENU_EXT"
fi

cat <<EOF
installed $BINDIR/adv360 and $SHAREDIR
version: $("$BINDIR/adv360" vdrive status | jq -r .version)
EOF
if [[ $SHAREDIR != "$HOME/.local/share/kinesis-smartset-arch" ]]; then
  echo "note: the binary looks for gui files under ~/.local/share/kinesis-smartset-arch; export ADV360_SHARE_DIR=$SHAREDIR"
fi
cat <<EOF

Optional, paste into ~/.config/hypr/bindings.lua:
  o.bind("SUPER + SHIFT + K", "Kinesis editor", "adv360 gui")

Optional, mount notification with no GUI open (Omarchy service plugin):
  omarchy plugin add $here --enable
EOF
