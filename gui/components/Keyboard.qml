import QtQuick
import qs.Commons

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
    radius: Style.cornerRadius
    color: Util.alpha(Color.foreground, 0.03)
    border.color: Util.alpha(Color.foreground, 0.1)
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
      radius: Style.cornerRadius
      color: !programmable ? Util.alpha(Color.muted, 0.2)
        : kind === "remap" ? Util.alpha(Color.accent, 0.35)
        : kind === "taphold" ? Util.alpha(Color.accent, 0.18)
        : Util.alpha(Color.foreground, 0.06)
      border.color: isSelected ? Color.urgent : pending ? Color.foreground : kind === "taphold" ? Color.accent : Util.alpha(Color.foreground, 0.25)
      border.width: isSelected || pending ? 3 : kind === "taphold" ? 2 : 1

      Text {
        anchors.fill: parent
        anchors.margins: 2
        text: !key.programmable ? "⚙" : (key.info ? String(key.info.label) : String(key.modelData.position))
        color: key.isSelected ? Color.urgent : Color.foreground
        font.family: Style.font.family
        font.pixelSize: Math.max(8, Style.font.caption * root.unit)
        font.bold: key.kind !== "default"
        wrapMode: Text.Wrap
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
      }

      Rectangle {
        visible: key.hasMacro
        width: 8; height: 8; radius: 4
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.margins: 2
        color: Color.urgent
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
      border.color: Util.alpha(Color.foreground, 0.4)
      border.width: 1
    }
  }

  Text {
    anchors.left: parent.left
    anchors.bottom: parent.bottom
    anchors.margins: Style.spacing.md
    color: Color.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
    text: "accent = remap · outlined = tap & hold · red dot = macro · thick border = pending edit · red = selected"
  }
}
