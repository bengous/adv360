pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

// The one place where a key is edited, under the keyboard; its notch points at the key.
Item {
  id: root

  required property var app
  property var ghost: null
  property real notchX: 40

  readonly property var key: app.selectedKey
  readonly property string currentAction: key === null ? "" : key.kind === "taphold" ? key.tap : String(key.action || "")

  Rectangle {
    x: Math.max(12, Math.min(root.width - 26, root.notchX - 7))
    y: -7
    width: 14
    height: 14
    rotation: 45
    color: Theme.panel
    border.width: 1
    border.color: Theme.panelEdge
  }

  Rectangle {
    anchors.fill: parent
    radius: 10
    color: Theme.panel
    border.width: 1
    border.color: Theme.panelEdge

    Rectangle {
      x: Math.max(13, Math.min(root.width - 25, root.notchX - 6))
      y: 0
      width: 12
      height: 2
      color: Theme.panel
    }
  }

  ColumnLayout {
    anchors.fill: parent
    anchors.leftMargin: 14
    anchors.rightMargin: 14
    anchors.topMargin: 12
    anchors.bottomMargin: 10
    spacing: 8

    RowLayout {
      Layout.fillWidth: true
      spacing: 12

      Text {
        text: root.app.nameOf(root.app.selected)
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: Theme.title
        font.weight: Font.Bold
      }

      Text {
        text: "on " + root.app.layerLabel(root.app.layerName)
        color: Theme.dim
        font.family: Theme.font
        font.pixelSize: 12
      }

      Text {
        visible: root.app.drawer === "one"
        text: "sends"
        color: Theme.dim
        font.family: Theme.font
        font.pixelSize: 12
      }

      Rectangle {
        visible: root.app.drawer === "one"
        implicitWidth: slotRow.implicitWidth + 16
        implicitHeight: 34
        radius: 8
        color: "transparent"
        border.width: 1.5
        border.color: Theme.focus

        Row {
          id: slotRow
          anchors.centerIn: parent
          spacing: 8

          Keycap {
            label: root.currentAction === "" ? "nothing" : root.app.labelOf(root.currentAction)
            kind: root.key !== null && root.key.kind === "remap" ? (root.app.known(root.currentAction) ? "remap" : "bad") : ""
          }

          Text {
            visible: root.key !== null && root.key.pending === true
            anchors.verticalCenter: parent.verticalCenter
            text: "not written"
            color: Theme.pending
            font.family: Theme.font
            font.pixelSize: 12
          }
        }
      }

      Item { Layout.fillWidth: true }

      Segmented {
        options: [{ value: "one", label: "One action" }]
        value: root.app.drawer
        onPicked: function(v) { root.app.drawer = v }
      }

      Btn {
        text: root.app.capturing ? "Press any key…" : "Press a key"
        active: root.app.capturing
        onClicked: root.app.capturing = !root.app.capturing
      }

      Btn {
        text: "Reset"
        enabled: root.key !== null && root.key.kind !== "default"
        onClicked: root.app.reset()
      }

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

    OneAction {
      visible: root.app.drawer === "one"
      Layout.fillWidth: true
      Layout.fillHeight: true
      app: root.app
      ghost: root.ghost
      current: root.currentAction
    }
  }
}
