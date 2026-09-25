pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../led.mjs" as Led

// One LED: what it lights up for, and its colour, per layer for a layer LED.
ColumnLayout {
  id: root

  required property var app

  readonly property var led: app.viewData && app.viewData.leds && app.selectedLed !== "" ? app.viewData.leds[app.selectedLed] || null : null
  readonly property string func: led === null ? "null" : String(led.function)
  readonly property var layerChips: app.layers.map(function(l) { return { key: l.led, label: l.label } })
  readonly property string editing: func === "layer" ? app.ledLayer : func
  readonly property var editingRgb: led !== null && led.colors[editing] ? led.colors[editing] : [0, 0, 0]
  readonly property var functions: [
    { value: "null", label: "Off" }, { value: "layer", label: "Layer" }, { value: "caps", label: "Caps Lock" },
    { value: "nmlk", label: "Num Lock" }, { value: "sclk", label: "Scroll Lock" }, { value: "prof", label: "Profile" },
    { value: "nkro", label: "NKRO" }
  ]
  readonly property var swatches: ["#ffffff", "#ff0000", "#ff8000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#8000ff", "#ff00ff", "#000000"]

  component Label: Text {
    color: Theme.dim
    font.family: Theme.font
    font.pixelSize: 12
  }

  spacing: 10

  RowLayout {
    Layout.fillWidth: true
    spacing: 12

    Text {
      text: root.app.ledName(root.app.selectedLed)
      color: Theme.text
      font.family: Theme.font
      font.pixelSize: Theme.title
      font.weight: Font.Bold
    }

    Label { text: root.app.selectedLed }

    Label { text: "lights up for" }

    Segmented {
      options: root.functions
      value: root.func
      onPicked: function(v) { root.app.setLedFunction(v) }
    }

    Label {
      visible: root.func === "layer"
      text: "one colour per layer"
    }

    Item { Layout.fillWidth: true }

    Text {
      text: "×"
      color: closeArea.containsMouse ? Theme.text : Theme.dim
      font.family: Theme.font
      font.pixelSize: 18

      MouseArea {
        id: closeArea
        anchors.fill: parent
        anchors.margins: -6
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.app.closeDrawer()
      }
    }
  }

  Row {
    visible: root.func === "layer"
    spacing: 8

    Repeater {
      model: root.layerChips

      Rectangle {
        id: chip

        required property var modelData
        readonly property bool on: root.app.ledLayer === modelData.key
        readonly property var rgb: root.led !== null && root.led.colors[modelData.key] ? root.led.colors[modelData.key] : [0, 0, 0]

        width: 84
        height: 70
        radius: 7
        color: on ? Theme.surface : "transparent"

        Rectangle {
          visible: chip.on
          anchors.bottom: parent.bottom
          width: parent.width
          height: 2
          color: Theme.focus
        }

        Column {
          anchors.centerIn: parent
          spacing: 5

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: chip.modelData.label
            color: chip.on ? Theme.text : Theme.dim
            font.family: Theme.font
            font.pixelSize: 12
          }

          Swatch {
            anchors.horizontalCenter: parent.horizontalCenter
            swatch: Led.hexOf(chip.rgb)
            onClicked: root.app.ledLayer = chip.modelData.key
          }

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Led.hexOf(chip.rgb) === "#000000" ? "off" : Led.hexOf(chip.rgb)
            color: Theme.dim
            font.family: Theme.font
            font.pixelSize: 10
          }
        }

        MouseArea {
          anchors.fill: parent
          z: -1
          cursorShape: Qt.PointingHandCursor
          onClicked: root.app.ledLayer = chip.modelData.key
        }
      }
    }
  }

  RowLayout {
    visible: root.func !== "null"
    spacing: 7

    Label {
      Layout.preferredWidth: 70
      text: root.func === "layer" ? root.app.layers.filter(function(l) { return l.led === root.app.ledLayer }).map(function(l) { return l.label })[0] || "" : "Colour"
    }

    Repeater {
      model: root.swatches

      Swatch {
        required property string modelData
        swatch: modelData
        selected: Led.hexOf(root.editingRgb) === modelData
        onClicked: root.app.setLedColor(root.editing, modelData)
      }
    }

    HexField {
      Layout.leftMargin: 12
      hex: Led.hexOf(root.editingRgb)
      onAccepted: function(hex) { root.app.setLedColor(root.editing, hex) }
    }
  }

  Item { Layout.fillHeight: true }
}
