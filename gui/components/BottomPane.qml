import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

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

  spacing: Style.spacing.md
  onSessionStateChanged: confirming = false

  RowLayout {
    Layout.fillWidth: true
    Text {
      color: root.sessionState === "conflict" ? Color.urgent : root.sessionState === "dirty" ? Color.accent : Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      text: "session profile " + root.profile + ": " + root.sessionState
    }
    Text {
      Layout.fillWidth: true
      visible: root.message !== ""
      color: Color.urgent
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      wrapMode: Text.Wrap
      text: root.message
    }
  }

  Flickable {
    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumHeight: 80
    contentWidth: diffText.implicitWidth
    contentHeight: diffText.implicitHeight
    clip: true
    ScrollBar.vertical: ScrollBar {}
    Text {
      id: diffText
      color: Color.foreground
      font.family: "monospace"
      font.pixelSize: Style.font.bodySmall
      textFormat: Text.PlainText
      text: root.diffFiles.map(function(f) { return f.diff === "" ? f.rel + ": no change" : f.diff }).join("\n")
    }
  }

  Text {
    Layout.fillWidth: true
    visible: root.planText !== ""
    color: Color.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall
    wrapMode: Text.Wrap
    text: root.planText
  }

  RowLayout {
    Layout.fillWidth: true
    spacing: Style.spacing.controlGap
    Button {
      text: root.confirming ? "Confirm apply to profile " + root.profile : "Apply"
      bordered: true
      selected: root.confirming
      enabled: root.sessionState === "dirty" && root.mounted && root.plan !== null && !root.plan.error
      onClicked: { if (root.confirming) { root.confirming = false; root.applyRequested() } else root.confirming = true }
    }
    Button { text: "Discard"; bordered: true; enabled: root.sessionState === "dirty" || root.sessionState === "conflict"; onClicked: { root.confirming = false; root.discardRequested() } }
    Button { text: "Verify"; bordered: true; visible: root.awaitingVerify; enabled: root.mounted; onClicked: root.verifyRequested() }
    Item { Layout.fillWidth: true }
    Dropdown {
      label: "Restore"
      value: root.restoreChoice
      options: root.backups.map(function(b) { return { value: b, label: b } })
      onChanged: function(v) { root.restoreChoice = v }
    }
    Button {
      text: "Open restore session"
      bordered: true
      enabled: root.restoreChoice !== "" && root.status !== null && root.mounted
      onClicked: root.restoreRequested(root.status.stateDir + "/backups/" + root.restoreChoice)
    }
  }

  Text {
    Layout.fillWidth: true
    color: Color.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
    wrapMode: Text.Wrap
    text: "The keyboard does not update by itself: after Apply the v-Drive is ejected, press SmartSet + Hotkey 4 to reload, then SmartSet + Hotkey 3 twice to reopen it and Verify."
  }
}
