import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

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
  readonly property color pillColor: state === "mounted" || state === "busy-writing" ? Color.accent
    : state === "corrupt-suspected" ? Color.urgent
    : state === "ejected" ? Color.foreground
    : Color.muted
  readonly property var layers: [
    { value: "base", label: "Base" }, { value: "keypad", label: "Kp" },
    { value: "function1", label: "Fn1" }, { value: "function2", label: "Fn2" }, { value: "function3", label: "Fn3" }
  ]

  spacing: Style.spacing.controlGap

  Text {
    text: "Profile"
    color: Color.foreground
    font.family: Style.font.family
    font.pixelSize: Style.font.body
  }

  Repeater {
    model: 9
    Button {
      required property int index
      readonly property int n: index + 1
      readonly property bool active: root.status !== null && root.status.active_profile === n
      text: String(n) + (active ? " ★" : "")
      selected: root.profile === n
      bordered: true
      tooltipText: active ? "Active on the keyboard" : "SmartSet + " + n + " switches the keyboard to this profile"
      onClicked: root.profileSelected(n)
    }
  }

  Item { Layout.preferredWidth: Style.spacing.xl }

  Button { text: "Layout"; selected: root.tab === "layout"; bordered: true; onClicked: root.tabSelected("layout") }
  Button { text: "Lighting"; selected: root.tab === "lighting"; bordered: true; onClicked: root.tabSelected("lighting") }

  Item { Layout.preferredWidth: Style.spacing.xl }

  Repeater {
    model: root.layers
    Button {
      required property var modelData
      text: modelData.label
      selected: root.layerName === modelData.value
      bordered: true
      onClicked: root.layerSelected(modelData.value)
    }
  }

  Item { Layout.fillWidth: true }

  Rectangle {
    radius: Style.cornerRadius
    color: Util.alpha(root.pillColor, 0.18)
    border.color: root.pillColor
    border.width: 1
    implicitHeight: Style.spacing.controlHeight
    implicitWidth: pillText.implicitWidth + Style.spacing.controlPaddingX * 2
    Text {
      id: pillText
      anchors.centerIn: parent
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      text: "v-Drive " + root.vdriveState
    }
  }

  Button { text: "Backup"; bordered: true; enabled: root.vdriveState === "mounted"; onClicked: root.backupRequested() }
  Button { text: "Eject"; bordered: true; enabled: root.vdriveState === "mounted"; onClicked: root.ejectRequested() }
}
