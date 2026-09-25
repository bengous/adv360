pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import "../theme"
import "../controls"

// Two slots and a delay: tapped, the key sends Tap; held past the delay, it acts as Hold.
ColumnLayout {
  id: root

  required property var app
  property var ghost: null

  component Slot: Item {
    id: slot

    property string name: ""
    property string token: ""
    readonly property bool active: root.app.slot === name

    implicitWidth: Math.max(130, content.implicitWidth + 16)
    implicitHeight: 34

    Rectangle {
      visible: slot.active || drop.containsDrag
      anchors.fill: parent
      radius: 8
      color: "transparent"
      border.width: 1.5
      border.color: Theme.focus
    }

    Shape {
      visible: !slot.active && !drop.containsDrag
      anchors.fill: parent
      preferredRendererType: Shape.CurveRenderer

      ShapePath {
        fillColor: "transparent"
        strokeColor: Theme.muted
        strokeWidth: 1.5
        strokeStyle: ShapePath.DashLine
        dashPattern: [3, 2]

        PathRectangle {
          x: 0
          y: 0
          width: slot.width
          height: slot.height
          radius: 8
        }
      }
    }

    Row {
      id: content
      anchors.verticalCenter: parent.verticalCenter
      x: 8
      spacing: 8

      Keycap {
        visible: slot.token !== ""
        label: root.app.labelOf(slot.token)
        kind: !root.app.known(slot.token) ? "bad" : slot.name === "hold" ? "taphold" : ""
      }

      Text {
        visible: slot.active || slot.token === ""
        anchors.verticalCenter: parent.verticalCenter
        text: slot.active ? "next click fills this" : "empty"
        color: Theme.dim
        font.family: Theme.font
        font.pixelSize: 12
      }
    }

    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.PointingHandCursor
      onClicked: root.app.slot = slot.name
    }

    DropArea {
      id: drop
      anchors.fill: parent
      keys: ["adv360"]
      onDropped: function(event) {
        var payload = event.source.payload
        var source = payload.position === undefined ? null : root.app.keyAt(payload.position)
        root.app.slot = slot.name
        root.app.assign(payload.token !== undefined ? payload.token : source === null ? "" : root.app.actionOf(source))
      }
    }
  }

  component Label: Text {
    color: Theme.dim
    font.family: Theme.font
    font.pixelSize: 12
  }

  spacing: 8

  RowLayout {
    Layout.fillWidth: true
    spacing: 14

    Label { text: "Tap" }
    Slot { name: "tap"; token: root.app.tapDraft }
    Label { text: "Hold" }
    Slot { name: "hold"; token: root.app.holdDraft }

    Slider {
      Layout.leftMargin: 20
      Layout.preferredWidth: 240
      label: "Hold after"
      valueText: root.app.delay + " ms"
      from: 50
      to: 600
      stepSize: 10
      value: root.app.delay
      ticks: [100, 300, 500]
      onMoved: function(v) { root.app.setDelay(v) }
    }

    Item { Layout.fillWidth: true }
  }

  OneAction {
    Layout.fillWidth: true
    Layout.fillHeight: true
    app: root.app
    ghost: root.ghost
    current: root.app.slot === "tap" ? root.app.tapDraft : root.app.holdDraft
  }
}
