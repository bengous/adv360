import QtQuick
import "../theme"

// The 77 hit-boxes of the SmartSet App form, scaled to the item's width.
Item {
  id: root

  property var keyboard: null
  property var viewData: null
  property string layerName: "base"
  property string selected: ""

  signal keyClicked(string position)

  readonly property real unit: keyboard ? Math.min(width / keyboard.canvas.width, height / keyboard.canvas.height) : 1
  readonly property real ox: keyboard ? (width - keyboard.canvas.width * unit) / 2 : 0
  readonly property real oy: keyboard ? (height - keyboard.canvas.height * unit) / 2 : 0
  readonly property var byPosition: {
    var map = {}
    if (viewData && viewData.keys) for (var i = 0; i < viewData.keys.length; i++) map[viewData.keys[i].position] = viewData.keys[i]
    return map
  }
  readonly property string layerFunc: layerName === "base" ? "layd" : layerName === "keypad" ? "layk" : layerName === "function1" ? "lay1" : layerName === "function2" ? "lay2" : "lay3"

  function ledColor(indicator) {
    if (!viewData || !viewData.leds || !viewData.leds[indicator]) return "transparent"
    var led = viewData.leds[indicator]
    var rgb = led.function === "layer" ? led.colors[layerFunc] : led.colors[led.function]
    if (!rgb) return "transparent"
    return Qt.rgba(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1)
  }

  Rectangle {
    anchors.fill: parent
    radius: 8
    color: Theme.ground
    border.color: Theme.line
  }

  Repeater {
    model: root.keyboard ? root.keyboard.keys : []

    Rectangle {
      id: key

      required property var modelData
      readonly property var info: root.byPosition[modelData.position] || null
      readonly property string kind: info ? String(info.kind) : "default"
      readonly property bool programmable: modelData.programmable !== false
      readonly property bool isSelected: root.selected === modelData.position
      readonly property bool pending: info ? info.pending === true : false
      readonly property bool hasMacro: info && info.macros && info.macros.length > 0

      x: root.ox + modelData.x * root.unit
      y: root.oy + modelData.y * root.unit
      width: modelData.w * root.unit
      height: modelData.h * root.unit
      radius: 5
      color: !programmable ? Theme.surface
        : kind === "remap" ? Theme.tint(Theme.remap, 0.3)
        : kind === "taphold" ? Theme.tint(Theme.taphold, 0.3)
        : hasMacro ? Theme.tint(Theme.macro, 0.22)
        : Theme.cap
      border.color: isSelected ? Theme.focus : Theme.capBorder
      border.width: isSelected ? 2 : 1

      Text {
        anchors.fill: parent
        anchors.margins: 2
        text: !key.programmable ? "⚙" : (key.info ? String(key.info.label) : String(key.modelData.position))
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: Math.max(8, 11 * root.unit)
        wrapMode: Text.Wrap
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
      }

      Rectangle {
        visible: key.pending
        width: 6
        height: 6
        radius: 3
        x: 4
        y: 4
        color: Theme.pending
      }

      MouseArea {
        anchors.fill: parent
        enabled: key.programmable
        cursorShape: Qt.PointingHandCursor
        onClicked: root.keyClicked(key.modelData.position)
      }
    }
  }

  Repeater {
    model: root.keyboard ? root.keyboard.leds : []

    Rectangle {
      required property var modelData
      x: root.ox + (modelData.x + modelData.w / 2 - modelData.h / 2) * root.unit
      y: root.oy + modelData.y * root.unit
      width: modelData.h * root.unit
      height: modelData.h * root.unit
      radius: height / 2
      color: root.ledColor(modelData.indicator)
      border.color: Theme.capBorder
      border.width: 1
    }
  }
}
