pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Shapes
import "../theme"
import "../layout.mjs" as Layout
import "../legend.mjs" as Legend
import "../assign.mjs" as Assign

// The drawn Advantage360: two cases, tilted thumb clusters, the LEDs above them. Sizes
// follow the mockup, where one key unit is 50 px; `s` scales them to the item.
Item {
  id: root

  property var keyboard: null
  property var tokens: null
  property var viewData: null
  property string layerName: "base"
  property string selected: ""
  // Drawer open: a click on another key copies its action, so every key shows as a target.
  property bool targeting: false
  property var ghost: null
  // Keys the human must press now (SmartSet + Hotkey 4 after a write): they pulse, the rest dims.
  property var glow: []
  // Lights mode: the keys fade, the LEDs grow and take the clicks.
  property bool lights: false
  property string selectedLed: ""
  readonly property var glowLabels: ({ smartset: "hold", hk4: "then press" })

  signal keyClicked(string position)
  signal ledClicked(string indicator)
  signal dropped(string position, var payload)

  readonly property var placed: keyboard ? Layout.place(keyboard.schematic) : null
  readonly property var labelMap: tokens ? Assign.labels(tokens) : ({})
  readonly property real margin: 0.6
  readonly property real unit: placed ? Math.min(width / (placed.width + 2 * margin), height / (placed.height + 2 * margin)) : 1
  readonly property real s: unit / 50
  readonly property real ox: placed ? (width - placed.width * unit) / 2 : 0
  readonly property real oy: placed ? (height - placed.height * unit) / 2 : 0
  readonly property var byPosition: {
    var map = {}
    if (viewData && viewData.keys) for (var i = 0; i < viewData.keys.length; i++) map[viewData.keys[i].position] = viewData.keys[i]
    return map
  }
  readonly property string layerLed: ({ base: "layd", keypad: "layk", function1: "lay1", function2: "lay2", function3: "lay3" })[layerName] || "layd"
  readonly property var pedalInfo: byPosition["pedl"] || null
  readonly property bool pedalShown: pedalInfo !== null && (pedalInfo.kind !== "default" || pedalInfo.macros.length > 0)

  function labelOf(token) {
    return labelMap[String(token).toLowerCase()] || String(token)
  }

  function known(token) {
    return tokens === null || Assign.isKnown(String(token), tokens)
  }

  function centerOf(position) {
    if (placed === null) return Qt.point(0, 0)
    for (var i = 0; i < placed.keys.length; i++) {
      var k = placed.keys[i]
      if (k.position === position) return Qt.point(ox + k.cx * unit, oy + k.cy * unit)
    }
    return Qt.point(width / 2, 0)
  }

  function ledCenter(indicator) {
    if (placed === null) return Qt.point(0, 0)
    for (var i = 0; i < placed.leds.length; i++) {
      var l = placed.leds[i]
      if (l.indicator === indicator) return Qt.point(ox + l.cx * unit, oy + l.cy * unit)
    }
    return Qt.point(width / 2, 0)
  }

  function ledState(indicator) {
    var led = viewData && viewData.leds ? viewData.leds[indicator] : null
    if (!led || led.function === "null") return { color: Theme.ledOff, lit: false, layer: false }
    var layer = led.function === "layer"
    var rgb = led.colors[layer ? layerLed : led.function]
    if (!rgb || (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0)) return { color: Theme.ledOff, lit: false, layer: layer }
    return { color: Qt.rgba(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1), lit: true, layer: layer }
  }

  component CasePath: ShapePath {
    id: casePath

    property var points: []
    property bool edge: false

    fillColor: Theme.caseFill
    strokeColor: edge ? Theme.caseEdge : Theme.caseFill
    strokeWidth: (edge ? 42 : 38) * root.s
    joinStyle: ShapePath.RoundJoin

    PathPolyline {
      path: casePath.points.length === 0 ? [] : casePath.points.concat([casePath.points[0]]).map(function(p) { return Qt.point(root.ox + p[0] * root.unit, root.oy + p[1] * root.unit) })
    }
  }

  Shape {
    visible: root.placed !== null
    anchors.fill: parent
    preferredRendererType: Shape.CurveRenderer

    CasePath { edge: true; points: root.placed ? root.placed.cases[0] : [] }
    CasePath { points: root.placed ? root.placed.cases[0] : [] }
    CasePath { edge: true; points: root.placed ? root.placed.cases[1] : [] }
    CasePath { points: root.placed ? root.placed.cases[1] : [] }
  }

  Repeater {
    model: root.placed ? root.placed.keys.concat(root.pedalShown ? [root.placed.pedal] : []) : []

    Item {
      id: cap

      required property var modelData
      readonly property var info: root.byPosition[modelData.position] || null
      readonly property string kind: info ? String(info.kind) : "default"
      readonly property bool hasMacro: info !== null && info.macros.length > 0
      readonly property bool bad: kind === "remap" ? !root.known(info.action) : kind === "taphold" ? !root.known(info.tap) || !root.known(info.hold) : false
      readonly property var legend: Legend.legend(info ? String(info.label) : "", modelData.position)
      readonly property color face: bad ? Theme.tint(Theme.bad, 0.3)
        : kind === "remap" ? Theme.tint(Theme.remap, 0.3)
        : kind === "taphold" ? Theme.tint(Theme.taphold, 0.3)
        : hasMacro ? Theme.tint(Theme.macro, 0.22)
        : Theme.cap
      readonly property bool glowing: root.glow.indexOf(modelData.position) >= 0
      readonly property color ink: glowing ? Theme.ground : bad ? Theme.bad : legend.muted ? Theme.dim : Theme.text

      x: root.ox + (modelData.cx - modelData.w / 2) * root.unit
      y: root.oy + (modelData.cy - modelData.h / 2) * root.unit
      width: modelData.w * root.unit
      height: modelData.h * root.unit
      rotation: modelData.angle
      opacity: root.lights ? 0.22 : root.glow.length > 0 && !glowing ? 0.3 : 1
      z: glowing ? 1 : 0

      Rectangle {
        x: 3 * root.s
        y: 3 * root.s
        width: parent.width - 6 * root.s
        height: parent.height - 6 * root.s
        radius: 8 * root.s
        color: Theme.capEdge
      }

      Rectangle {
        id: face
        x: 7 * root.s
        y: 5 * root.s
        width: parent.width - 14 * root.s
        height: parent.height - 15 * root.s
        radius: 6 * root.s
        color: cap.glowing ? Theme.remap : cap.face

        Shape {
          visible: cap.hasMacro
          anchors.fill: parent
          preferredRendererType: Shape.CurveRenderer

          ShapePath {
            fillColor: Theme.macro
            strokeWidth: -1
            PathSvg {
              readonly property real w: face.width
              readonly property real k: root.s
              path: "M " + (w - 13 * k) + " 0 H " + (w - 5 * k) + " Q " + w + " 0 " + w + " " + 5 * k + " V " + 13 * k + " Z"
            }
          }
        }

        Rectangle {
          visible: cap.info !== null && cap.info.pending === true
          x: 6 * root.s - width / 2
          y: 6 * root.s - height / 2
          width: 6.4 * root.s
          height: width
          radius: width / 2
          color: Theme.pending
        }

        Column {
          visible: cap.kind !== "taphold"
          anchors.centerIn: parent
          spacing: 2.5 * root.s

          Repeater {
            model: cap.legend.lines

            Text {
              required property string modelData
              anchors.horizontalCenter: parent ? parent.horizontalCenter : undefined
              text: modelData
              color: cap.ink
              font.family: Theme.font
              font.pixelSize: Math.max(1, Legend.fontFor(cap.legend.lines, cap.modelData.w, cap.modelData.h) * root.s)
              font.weight: Font.Medium
            }
          }
        }

        Text {
          visible: cap.kind === "taphold"
          anchors.horizontalCenter: parent.horizontalCenter
          y: parent.height / 2 - 8 * root.s - height / 2
          text: cap.kind === "taphold" ? root.labelOf(cap.info.tap) : ""
          color: cap.ink
          font.family: Theme.font
          font.pixelSize: Math.max(1, Math.min(13, Legend.fontFor([text], cap.modelData.w, cap.modelData.h)) * root.s)
          font.weight: Font.DemiBold
        }

        Rectangle {
          visible: cap.kind === "taphold"
          x: 7 * root.s
          y: parent.height / 2 + 2 * root.s
          width: parent.width - 14 * root.s
          height: Math.max(1, root.s)
          color: Theme.muted
        }

        Text {
          visible: cap.kind === "taphold"
          anchors.horizontalCenter: parent.horizontalCenter
          y: parent.height / 2 + 10 * root.s - height / 2
          text: cap.kind === "taphold" ? root.labelOf(cap.info.hold) : ""
          color: cap.bad ? Theme.bad : Theme.taphold
          font.family: Theme.font
          font.pixelSize: Math.max(1, Math.min(8.5, Legend.fontFor([text], cap.modelData.w, cap.modelData.h)) * root.s)
          font.weight: Font.DemiBold
        }
      }

      Rectangle {
        visible: cap.glowing
        anchors.centerIn: parent
        width: parent.width
        height: parent.height
        radius: 10 * root.s
        color: "transparent"
        border.color: Theme.remap
        border.width: 2 * root.s

        SequentialAnimation on scale {
          running: cap.glowing
          loops: Animation.Infinite
          NumberAnimation { from: 1; to: 1.35; duration: 1600; easing.type: Easing.OutCubic }
        }

        SequentialAnimation on opacity {
          running: cap.glowing
          loops: Animation.Infinite
          NumberAnimation { from: 0.85; to: 0; duration: 1600; easing.type: Easing.OutCubic }
        }
      }

      Rectangle {
        visible: cap.glowing
        x: parent.width + 4 * root.s
        anchors.verticalCenter: parent.verticalCenter
        width: glowText.implicitWidth + 12
        height: glowText.implicitHeight + 6
        radius: 5
        color: Theme.surface
        border.width: 1
        border.color: Theme.remap

        Text {
          id: glowText
          anchors.centerIn: parent
          text: root.glowLabels[cap.modelData.position] || ""
          color: Theme.remap
          font.family: Theme.font
          font.pixelSize: Math.max(10, 13 * root.s)
          font.weight: Font.Bold
        }
      }

      Rectangle {
        visible: root.selected === cap.modelData.position
        x: -1 * root.s
        y: -1 * root.s
        width: parent.width + 2 * root.s
        height: parent.height + 2 * root.s
        radius: 11 * root.s
        color: "transparent"
        border.color: Theme.focus
        border.width: 2.5 * root.s
      }

      Shape {
        visible: root.targeting && capArea.containsMouse && root.selected !== cap.modelData.position || drop.containsDrag
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer

        ShapePath {
          fillColor: "transparent"
          strokeColor: Theme.focus
          strokeWidth: 1.2 * root.s
          strokeStyle: ShapePath.DashLine
          dashPattern: [4 / 1.2, 3 / 1.2]

          PathRectangle {
            x: 0
            y: 0
            width: cap.width
            height: cap.height
            radius: 10 * root.s
          }
        }
      }

      DropArea {
        id: drop
        anchors.fill: parent
        keys: ["adv360"]
        enabled: cap.modelData.position !== "smartset"
        onDropped: function(event) { root.dropped(cap.modelData.position, event.source.payload) }
      }

      MouseArea {
        id: capArea

        property point from
        property bool dragging: false

        anchors.fill: parent
        enabled: cap.modelData.position !== "smartset" && !root.lights
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onPressed: function(mouse) { from = Qt.point(mouse.x, mouse.y); dragging = false }
        onPositionChanged: function(mouse) {
          if (!pressed || root.ghost === null) return
          if (!dragging && Math.abs(mouse.x - from.x) + Math.abs(mouse.y - from.y) > 8) {
            dragging = true
            root.ghost.begin({ position: cap.modelData.position }, cap.legend.lines.join(" "))
          }
          if (dragging) root.ghost.follow(this, mouse.x, mouse.y)
        }
        onReleased: {
          if (dragging) root.ghost.end()
          else root.keyClicked(cap.modelData.position)
          dragging = false
        }
      }
    }
  }

  Repeater {
    model: root.placed ? root.placed.leds : []

    Rectangle {
      id: led

      required property var modelData
      readonly property var look: root.ledState(modelData.indicator)

      x: root.ox + modelData.cx * root.unit - width / 2
      y: root.oy + modelData.cy * root.unit - height / 2
      z: 2
      width: (root.lights ? 20 : 12) * root.s
      height: width
      radius: width / 2
      color: !look.lit ? Theme.ledOff : look.layer ? look.color : Theme.mix(look.color, Theme.ledOff, 0.3)
      border.width: 1.5 * root.s
      border.color: look.lit ? look.color : Theme.capBorder

      Rectangle {
        visible: root.lights && led.look.lit && led.look.layer
        anchors.centerIn: parent
        width: parent.width * 1.9
        height: width
        radius: width / 2
        z: -1
        color: Theme.alpha(led.look.color, 0.18)
      }

      Rectangle {
        visible: root.selectedLed === led.modelData.indicator
        anchors.centerIn: parent
        width: parent.width + 10 * root.s
        height: width
        radius: width / 2
        color: "transparent"
        border.width: 2.5 * root.s
        border.color: Theme.focus
      }

      MouseArea {
        anchors.fill: parent
        anchors.margins: -4 * root.s
        cursorShape: Qt.PointingHandCursor
        onClicked: root.ledClicked(led.modelData.indicator)
      }
    }
  }
}
