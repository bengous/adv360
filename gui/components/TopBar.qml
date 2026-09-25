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
  property var cycle: ({ kind: "open" })

  signal profileSelected(int n)
  signal layerSelected(string name)
  signal tabSelected(string name)
  signal backupRequested()
  signal ejectRequested()

  readonly property string vdriveState: status !== null ? String(status.state) : "unknown"
  // Open, Edit, Write, Reload, Verify: done, now, waiting on a chord, or failed.
  readonly property var steps: {
    var names = ["Open", "Edit", "Write", "Reload", "Verify"]
    var kind = cycle.kind
    var at = kind === "broken" ? 2 : ["open", "edit", "write", "reload", "verify"].indexOf(kind)
    return names.map(function(name, i) {
      var state = i < at ? "done" : i > at ? "todo" : kind === "broken" ? "bad" : kind === "open" || kind === "reload" ? "wait" : "now"
      return { name: name, state: state }
    })
  }
  readonly property var layers: [
    { value: "base", label: "Base" }, { value: "keypad", label: "Kp" },
    { value: "function1", label: "Fn1" }, { value: "function2", label: "Fn2" }, { value: "function3", label: "Fn3" }
  ]

  spacing: 8
  clip: true

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

  Row {
    id: cycleLine
    spacing: 0

    Repeater {
      model: root.steps

      Row {
        id: step

        required property var modelData
        required property int index
        readonly property color dot: modelData.state === "done" ? Theme.focus
          : modelData.state === "now" ? Theme.pending
          : modelData.state === "wait" ? Theme.macro
          : modelData.state === "bad" ? Theme.bad
          : "transparent"

        spacing: 6

        Rectangle {
          visible: step.index > 0
          anchors.verticalCenter: parent.verticalCenter
          width: 32
          height: 1
          color: Theme.muted

          Rectangle { width: 8; height: 1; color: Theme.surface }
          Rectangle { x: parent.width - 8; width: 8; height: 1; color: Theme.surface }
        }

        Rectangle {
          anchors.verticalCenter: parent.verticalCenter
          width: 9
          height: 9
          radius: 4.5
          color: step.dot
          border.width: 1.5
          border.color: step.modelData.state === "todo" ? Theme.muted : step.dot
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: step.modelData.name
          color: step.modelData.state === "todo" ? Theme.dim : step.modelData.state === "bad" ? Theme.bad : Theme.text
          font.family: Theme.font
          font.pixelSize: 12
        }
      }
    }
  }

  Btn { text: "Backup"; enabled: root.vdriveState === "mounted"; onClicked: root.backupRequested() }
  Btn { text: "Eject"; enabled: root.vdriveState === "mounted"; onClicked: root.ejectRequested() }
}
