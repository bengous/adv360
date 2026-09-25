import QtQuick
import "../theme"

Rectangle {
  id: root

  property string text: ""
  property bool primary: false
  property bool active: false
  property bool small: false

  signal clicked()

  implicitWidth: label.implicitWidth + (small ? 16 : 26)
  implicitHeight: small ? 24 : 30
  radius: 6
  opacity: enabled ? 1 : 0.4
  color: primary ? Theme.pending
    : active ? Theme.panel
    : area.containsMouse ? Theme.alpha(Theme.text, 0.06)
    : "transparent"
  border.width: 1
  border.color: primary ? Theme.pending : active ? Theme.focus : Theme.muted

  Text {
    id: label
    anchors.centerIn: parent
    text: root.text
    color: root.primary ? Theme.pendingInk : Theme.text
    font.family: Theme.font
    font.pixelSize: root.small ? Theme.small : 12
    font.weight: root.primary ? Font.Bold : Font.Medium
  }

  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    enabled: root.enabled
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
