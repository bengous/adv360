pragma ComponentBehavior: Bound

import QtQuick
import "../theme"

// One choice among a few: options are { value, label, dot? }; a dot is a colour, "" for off.
Rectangle {
  id: root

  property var options: []
  property var value: null

  signal picked(var value)

  implicitWidth: row.implicitWidth + 2
  implicitHeight: 30
  radius: 7
  color: "transparent"
  border.width: 1
  border.color: Theme.muted
  opacity: enabled ? 1 : 0.4

  Row {
    id: row
    x: 1
    y: 1
    height: root.height - 2

    Repeater {
      model: root.options

      Item {
        id: option

        required property var modelData
        required property int index
        readonly property bool on: root.value === modelData.value

        width: content.implicitWidth + 24
        height: row.height

        Rectangle {
          anchors.fill: parent
          radius: 6
          color: option.on ? Theme.panel : area.containsMouse ? Theme.alpha(Theme.text, 0.05) : "transparent"
        }

        Rectangle {
          visible: option.index > 0
          width: 1
          height: parent.height
          color: Theme.muted
        }

        Rectangle {
          visible: option.on
          anchors.bottom: parent.bottom
          anchors.horizontalCenter: parent.horizontalCenter
          width: parent.width - 8
          height: 2
          color: Theme.focus
        }

        Row {
          id: content
          anchors.centerIn: parent
          spacing: 7

          Rectangle {
            visible: option.modelData.dot !== undefined
            anchors.verticalCenter: parent.verticalCenter
            width: 8
            height: 8
            radius: 4
            color: option.modelData.dot ? option.modelData.dot : "transparent"
            border.width: 1
            border.color: "#454b55"
          }

          Text {
            text: option.modelData.label
            color: option.on ? Theme.text : Theme.dim
            font.family: Theme.font
            font.pixelSize: 12
            font.weight: Font.Medium
          }
        }

        MouseArea {
          id: area
          anchors.fill: parent
          hoverEnabled: true
          enabled: root.enabled
          cursorShape: Qt.PointingHandCursor
          onClicked: root.picked(option.modelData.value)
        }
      }
    }
  }
}
