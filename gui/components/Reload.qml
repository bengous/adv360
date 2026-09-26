pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../cycle.mjs" as Cycle

// After a write: the chords only the human can press, then the automatic check (H2).
RowLayout {
  id: root

  required property var app

  readonly property string kind: app.cycle.kind
  readonly property var verdict: app.verifyResult
  readonly property var record: app.status !== null ? app.status.pending_write : null
  // The profile of the write, which need not be the one the window shows.
  readonly property int written: record !== null ? record.profile : app.last !== null && app.last.report !== null && app.last.report.profile ? app.last.report.profile : app.profile
  readonly property bool stuck: kind === "write" && record !== null && record.phase.kind === "written"
  readonly property string backupDir: {
    if (record !== null) return record.backup_dir
    return app.last !== null && app.last.report !== null && app.last.report.backup_dir ? app.last.report.backup_dir : ""
  }
  readonly property string title: {
    if (kind === "broken") return "The last write to profile " + written + " failed. Restore the backup before using the keyboard."
    if (stuck) return "Written to profile " + written + ", but the v-Drive did not eject: close what uses it, then retry."
    if (kind === "write") return "Writing profile " + written + "…"
    if (kind === "reload") return "Written to profile " + written + ". Two steps left on the keyboard:"
    if (verdict === null) return kind === "verify" ? "The v-Drive is back: checking the files…" : "Written to profile " + written + "."
    if (verdict.code !== 0) return "Verify failed: " + (verdict.report && verdict.report.message ? verdict.report.message : "adv360 verify exited " + verdict.code)
    switch (verdict.report.result) {
    case "verified": return "Profile " + verdict.report.profile + " verified: the keyboard reads what adv360 wrote."
    case "unchanged": return "The keyboard still has its old files. Your changes stay in the session: write them again."
    default: return "The files differ from what adv360 wrote. Restore the backup before using the keyboard."
    }
  }
  readonly property color tone: kind === "broken" || (verdict !== null && (verdict.code !== 0 || verdict.report.result === "mismatch")) ? Theme.bad
    : verdict !== null && verdict.report.result === "verified" ? Theme.pending
    : Theme.text

  spacing: 28

  ColumnLayout {
    Layout.fillWidth: true
    Layout.alignment: Qt.AlignVCenter
    spacing: 10

    Text {
      Layout.fillWidth: true
      text: root.title
      color: root.tone
      font.family: Theme.font
      font.pixelSize: 16
      font.weight: Font.Bold
      wrapMode: Text.Wrap
    }

    RowLayout {
      visible: root.kind === "reload"
      spacing: 8

      Text {
        text: "1. Reload:"
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: 15
      }

      Keycap { label: "SmartSet"; glow: true }

      Text {
        text: "+"
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: 15
      }

      Keycap { label: "Hotkey 4"; glow: true }
    }

    RowLayout {
      visible: root.kind === "reload"
      Layout.fillWidth: true
      spacing: 8

      Text {
        text: "2. Reopen the v-Drive:"
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: 15
      }

      Keycap { label: "SmartSet" }

      Text {
        text: "+"
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: 15
      }

      Keycap { label: "Hotkey 3" }

      Text {
        Layout.fillWidth: true
        text: "twice. adv360 checks the files and clears the changes."
        color: Theme.text
        font.family: Theme.font
        font.pixelSize: 15
        wrapMode: Text.Wrap
      }
    }
  }

  ColumnLayout {
    Layout.alignment: Qt.AlignVCenter
    spacing: 10

    Rectangle {
      visible: root.kind === "reload" || (root.kind === "verify" && root.verdict === null)
      Layout.alignment: Qt.AlignRight
      implicitWidth: pillRow.implicitWidth + 24
      implicitHeight: 30
      radius: 15
      color: "transparent"
      border.width: 1
      border.color: Theme.macro

      Row {
        id: pillRow
        anchors.centerIn: parent
        spacing: 7

        Rectangle {
          anchors.verticalCenter: parent.verticalCenter
          width: 8
          height: 8
          radius: 4
          color: Theme.macro
        }

        Text {
          text: root.kind === "reload" ? "Waiting for the v-Drive" : "Checking the files"
          color: Theme.macro
          font.family: Theme.font
          font.pixelSize: 12
        }
      }
    }

    RowLayout {
      visible: root.backupDir !== ""
      Layout.alignment: Qt.AlignRight
      spacing: 8

      Text {
        text: "Backup: " + Cycle.backupLabel(root.backupDir.split("/").pop(), new Date())
        color: Theme.dim
        font.family: Theme.font
        font.pixelSize: 12
      }

      Btn {
        small: true
        text: "Restore"
        enabled: root.app.mounted
        onClicked: root.app.restore(root.backupDir, root.written)
      }
    }

    Btn {
      visible: root.stuck
      Layout.alignment: Qt.AlignRight
      text: "Retry eject"
      primary: true
      enabled: !root.app.busy
      onClicked: root.app.retryEject()
    }

    Btn {
      visible: root.kind === "verify" && root.verdict !== null && root.verdict.code !== 0
      Layout.alignment: Qt.AlignRight
      text: "Verify again"
      enabled: !root.app.busy
      onClicked: root.app.verifyAgain()
    }

    Btn {
      Layout.alignment: Qt.AlignRight
      text: "Close"
      onClicked: root.app.closeDrawer()
    }
  }
}
