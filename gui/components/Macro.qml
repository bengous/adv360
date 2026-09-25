pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../macro.mjs" as MacroStrip

// The strip a key plays: a click adds a key at the end, a click on a step turns it into a
// press (↓) or a release (↑); trigger, speed and repeat sit above it.
ColumnLayout {
  id: root

  required property var app
  property var ghost: null

  readonly property var cotriggers: {
    var out = [{ value: "none", label: "none" }, { value: "lctr", label: "Ctrl" }, { value: "lshf", label: "Shift" }, { value: "lalt", label: "Alt" }, { value: "lwin", label: "Win" }]
    var current = app.cotrigger
    if (current !== null && ["lctr", "lshf", "lalt", "lwin"].indexOf(current) < 0) out.push({ value: current, label: app.labelOf(current) })
    return out
  }
  readonly property int steps: app.strip.length + (app.speed === null ? 0 : 1) + (app.repeat === null ? 0 : 1)

  component Label: Text {
    color: Theme.dim
    font.family: Theme.font
    font.pixelSize: 12
  }

  spacing: 8

  RowLayout {
    Layout.fillWidth: true
    spacing: 12

    Label { text: "Trigger" }

    Segmented {
      options: root.cotriggers
      value: root.app.cotrigger === null ? "none" : root.app.cotrigger
      onPicked: function(v) { root.app.setCotrigger(v) }
    }

    Text {
      text: "+ " + root.app.nameOf(root.app.selected)
      color: Theme.text
      font.family: Theme.font
      font.pixelSize: 13
    }

    Slider {
      Layout.leftMargin: 16
      Layout.preferredWidth: 160
      label: "Speed"
      valueText: root.app.speed === null ? "default" : String(root.app.speed)
      from: 0
      to: 9
      value: root.app.speed === null ? 0 : root.app.speed
      onMoved: function(v) { root.app.setSpeed(v) }
    }

    Slider {
      Layout.preferredWidth: 160
      label: "Repeat"
      valueText: (root.app.repeat === null ? 1 : root.app.repeat) + "×"
      from: 1
      to: 9
      value: root.app.repeat === null ? 1 : root.app.repeat
      onMoved: function(v) { root.app.setRepeat(v) }
    }

    Item { Layout.fillWidth: true }
  }

  RowLayout {
    Layout.fillWidth: true
    spacing: 12

    Rectangle {
      Layout.fillWidth: true
      Layout.maximumWidth: stripRow.implicitWidth + 18
      implicitHeight: 40
      radius: 8
      color: Theme.surface
      border.width: 1
      border.color: Theme.muted
      clip: true

      Row {
        id: stripRow
        anchors.verticalCenter: parent.verticalCenter
        x: 8
        spacing: 6

        Repeater {
          model: root.app.strip

          Keycap {
            id: step

            required property var modelData
            required property int index

            label: root.app.labelOf(modelData.token)
            sup: modelData.stroke === "down" ? "↓" : modelData.stroke === "up" ? "↑" : ""
            kind: root.app.known(modelData.token) || /^d(\d+|ran)$/.test(modelData.token) ? "" : "bad"
            hover: stepArea.containsMouse

            MouseArea {
              id: stepArea
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.app.cycleStroke(step.index)
            }

            Rectangle {
              visible: stepArea.containsMouse || removeArea.containsMouse
              anchors.right: parent.right
              anchors.top: parent.top
              anchors.margins: -5
              width: 14
              height: 14
              radius: 7
              color: Theme.panel
              border.width: 1
              border.color: Theme.muted

              Text {
                anchors.centerIn: parent
                text: "×"
                color: Theme.text
                font.family: Theme.font
                font.pixelSize: 10
              }

              MouseArea {
                id: removeArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.app.removeStep(step.index)
              }
            }
          }
        }

        Rectangle {
          implicitWidth: addText.implicitWidth + 20
          implicitHeight: 24
          radius: 6
          color: "transparent"
          border.width: 1
          border.color: Theme.muted

          Text {
            id: addText
            anchors.centerIn: parent
            text: "+ key"
            color: Theme.dim
            font.family: Theme.font
            font.pixelSize: 12
          }
        }
      }
    }

    Label {
      visible: root.app.strip.length > 0
      text: "types"
    }

    Text {
      visible: root.app.strip.length > 0
      Layout.maximumWidth: 280
      text: MacroStrip.macroPreview(root.app.strip)
      color: Theme.macro
      font.family: Theme.font
      font.pixelSize: 13
      font.weight: Font.Bold
      elide: Text.ElideRight
    }

    Item { Layout.fillWidth: true }

    Label { text: root.steps + " / 300" }
  }

  OneAction {
    Layout.fillWidth: true
    Layout.fillHeight: true
    app: root.app
    ghost: root.ghost
    current: root.app.strip.length > 0 ? root.app.strip[root.app.strip.length - 1].token : ""
    fallback: "Letters"
  }
}
