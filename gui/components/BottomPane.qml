import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

// Diff, the plan sentence, Apply / Discard / Verify / Restore, and the SmartSet footer.
ColumnLayout {
  id: root

  property var session: null
  property var status: null
  property var diffFiles: []
  property var plan: null
  property string message: ""
  property var backups: []
  property int profile: 1

  signal applyRequested()
  signal discardRequested()
  signal verifyRequested()
  signal restoreRequested(string dir)

  property bool confirming: false
  property string restoreChoice: ""

  readonly property string sessionState: session !== null ? String(session.state) : "clean"
  readonly property bool mounted: status !== null && status.state === "mounted"
  readonly property bool awaitingVerify: status !== null && status.pending_write !== null && status.pending_write.phase.kind === "ejected"
  readonly property string planText: {
    if (plan === null) return ""
    if (plan.error) return "cannot apply: " + plan.message
    var files = plan.files.map(function(f) { return f.rel + " (" + f.bytes + " bytes)" }).join(", ")
    return "will write " + files + ", backup at " + plan.backup_dir + (plan.eject ? ", then eject " + plan.eject : ", no eject (--source)")
  }

  spacing: 10
  onSessionStateChanged: confirming = false

  RowLayout {
    Layout.fillWidth: true

    Text {
      color: root.sessionState === "conflict" ? Theme.bad : root.sessionState === "dirty" ? Theme.pending : Theme.dim
      font.family: Theme.font
      font.pixelSize: Theme.body
      text: "session profile " + root.profile + ": " + root.sessionState
    }

    Text {
      Layout.fillWidth: true
      visible: root.message !== ""
      color: Theme.bad
      font.family: Theme.font
      font.pixelSize: Theme.body
      wrapMode: Text.Wrap
      text: root.message
    }
  }

  Flickable {
    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumHeight: 60
    contentWidth: diffText.implicitWidth
    contentHeight: diffText.implicitHeight
    clip: true

    Text {
      id: diffText
      color: Theme.text
      font.family: Theme.font
      font.pixelSize: 12
      textFormat: Text.PlainText
      text: root.diffFiles.map(function(f) { return f.diff === "" ? f.rel + ": no change" : f.diff }).join("\n")
    }
  }

  Text {
    Layout.fillWidth: true
    visible: root.planText !== ""
    color: Theme.dim
    font.family: Theme.font
    font.pixelSize: 12
    wrapMode: Text.Wrap
    text: root.planText
  }

  RowLayout {
    Layout.fillWidth: true
    spacing: 8

    Btn {
      text: root.confirming ? "Confirm apply to profile " + root.profile : "Apply"
      primary: root.confirming
      enabled: root.sessionState === "dirty" && root.mounted && root.plan !== null && !root.plan.error
      onClicked: { if (root.confirming) { root.confirming = false; root.applyRequested() } else root.confirming = true }
    }

    Btn { text: "Discard"; enabled: root.sessionState === "dirty" || root.sessionState === "conflict"; onClicked: { root.confirming = false; root.discardRequested() } }
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
    text: "The keyboard does not update by itself: after Apply the v-Drive is ejected, press SmartSet + Hotkey 4 to reload, then SmartSet + Hotkey 3 twice to reopen it and Verify."
  }
}
