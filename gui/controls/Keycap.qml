import QtQuick
import "../theme"

// A small keycap: an action tile, a chip value, a step of a macro strip.
Rectangle {
  id: root

  property string label: ""
  property string sup: ""
  // "", "remap", "taphold", "macro" or "bad"
  property string kind: ""
  property bool current: false
  property bool glow: false
  property bool interactive: false
  property bool hover: false

  signal clicked()

  readonly property color face: kind === "remap" ? Theme.tint(Theme.remap, 0.28)
    : kind === "taphold" ? Theme.tint(Theme.taphold, 0.28)
    : kind === "macro" ? Theme.tint(Theme.macro, 0.22)
    : kind === "bad" ? Theme.tint(Theme.bad, 0.28)
    : glow ? Theme.remap
    : Theme.cap

  implicitWidth: Math.max(28, content.implicitWidth + 18)
  implicitHeight: 26
  radius: 6
  color: Theme.capEdge
  border.width: current ? 2 : 0
  border.color: Theme.remap

  Rectangle {
    anchors.fill: parent
    anchors.bottomMargin: 2
    radius: 6
    color: area.containsMouse || root.hover ? Qt.lighter(root.face, 1.18) : root.face
    border.width: 1
    border.color: area.containsMouse || root.hover ? Theme.focus : Theme.capBorder
  }

  Row {
    id: content
    anchors.centerIn: parent
    anchors.verticalCenterOffset: -1

    Text {
      text: root.label
      color: root.kind === "bad" ? Theme.bad : root.glow ? Theme.ground : Theme.text
      font.family: Theme.font
      font.pixelSize: 12
      font.weight: root.glow ? Font.Bold : Font.Medium
    }

    Text {
      visible: root.sup !== ""
      text: root.sup
      color: Theme.macro
      font.family: Theme.font
      font.pixelSize: 10
    }
  }

  MouseArea {
    id: area
    anchors.fill: parent
    enabled: root.interactive
    hoverEnabled: root.interactive
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
