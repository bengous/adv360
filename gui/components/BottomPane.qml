import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

// Verify and Restore, until the cycle line and the Backups menu take them over.
ColumnLayout {
  id: root

  property var status: null
  property var backups: []
  property int profile: 1

  signal verifyRequested()
  signal restoreRequested(string dir)

  property string restoreChoice: ""

  readonly property bool mounted: status !== null && status.state === "mounted"
  readonly property bool awaitingVerify: status !== null && status.pending_write !== null && status.pending_write.phase.kind === "ejected"

  spacing: 10

  Item { Layout.fillHeight: true }

  RowLayout {
    Layout.fillWidth: true
    spacing: 8

    Btn { text: "Verify"; visible: root.awaitingVerify; enabled: root.mounted; onClicked: root.verifyRequested() }

    Item { Layout.fillWidth: true }

    Repeater {
      model: root.backups.slice(0, 3)

      Btn {
        required property var modelData
        small: true
        text: modelData
        active: root.restoreChoice === modelData
        onClicked: root.restoreChoice = modelData
      }
    }

    Btn {
      text: "Open restore session"
      enabled: root.restoreChoice !== "" && root.status !== null && root.mounted
      onClicked: root.restoreRequested(root.status.stateDir + "/backups/" + root.restoreChoice)
    }
  }

  Text {
    Layout.fillWidth: true
    color: Theme.dim
    font.family: Theme.font
    font.pixelSize: 11
    wrapMode: Text.Wrap
    text: "The keyboard does not update by itself: after a write the v-Drive is ejected, press SmartSet + Hotkey 4 to reload, then SmartSet + Hotkey 3 twice to reopen it and Verify."
  }
}
