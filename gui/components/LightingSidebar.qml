import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

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
    { value: "caps", label: "Caps Lock" }, { value: "nmlk", label: "Num Lock" }, { value: "sclk", label: "Scroll Lock" }, { value: "nkro", label: "NKRO" }
  ]
  readonly property var layerCards: [
    { key: "layd", label: "Base" }, { key: "layk", label: "Kp" }, { key: "lay1", label: "Fn1" }, { key: "lay2", label: "Fn2" }, { key: "lay3", label: "Fn3" }
  ]
  readonly property var swatches: ["#ffffff", "#ff0000", "#ff8000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#8000ff", "#ff00ff", "#000000"]

  function rgbOf(hex) {
    var c = Qt.color(hex)
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]
  }

  function hexOf(rgb) {
    return "#" + rgb.map(function(v) { return (v < 16 ? "0" : "") + v.toString(16) }).join("")
  }

  contentWidth: width
  contentHeight: column.implicitHeight
  clip: true

  ColumnLayout {
    id: column
    width: root.width
    spacing: 16

    Repeater {
      model: root.indicators

      ColumnLayout {
        id: row

        required property var modelData
        readonly property var current: root.viewData && root.viewData.leds ? root.viewData.leds[modelData.id] : null
        property string func: "null"
        property var colors: ({})

        Layout.fillWidth: true
        spacing: 6

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
          Text { Layout.fillWidth: true; color: Theme.text; font.family: Theme.font; font.pixelSize: Theme.body; text: row.modelData.label }
          Btn { text: "Set"; enabled: row.func !== "null" || (row.current && row.current.function !== "null"); onClicked: row.apply() }
        }

        Flow {
          Layout.fillWidth: true
          spacing: 4

          Repeater {
            model: root.functions

            Btn {
              required property var modelData
              small: true
              text: modelData.label
              active: row.func === modelData.value
              onClicked: row.func = modelData.value
            }
          }
        }

        Repeater {
          model: row.func === "layer" ? root.layerCards : (row.func === "null" ? [] : [{ key: row.func, label: "Colour" }])

          RowLayout {
            id: card

            required property var modelData
            readonly property var rgb: row.colors[modelData.key] || [0, 0, 0]

            Layout.fillWidth: true
            spacing: 4

            Text { Layout.preferredWidth: 52; color: Theme.dim; font.family: Theme.font; font.pixelSize: 12; text: card.modelData.label }

            HexField {
              hex: root.hexOf(card.rgb)
              onAccepted: function(hex) { row.setColor(card.modelData.key, root.rgbOf(hex)) }
            }

            Repeater {
              model: root.swatches

              Swatch {
                required property var modelData
                swatch: modelData
                selected: root.hexOf(card.rgb) === modelData
                onClicked: row.setColor(card.modelData.key, root.rgbOf(modelData))
              }
            }
          }
        }
      }
    }
  }
}
