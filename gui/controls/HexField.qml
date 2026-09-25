import QtQuick
import "../theme"

// A #rrggbb field; accepted() carries the normalised lower-case value.
Rectangle {
  id: root

  property string hex: "#000000"

  signal accepted(string hex)

  implicitWidth: 92
  implicitHeight: 26
  radius: 6
  color: Theme.surface
  border.width: 1
  border.color: input.activeFocus ? Theme.focus : Theme.muted

  onHexChanged: if (!input.activeFocus) input.text = hex

  TextInput {
    id: input
    anchors.fill: parent
    anchors.leftMargin: 8
    anchors.rightMargin: 8
    verticalAlignment: TextInput.AlignVCenter
    text: root.hex
    color: acceptableInput ? Theme.text : Theme.bad
    font.family: Theme.font
    font.pixelSize: 12
    selectByMouse: true
    validator: RegularExpressionValidator { regularExpression: /#?[0-9a-fA-F]{6}/ }
    onAccepted: {
      var value = (text.charAt(0) === "#" ? text : "#" + text).toLowerCase()
      root.accepted(value)
      focus = false
    }
  }
}
