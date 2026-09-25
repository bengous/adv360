import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

RowLayout {
  id: root

  property var status: null
  property int profile: 1
  property string layerName: "base"
  property string tab: "layout"

  signal profileSelected(int n)
  signal layerSelected(string name)
  signal tabSelected(string name)
  signal backupRequested()
  signal ejectRequested()

  readonly property string vdriveState: status !== null ? String(status.state) : "unknown"
  readonly property color pillColor: vdriveState === "mounted" || vdriveState === "busy-writing" ? Theme.pending
    : vdriveState === "corrupt-suspected" ? Theme.bad
    : vdriveState === "ejected" ? Theme.text
    : Theme.muted
  readonly property var layers: [
    { value: "base", label: "Base" }, { value: "keypad", label: "Kp" },
    { value: "function1", label: "Fn1" }, { value: "function2", label: "Fn2" }, { value: "function3", label: "Fn3" }
  ]

  spacing: 8

  Text {
    text: "Profile"
    color: Theme.text
    font.family: Theme.font
    font.pixelSize: Theme.body
  }

  Repeater {
    model: 9

    Btn {
      required property int index
      readonly property int n: index + 1
      readonly property bool isActive: root.status !== null && root.status.active_profile === n
      text: String(n) + (isActive ? " ★" : "")
      active: root.profile === n
      onClicked: root.profileSelected(n)
    }
  }

  Item { Layout.preferredWidth: 16 }

  Segmented {
    options: [{ value: "layout", label: "Layout" }, { value: "lighting", label: "Lighting" }]
    value: root.tab
    onPicked: function(v) { root.tabSelected(v) }
  }

  Item { Layout.preferredWidth: 16 }

  Segmented {
    options: root.layers
    value: root.layerName
    onPicked: function(v) { root.layerSelected(v) }
  }

  Item { Layout.fillWidth: true }

  Rectangle {
    radius: 15
    color: Theme.alpha(root.pillColor, 0.12)
    border.color: root.pillColor
    border.width: 1
    implicitHeight: 30
    implicitWidth: pillText.implicitWidth + 24

    Text {
      id: pillText
      anchors.centerIn: parent
      color: Theme.text
      font.family: Theme.font
      font.pixelSize: 12
      text: "v-Drive " + root.vdriveState
    }
  }

  Btn { text: "Backup"; enabled: root.vdriveState === "mounted"; onClicked: root.backupRequested() }
  Btn { text: "Eject"; enabled: root.vdriveState === "mounted"; onClicked: root.ejectRequested() }
}
