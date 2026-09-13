import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// Layout tab: the selected key and the SmartSet categories. One click = one session edit.
Flickable {
  id: root

  property var tokens: null
  property var viewData: null
  property string selected: ""
  property int profile: 1
  property string layerName: "base"

  signal action(var args)

  readonly property var key: {
    if (!viewData || !viewData.keys || selected === "") return null
    for (var i = 0; i < viewData.keys.length; i++) if (viewData.keys[i].position === selected) return viewData.keys[i]
    return null
  }
  readonly property var categories: tokens ? tokens.categories : []
  readonly property var cotriggers: ["", "lctr", "lshf", "lalt", "lwin", "rctr", "rshf", "ralt", "rwin"]
  readonly property var digits: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
  property string expanded: ""

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
  ScrollBar.vertical: ScrollBar {}

  ColumnLayout {
    id: column
    width: root.width
    spacing: Style.spacing.md

    Text {
      Layout.fillWidth: true
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.title
      text: root.selected === "" ? "Click a key" : "[" + root.selected + "]"
    }

    Text {
      Layout.fillWidth: true
      visible: root.key !== null
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
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
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.Wrap
          text: "macro " + (modelData.cotrigger ? "{" + modelData.cotrigger + "}" : "") + "{" + root.selected + "} > " + modelData.tokens.map(function(t) { return "{" + t + "}" }).join("")
        }
        Button {
          text: "✕"
          tooltipText: "Remove this macro"
          onClicked: {
            var args = ["session", "remove"].concat(root.base(), ["--trigger", root.selected])
            if (modelData.cotrigger) args = args.concat(["--cotrigger", modelData.cotrigger])
            root.action(args)
          }
        }
      }
    }

    RowLayout {
      Layout.fillWidth: true
      Button { text: "Reset key"; bordered: true; enabled: root.key !== null && root.key.kind !== "default"; onClicked: root.action(["session", "remove"].concat(root.base(), ["--pos", root.selected])) }
      Button { text: "Reset layer"; bordered: true; onClicked: root.resetLayer() }
    }

    Repeater {
      model: root.categories
      ColumnLayout {
        id: category
        required property var modelData
        readonly property var entries: Object.keys(modelData.tokens).map(function(t) { return { token: t, label: modelData.tokens[t] } })
        Layout.fillWidth: true
        spacing: Style.spacing.xs

        Button {
          Layout.fillWidth: true
          leftAlign: true
          text: (root.expanded === category.modelData.name ? "▾ " : "▸ ") + category.modelData.name
          enabled: root.selected !== ""
          onClicked: root.expanded = root.expanded === category.modelData.name ? "" : category.modelData.name
        }

        Flow {
          Layout.fillWidth: true
          visible: root.expanded === category.modelData.name
          spacing: Style.spacing.xs
          Repeater {
            model: category.entries
            Button {
              required property var modelData
              text: modelData.label
              tooltipText: modelData.token
              fontSize: Style.font.bodySmall
              horizontalPadding: Style.spacing.sm
              verticalPadding: Style.spacing.xxs
              bordered: true
              onClicked: root.setRemap(modelData.token)
            }
          }
        }
      }
    }

    Text { color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.subtitle; text: "Tap and Hold" }
    RowLayout {
      Layout.fillWidth: true
      TextField { id: tapField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholderText: "tap token" }
      TextField { id: msField; Layout.preferredWidth: 60; text: "250"; validator: IntValidator { bottom: 1; top: 999 } }
      TextField { id: holdField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholderText: "hold token" }
      Button {
        text: "Set"
        bordered: true
        enabled: root.selected !== "" && tapField.text !== "" && holdField.text !== "" && msField.acceptableInput
        onClicked: root.action(["session", "set-taphold"].concat(root.base(), ["--pos", root.selected, "--tap", tapField.text, "--ms", msField.text, "--hold", holdField.text]))
      }
    }

    Text { color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.subtitle; text: "Macro" }
    RowLayout {
      Layout.fillWidth: true
      Dropdown { id: cotriggerBox; Layout.fillWidth: true; Layout.preferredWidth: 1; label: "Co-trigger"; value: ""; options: root.cotriggers.map(function(c) { return { value: c, label: c === "" ? "none" : c } }); onChanged: function(v) { value = v } }
      Dropdown { id: speedBox; Layout.fillWidth: true; Layout.preferredWidth: 1; label: "Speed"; value: ""; options: root.digits.map(function(d) { return { value: d, label: d === "" ? "default" : d } }); onChanged: function(v) { value = v } }
      Dropdown { id: multiplayBox; Layout.fillWidth: true; Layout.preferredWidth: 1; label: "Multiplay"; value: ""; options: root.digits.map(function(d) { return { value: d, label: d === "" ? "once" : d } }); onChanged: function(v) { value = v } }
    }
    RowLayout {
      Layout.fillWidth: true
      TextField { id: macroField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholderText: "{-lshf}{h}{+lshf}{i}" }
      Text { color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption; text: (macroField.text.match(/\{[^{}]+\}/g) || []).length + "/300" }
      Button {
        text: "Set"
        bordered: true
        enabled: root.selected !== "" && macroField.text.trim() !== ""
        onClicked: {
          var prefix = (speedBox.value !== "" ? "{s" + speedBox.value + "}" : "") + (multiplayBox.value !== "" ? "{x" + multiplayBox.value + "}" : "")
          var args = ["session", "set-macro"].concat(root.base(), ["--trigger", root.selected, "--tokens", prefix + macroField.text.trim()])
          if (cotriggerBox.value !== "") args = args.concat(["--cotrigger", cotriggerBox.value])
          root.action(args)
        }
      }
    }

    Text { color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.subtitle; text: "Any token" }
    RowLayout {
      Layout.fillWidth: true
      TextField { id: tokenField; Layout.fillWidth: true; Layout.preferredWidth: 1; placeholderText: "token as in the Kinesis list, e.g. caxx" }
      Button { text: "Set"; bordered: true; enabled: root.selected !== "" && tokenField.text.trim() !== ""; onClicked: root.setRemap(tokenField.text.trim()) }
    }
  }
}
