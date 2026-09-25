import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

// Layout tab: the selected key and the SmartSet categories. One click = one session edit.
Flickable {
  id: root

  property var tokens: null
  property var viewData: null
  property string selected: ""
  property int profile: 1
  property string layerName: "base"

  signal action(var args)

  component Field: Rectangle {
    property alias text: input.text
    property alias validator: input.validator
    property alias acceptableInput: input.acceptableInput
    property string placeholder: ""
    implicitHeight: 28
    radius: 6
    color: Theme.surface
    border.width: 1
    border.color: input.activeFocus ? Theme.focus : Theme.muted

    TextInput {
      id: input
      anchors.fill: parent
      anchors.leftMargin: 8
      anchors.rightMargin: 8
      verticalAlignment: TextInput.AlignVCenter
      color: Theme.text
      font.family: Theme.font
      font.pixelSize: 12
      selectByMouse: true
      clip: true
    }

    Text {
      visible: input.text === ""
      anchors.fill: input
      verticalAlignment: Text.AlignVCenter
      text: parent.placeholder
      color: Theme.muted
      font.family: Theme.font
      font.pixelSize: 12
    }
  }

  component Heading: Text {
    color: Theme.text
    font.family: Theme.font
    font.pixelSize: 14
  }

  readonly property var key: {
    if (!viewData || !viewData.keys || selected === "") return null
    for (var i = 0; i < viewData.keys.length; i++) if (viewData.keys[i].position === selected) return viewData.keys[i]
    return null
  }
  readonly property var categories: tokens ? tokens.categories : []
  readonly property var cotriggers: ["", "lctr", "lshf", "lalt", "lwin"]
  readonly property var digits: ["", "1", "3", "5", "7", "9"]
  property string expanded: ""
  property string cotrigger: ""
  property string speed: ""
  property string multiplay: ""

  function base() { return ["--profile", String(profile), "--layer", layerName] }
  function setRemap(token) { if (selected !== "") action(["session", "set-remap"].concat(base(), ["--pos", selected, "--action", token])) }

  function resetLayer() {
    if (!viewData || !viewData.keys) return
    for (var i = 0; i < viewData.keys.length; i++) {
      var k = viewData.keys[i]
      if (k.kind === "remap" || k.kind === "taphold") action(["session", "remove"].concat(base(), ["--pos", k.position]))
      for (var m = 0; m < k.macros.length; m++) {
        var args = ["session", "remove"].concat(base(), ["--trigger", k.position])
        if (k.macros[m].cotrigger) args = args.concat(["--cotrigger", k.macros[m].cotrigger])
        action(args)
      }
    }
  }

  contentWidth: width
  contentHeight: column.implicitHeight
  clip: true

  ColumnLayout {
    id: column
    width: root.width
    spacing: 10

    Text {
      Layout.fillWidth: true
      color: Theme.text
      font.family: Theme.font
      font.pixelSize: Theme.title
      text: root.selected === "" ? "Click a key" : "[" + root.selected + "]"
    }

    Text {
      Layout.fillWidth: true
      visible: root.key !== null
      color: Theme.dim
      font.family: Theme.font
      font.pixelSize: 12
      wrapMode: Text.Wrap
      text: root.key === null ? "" :
        (root.key.kind === "default" ? "default: " + (root.key.label || "(none)")
          : root.key.kind === "remap" ? "remap → " + root.key.action + " (" + root.key.label + "), line " + root.key.line
          : "tap " + root.key.tap + " / hold " + root.key.hold + " after " + root.key.ms + " ms, line " + root.key.line)
        + (root.key.pending ? "  · pending" : "")
    }

    Repeater {
      model: root.key !== null ? root.key.macros : []

      RowLayout {
        required property var modelData
        Layout.fillWidth: true

        Text {
          Layout.fillWidth: true
          color: Theme.text
          font.family: Theme.font
          font.pixelSize: 12
          wrapMode: Text.Wrap
          text: "macro " + (parent.modelData.cotrigger ? "{" + parent.modelData.cotrigger + "}" : "") + "{" + root.selected + "} > " + parent.modelData.tokens.map(function(t) { return "{" + t + "}" }).join("")
        }

        Btn {
          text: "×"
          small: true
          onClicked: {
            var args = ["session", "remove"].concat(root.base(), ["--trigger", root.selected])
            if (parent.modelData.cotrigger) args = args.concat(["--cotrigger", parent.modelData.cotrigger])
            root.action(args)
          }
        }
      }
    }

    RowLayout {
      Layout.fillWidth: true
      Btn { text: "Reset key"; enabled: root.key !== null && root.key.kind !== "default"; onClicked: root.action(["session", "remove"].concat(root.base(), ["--pos", root.selected])) }
      Btn { text: "Reset layer"; onClicked: root.resetLayer() }
    }

    Repeater {
      model: root.categories

      ColumnLayout {
        id: category

        required property var modelData
        readonly property var entries: Object.keys(modelData.tokens).map(function(t) { return { token: t, label: modelData.tokens[t] } })

        Layout.fillWidth: true
        spacing: 4

        Btn {
          Layout.fillWidth: true
          text: (root.expanded === category.modelData.name ? "▾ " : "▸ ") + category.modelData.name
          enabled: root.selected !== ""
          onClicked: root.expanded = root.expanded === category.modelData.name ? "" : category.modelData.name
        }

        Flow {
          Layout.fillWidth: true
          visible: root.expanded === category.modelData.name
          spacing: 4

          Repeater {
            model: category.entries

            Keycap {
              required property var modelData
              label: modelData.label
              interactive: true
              onClicked: root.setRemap(modelData.token)
            }
          }
        }
      }
    }

    Heading { text: "Tap and Hold" }

    RowLayout {
      Layout.fillWidth: true
      Field { id: tapField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholder: "tap token" }
      Field { id: msField; Layout.preferredWidth: 60; text: "250"; validator: IntValidator { bottom: 1; top: 999 } }
      Field { id: holdField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholder: "hold token" }
      Btn {
        text: "Set"
        enabled: root.selected !== "" && tapField.text !== "" && holdField.text !== "" && msField.acceptableInput
        onClicked: root.action(["session", "set-taphold"].concat(root.base(), ["--pos", root.selected, "--tap", tapField.text, "--ms", msField.text, "--hold", holdField.text]))
      }
    }

    Heading { text: "Macro" }

    Segmented {
      options: root.cotriggers.map(function(c) { return { value: c, label: c === "" ? "none" : c } })
      value: root.cotrigger
      onPicked: function(v) { root.cotrigger = v }
    }

    RowLayout {
      Segmented {
        options: root.digits.map(function(d) { return { value: d, label: d === "" ? "speed" : "s" + d } })
        value: root.speed
        onPicked: function(v) { root.speed = v }
      }

      Segmented {
        options: root.digits.map(function(d) { return { value: d, label: d === "" ? "once" : "x" + d } })
        value: root.multiplay
        onPicked: function(v) { root.multiplay = v }
      }
    }

    RowLayout {
      Layout.fillWidth: true
      Field { id: macroField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholder: "{-lshf}{h}{+lshf}{i}" }
      Text { color: Theme.dim; font.family: Theme.font; font.pixelSize: 11; text: (macroField.text.match(/\{[^{}]+\}/g) || []).length + "/300" }
      Btn {
        text: "Set"
        enabled: root.selected !== "" && macroField.text.trim() !== ""
        onClicked: {
          var prefix = (root.speed !== "" ? "{s" + root.speed + "}" : "") + (root.multiplay !== "" ? "{x" + root.multiplay + "}" : "")
          var args = ["session", "set-macro"].concat(root.base(), ["--trigger", root.selected, "--tokens", prefix + macroField.text.trim()])
          if (root.cotrigger !== "") args = args.concat(["--cotrigger", root.cotrigger])
          root.action(args)
        }
      }
    }

    Heading { text: "Any token" }

    RowLayout {
      Layout.fillWidth: true
      Field { id: tokenField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholder: "token as in the Kinesis list, e.g. caxx" }
      Btn { text: "Set"; enabled: root.selected !== "" && tokenField.text.trim() !== ""; onClicked: root.setRemap(tokenField.text.trim()) }
    }
  }
}
