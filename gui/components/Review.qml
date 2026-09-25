pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../review.mjs" as ReviewLogic

// Before writing: each change with what it replaces, what Write does in order, the text diff.
// In a conflict the same drawer shows what a discard throws away.
ColumnLayout {
  id: root

  required property var app
  property bool showDiff: app.sessionState === "conflict"

  readonly property bool conflict: app.sessionState === "conflict"
  readonly property var plan: app.plan !== null && app.plan.event === "plan" ? app.plan : null
  readonly property var diffLines: {
    var out = []
    for (var i = 0; i < app.diffFiles.length; i++) out = out.concat(String(app.diffFiles[i].diff).replace(/\r/g, "").split("\n").filter(function(l) { return l !== "" }))
    return out
  }

  function beforeOf(edit) {
    return root.app.disk === null ? null : ReviewLogic.beforeOf(edit, root.app.disk, root.app.keyboard.defaults)
  }

  function shortPath(path) {
    var home = root.app.home
    return home !== "" && path.indexOf(home + "/") === 0 ? "~" + path.slice(home.length) : path
  }

  component Label: Text {
    color: Theme.dim
    font.family: Theme.font
    font.pixelSize: 12
  }

  spacing: 10

  RowLayout {
    Layout.fillWidth: true
    spacing: 10

    Text {
      text: root.conflict ? "The files on the keyboard changed since your first edit" : "Review before writing to profile " + root.app.profile
      color: root.conflict ? Theme.bad : Theme.text
      font.family: Theme.font
      font.pixelSize: Theme.title
      font.weight: Font.Bold
    }

    Item { Layout.fillWidth: true }

    Btn {
      text: "Back to editing"
      onClicked: root.app.closeDrawer()
    }

    Btn {
      visible: root.conflict
      text: "Discard"
      onClicked: root.app.discardAll()
    }

    Btn {
      visible: !root.conflict
      text: root.plan !== null && root.plan.eject ? "Write and eject" : "Write"
      primary: true
      enabled: root.plan !== null && root.app.sessionState === "dirty" && !root.app.busy
      onClicked: root.app.write()
    }
  }

  RowLayout {
    Layout.fillWidth: true
    Layout.fillHeight: true
    spacing: 28

    Flickable {
      Layout.fillWidth: true
      Layout.fillHeight: true
      Layout.preferredWidth: 6
      contentHeight: changeList.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      Column {
        id: changeList
        width: parent.width
        spacing: 8

        Label {
          text: root.conflict ? "Discard drops these changes; the keyboard keeps its files:" : "Not written to profile " + root.app.profile
        }

        Repeater {
          model: root.app.changes

          Column {
            id: change

            required property var modelData
            readonly property var after: root.app.afterOf(modelData.show)
            readonly property var before: root.beforeOf(modelData.show)

            width: changeList.width
            spacing: 4

            Row {
              spacing: 8

              Text {
                width: 150
                anchors.verticalCenter: parent.verticalCenter
                text: root.app.changeName(change.modelData.show)
                color: change.after.kind === "bad" ? Theme.bad : Theme.text
                font.family: Theme.font
                font.pixelSize: 12
                elide: Text.ElideRight
              }

              Keycap {
                label: change.before === null ? "…" : root.app.beforeLabel(change.before)
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "→"
                color: Theme.dim
                font.family: Theme.font
                font.pixelSize: 12
              }

              Keycap {
                label: change.after.label
                kind: change.after.kind
              }
            }

            Text {
              visible: change.after.kind === "bad"
              width: parent.width
              text: "The keyboard ignores unknown actions: " + root.app.changeName(change.modelData.show) + " would keep " + (change.before === null ? "its action" : root.app.beforeLabel(change.before)) + "."
              color: Theme.bad
              font.family: Theme.font
              font.pixelSize: 11
              wrapMode: Text.Wrap
            }
          }
        }
      }
    }

    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      Layout.preferredWidth: 5
      spacing: 6

      Label {
        visible: !root.conflict
        text: "What Write does, in order"
      }

      Repeater {
        model: root.conflict || root.plan === null ? [] : [
          "Back up layouts, lighting and settings to " + root.shortPath(root.plan.backup_dir)
        ].concat(root.plan.files.map(function(f) { return "Write " + f.rel + " (" + f.bytes + " bytes)" }), [
          "Read " + (root.plan.files.length > 1 ? "them" : "it") + " back and compare",
          root.plan.eject ? "Eject the v-Drive (" + root.plan.eject + ")" : "No eject: the files are a copy (--source)"
        ])

        Text {
          required property var modelData
          required property int index
          Layout.fillWidth: true
          text: (index + 1) + ". " + modelData
          color: Theme.text
          font.family: Theme.font
          font.pixelSize: 12
          wrapMode: Text.Wrap
        }
      }

      Text {
        visible: !root.conflict && root.app.plan !== null && root.plan === null
        Layout.fillWidth: true
        text: root.app.plan !== null && root.app.plan.message ? "Cannot write: " + root.app.plan.message : ""
        color: Theme.bad
        font.family: Theme.font
        font.pixelSize: 12
        wrapMode: Text.Wrap
      }

      Text {
        text: (root.showDiff ? "▾ " : "▸ ") + "Text diff"
        color: diffArea.containsMouse ? Theme.text : Theme.dim
        font.family: Theme.font
        font.pixelSize: 12

        MouseArea {
          id: diffArea
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.showDiff = !root.showDiff
        }
      }

      Rectangle {
        visible: root.showDiff
        Layout.fillWidth: true
        Layout.fillHeight: true
        radius: 6
        color: Theme.ground
        border.width: 1
        border.color: Theme.line
        clip: true

        Flickable {
          anchors.fill: parent
          anchors.margins: 8
          contentHeight: diffColumn.implicitHeight
          contentWidth: diffColumn.implicitWidth
          boundsBehavior: Flickable.StopAtBounds

          Column {
            id: diffColumn

            Repeater {
              model: root.diffLines

              Text {
                required property string modelData
                text: modelData
                color: modelData.charAt(0) === "+" && modelData.indexOf("+++") !== 0 ? Theme.pending
                  : modelData.charAt(0) === "-" && modelData.indexOf("---") !== 0 ? Theme.bad
                  : Theme.dim
                font.family: Theme.font
                font.pixelSize: 11
                textFormat: Text.PlainText
              }
            }
          }
        }
      }

      Item {
        visible: !root.showDiff
        Layout.fillHeight: true
      }
    }
  }
}
