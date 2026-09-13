import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// Lighting tab: one row per indicator, edited locally, sent as one `session set-led`.
Flickable {
  id: root

  property var viewData: null
  property int profile: 1

  signal action(var args)

  readonly property var indicators: [
    { id: "IND1", label: "Left LED 1" }, { id: "IND2", label: "Left LED 2" }, { id: "IND3", label: "Left LED 3" },
    { id: "IND4", label: "Right LED 1" }, { id: "IND5", label: "Right LED 2" }, { id: "IND6", label: "Right LED 3" }
  ]
  readonly property var functions: [
    { value: "null", label: "Disable" }, { value: "prof", label: "Profile" }, { value: "layer", label: "Layer" },
    { value: "caps", label: "Caps Lock" }, { value: "nmlk", label: "Num Lock" }, { value: "sclk", label: "Scroll Lock" }, { value: "nkro", label: "NKRO Mode" }
  ]
  readonly property var layerCards: [
    { key: "layd", label: "Base" }, { key: "layk", label: "Kp" }, { key: "lay1", label: "Fn1" }, { key: "lay2", label: "Fn2" }, { key: "lay3", label: "Fn3" }
  ]
  readonly property var swatches: ["#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff", String(Color.accent), String(Color.urgent), String(Color.foreground)]

  function rgbOf(hex) {
    var c = Qt.color(hex)
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]
  }

  contentWidth: width
  contentHeight: column.implicitHeight
  clip: true
  ScrollBar.vertical: ScrollBar {}

  ColumnLayout {
    id: column
    width: root.width
    spacing: Style.spacing.lg

    Repeater {
      model: root.indicators
      ColumnLayout {
        id: row
        required property var modelData
        readonly property var current: root.viewData && root.viewData.leds ? root.viewData.leds[modelData.id] : null
        property string func: "null"
        property var colors: ({})
        Layout.fillWidth: true
        spacing: Style.spacing.xs

        onCurrentChanged: {
          func = current ? String(current.function) : "null"
          colors = current ? JSON.parse(JSON.stringify(current.colors)) : {}
        }

        function cardKeys() { return func === "layer" ? root.layerCards.map(function(c) { return c.key }) : [func] }
        function setColor(key, rgb) { var next = JSON.parse(JSON.stringify(colors)); next[key] = rgb; colors = next }
        function apply() {
          var args = ["session", "set-led", "--profile", String(root.profile), "--indicator", modelData.id, "--func", func]
          var keys = cardKeys()
          for (var i = 0; i < keys.length; i++) {
            var rgb = colors[keys[i]] || [0, 0, 0]
            args = args.concat(["--rgb", (func === "layer" ? keys[i] + "=" : "") + rgb.join(",")])
          }
          root.action(args)
        }

        RowLayout {
          Layout.fillWidth: true
          Text { Layout.preferredWidth: 90; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.body; text: row.modelData.label }
          Dropdown { Layout.fillWidth: true; showLabel: false; value: row.func; options: root.functions; onChanged: function(v) { row.func = v } }
          Button { text: "Set"; bordered: true; enabled: row.func !== "null" || (row.current && row.current.function !== "null"); onClicked: row.apply() }
        }

        Repeater {
          model: row.func === "layer" ? root.layerCards : (row.func === "null" ? [] : [{ key: row.func, label: "Colour" }])
          RowLayout {
            id: card
            required property var modelData
            readonly property var rgb: row.colors[modelData.key] || [0, 0, 0]
            Layout.fillWidth: true
            Text { Layout.preferredWidth: 90; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall; text: "  " + card.modelData.label }
            Rectangle { width: 18; height: 18; radius: 4; color: Qt.rgba(card.rgb[0] / 255, card.rgb[1] / 255, card.rgb[2] / 255, 1); border.color: Color.muted }
            Repeater {
              model: 3
              TextField {
                required property int index
                Layout.preferredWidth: 44
                text: String(card.rgb[index])
                validator: IntValidator { bottom: 0; top: 255 }
                onEditingFinished: { var next = card.rgb.slice(); next[index] = Number(text); row.setColor(card.modelData.key, next) }
              }
            }
            Row {
              spacing: 2
              Repeater {
                model: root.swatches
                Rectangle {
                  required property var modelData
                  width: 14; height: 14; radius: 3
                  color: modelData
                  border.color: Color.muted
                  MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: row.setColor(card.modelData.key, root.rgbOf(parent.color)) }
                }
              }
            }
          }
        }
      }
    }
  }
}
