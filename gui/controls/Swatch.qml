import QtQuick
import "../theme"

// One LED colour; black is the LED switched off.
Rectangle {
  id: root

  property color swatch: "black"
  property bool selected: false
  readonly property bool off: swatch.r === 0 && swatch.g === 0 && swatch.b === 0

  signal clicked()

  implicitWidth: 18
  implicitHeight: 18
  radius: 4
  color: off ? Theme.ledOff : swatch
  border.width: selected ? 2 : 1
  border.color: selected ? Theme.focus : "#333842"

  Rectangle {
    visible: root.off
    anchors.centerIn: parent
    width: parent.width * 1.1
    height: 1
    rotation: -45
    color: Theme.muted
  }

  MouseArea {
    anchors.fill: parent
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
