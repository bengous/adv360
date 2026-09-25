pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

// The unwritten changes of the profile, one chip each, and the two ways out: discard or write.
Rectangle {
  id: root

  required property var app

  color: Theme.tray

  readonly property bool conflict: app.sessionState === "conflict"

  // subject → value, the value drawn as a keycap tinted like the key it lands on.
  function chipOf(edit) {
    var name = app.changeName(edit)
    switch (edit.op) {
    case "set-taphold":
      return { subject: name + " → " + app.labelOf(edit.tap) + ", hold", value: app.labelOf(edit.hold), kind: app.known(edit.tap) && app.known(edit.hold) ? "taphold" : "bad" }
    case "set-macro":
      return { subject: name + " → types", value: app.preview(edit.tokens), kind: "" }
    default:
      var after = app.afterOf(edit)
      return { subject: name + " →", value: after.label, kind: after.kind }
    }
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
      visible: !root.conflict
      text: root.app.changes.length > 0 ? "Not written:" : root.app.note !== "" ? root.app.note : "Nothing to write"
      color: root.app.changes.length === 0 && root.app.note !== "" ? Theme.pending : Theme.dim
      font.family: Theme.font
      font.pixelSize: 12
    }

    Text {
      visible: root.conflict
      Layout.fillWidth: true
      text: "The files on the keyboard changed since your first edit on profile " + root.app.profile + "."
      color: Theme.bad
      font.family: Theme.font
      font.pixelSize: 12
      elide: Text.ElideRight
    }

    Btn {
      visible: root.conflict
      text: "Show diff"
      onClicked: root.app.openReview()
    }

    Btn {
      visible: root.conflict
      text: "Discard"
      onClicked: root.app.discardAll()
    }

    Flickable {
      visible: !root.conflict
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
      visible: !root.conflict
      text: "Discard all"
      enabled: root.app.pending > 0
      onClicked: root.app.discardAll()
    }

    Btn {
      visible: !root.conflict
      text: "Write to keyboard"
      primary: true
      enabled: root.app.sessionState === "dirty" && root.app.mounted
      onClicked: root.app.openReview()
    }
  }
}
