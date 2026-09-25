pragma Singleton

import QtQuick

// The adv360 palette: graphite neutrals, one tint per kind of key. Omarchy's theme never applies.
QtObject {
  readonly property color ground: "#111317"
  readonly property color surface: "#181b20"
  readonly property color panel: "#20242b"
  readonly property color panelEdge: "#353a44"
  readonly property color tray: "#15171b"
  readonly property color caseFill: "#22262d"
  readonly property color caseEdge: "#2e333b"
  readonly property color cap: "#2d323a"
  readonly property color capEdge: "#141619"
  readonly property color capBorder: "#3a404a"
  readonly property color line: "#2a2f37"

  readonly property color text: "#dde2e8"
  readonly property color dim: "#8b939d"
  readonly property color muted: "#515862"

  readonly property color remap: "#5ea8ff"
  readonly property color taphold: "#a98bff"
  readonly property color macro: "#f3b447"
  readonly property color pending: "#5fd3a3"
  readonly property color pendingInk: "#0d1f18"
  readonly property color bad: "#ff6b7a"
  readonly property color focus: "#f4f6f8"
  readonly property color ledOff: "#0c0d10"

  readonly property string font: "monospace"
  readonly property int small: 11
  readonly property int body: 13
  readonly property int title: 15

  function mix(a, b, amount) {
    return Qt.rgba(a.r * amount + b.r * (1 - amount), a.g * amount + b.g * (1 - amount), a.b * amount + b.b * (1 - amount), 1)
  }

  function tint(c, amount) {
    return mix(c, cap, amount)
  }

  function alpha(c, a) {
    return Qt.rgba(c.r, c.g, c.b, a)
  }
}
