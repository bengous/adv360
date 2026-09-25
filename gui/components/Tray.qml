pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../macro.mjs" as MacroStrip

// The unwritten changes of the profile, one chip each, and the two ways out: discard or write.
Rectangle {
  id: root

  required property var app
  property bool confirming: false

  color: Theme.tray

  function layerPrefix(layer) {
    return layer === "base" ? "" : app.layerLabel(layer) + " · "
  }

  // subject → value, the value drawn as a keycap tinted like the key it lands on.
  function chipOf(edit) {
    switch (edit.op) {
    case "set-remap":
      return { subject: layerPrefix(edit.layer) + app.nameOf(edit.position) + " →", value: app.labelOf(edit.action), kind: app.known(edit.action) ? "remap" : "bad" }
    case "set-taphold":
      return { subject: layerPrefix(edit.layer) + app.nameOf(edit.position) + " → " + app.labelOf(edit.tap) + ", hold", value: app.labelOf(edit.hold), kind: app.known(edit.tap) && app.known(edit.hold) ? "taphold" : "bad" }
    case "set-macro":
      return { subject: layerPrefix(edit.layer) + (edit.cotrigger ? app.labelOf(edit.cotrigger).replace(/^(Left|Right) /, "") + " + " : "") + app.nameOf(edit.trigger) + " → types", value: MacroStrip.macroPreview(MacroStrip.stripOf(edit.tokens).strip), kind: "" }
    case "remove":
      return { subject: layerPrefix(edit.layer) + app.nameOf(edit.position) + " →", value: "factory", kind: "" }
    case "remove-macro":
      return { subject: layerPrefix(edit.layer) + "macro on " + app.nameOf(edit.trigger), value: "removed", kind: "" }
    case "set-led":
      return { subject: edit.indicator + " lights for", value: app.ledFunctionLabel(edit.function), kind: "" }
    default:
      return { subject: "restore", value: "file from backup", kind: "" }
    }
  }

  onVisibleChanged: confirming = false

  Connections {
    target: root.app
    function onPendingChanged() { root.confirming = false }
  }

  Rectangle {
    width: parent.width
    height: 1
    color: Theme.line
  }

  RowLayout {
    anchors.fill: parent
    anchors.leftMargin: 20
    anchors.rightMargin: 20
    spacing: 10

    Text {
      text: root.app.changes.length === 0 ? "Nothing to write" : "Not written:"
      color: Theme.dim
      font.family: Theme.font
      font.pixelSize: 12
    }

    Flickable {
      Layout.fillWidth: true
      Layout.preferredHeight: 34
      contentWidth: chips.implicitWidth
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      Row {
        id: chips
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8

        Repeater {
          model: root.app.changes

          Rectangle {
            id: chip

            required property var modelData
            readonly property var look: root.chipOf(modelData.show)

            implicitWidth: chipRow.implicitWidth + 18
            implicitHeight: 32
            radius: 7
            color: "transparent"
            border.width: 1
            border.color: look.kind === "bad" ? Theme.bad : Theme.alpha(Theme.pending, 0.55)

            Row {
              id: chipRow
              anchors.verticalCenter: parent.verticalCenter
              x: 10
              spacing: 7

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: chip.look.subject
                color: Theme.text
                font.family: Theme.font
                font.pixelSize: 12
              }

              Keycap {
                label: chip.look.value
                kind: chip.look.kind
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "×"
                color: removeArea.containsMouse ? Theme.text : Theme.dim
                font.family: Theme.font
                font.pixelSize: 14

                MouseArea {
                  id: removeArea
                  anchors.fill: parent
                  anchors.margins: -5
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.app.removeEdits(chip.modelData.indices)
                }
              }
            }
          }
        }
      }
    }

    Text {
      visible: root.app.message !== ""
      Layout.maximumWidth: 360
      text: root.app.message
      color: Theme.bad
      font.family: Theme.font
      font.pixelSize: 12
      elide: Text.ElideRight
    }

    Btn {
      text: "Discard all"
      enabled: root.app.pending > 0
      onClicked: root.app.discardAll()
    }

    Btn {
      text: root.confirming ? "Confirm: write profile " + root.app.profile : "Write to keyboard"
      primary: true
      enabled: root.app.pending > 0 && root.app.mounted
      onClicked: {
        if (!root.confirming) {
          root.confirming = true
          return
        }
        root.confirming = false
        root.app.act(["apply", "--profile", String(root.app.profile)])
      }
    }
  }
}
