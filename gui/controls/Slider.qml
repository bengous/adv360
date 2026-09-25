pragma ComponentBehavior: Bound

import QtQuick
import "../theme"

// A labelled slider; moved() fires on release, so one drag makes one edit.
Item {
  id: root

  property string label: ""
  property string valueText: String(value)
  property real from: 0
  property real to: 100
  property real stepSize: 1
  property real value: 0
  property var ticks: []

  signal moved(real value)

  readonly property real ratio: to > from ? (shown - from) / (to - from) : 0
  property real shown: value
  onValueChanged: shown = value

  implicitWidth: 200
  implicitHeight: column.implicitHeight

  function valueAt(x) {
    var r = Math.max(0, Math.min(1, x / track.width))
    var raw = from + r * (to - from)
    return Math.round(raw / stepSize) * stepSize
  }

  Column {
    id: column
    width: parent.width
    spacing: 5

    Row {
      spacing: 6

      Text {
        text: root.label
        color: Theme.dim
        font.family: Theme.font
        font.pixelSize: 12
      }

      Text {
        text: root.valueText
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: 12
        font.weight: Font.Bold
      }
    }

    Item {
      width: parent.width
      height: 16

      Rectangle {
        id: track
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width
        height: 4
        radius: 2
        color: Theme.muted

        Rectangle {
          width: parent.width * root.ratio
          height: parent.height
          radius: 2
          color: Theme.focus
        }
      }

      Rectangle {
        x: track.width * root.ratio - width / 2
        anchors.verticalCenter: parent.verticalCenter
        width: 16
        height: 16
        radius: 8
        color: Theme.focus
        border.width: 3
        border.color: Theme.panel
      }

      MouseArea {
        anchors.fill: parent
        anchors.margins: -6
        cursorShape: Qt.PointingHandCursor
        onPressed: function(mouse) { root.shown = root.valueAt(mouse.x - 6) }
        onPositionChanged: function(mouse) { root.shown = root.valueAt(mouse.x - 6) }
        onReleased: if (root.shown !== root.value) root.moved(root.shown)
      }
    }

    Item {
      visible: root.ticks.length > 0
      width: parent.width
      height: visible ? 12 : 0

      Repeater {
        model: root.ticks

        Text {
          required property var modelData
          x: Math.max(0, Math.min(parent.width - width, parent.width * (modelData - root.from) / (root.to - root.from) - width / 2))
          text: String(modelData)
          color: Theme.dim
          font.family: Theme.font
          font.pixelSize: 10
        }
      }
    }
  }
}
