pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../cycle.mjs" as Cycle
import "../led.mjs" as Led

// What is edited (profile, layer), which view (keys, lights), the backups, and where the
// write cycle stands.
Rectangle {
  id: root

  required property var app

  readonly property int active: app.status !== null && app.status.active_profile !== null ? app.status.active_profile : 0
  // The layer LED of the profile gives each layer its dot, as on the keyboard.
  readonly property var layerLed: {
    var leds = app.viewData && app.viewData.leds ? app.viewData.leds : {}
    var names = Object.keys(leds)
    for (var i = 0; i < names.length; i++) if (leds[names[i]].function === "layer") return leds[names[i]]
    return null
  }
  readonly property var steps: {
    var kind = app.cycle.kind
    var at = kind === "broken" ? 2 : ["open", "edit", "write", "reload", "verify"].indexOf(kind)
    return ["Open", "Edit", "Write", "Reload", "Verify"].map(function(name, i) {
      var state = i < at ? "done" : i > at ? "todo" : kind === "broken" ? "bad" : kind === "open" || kind === "reload" ? "wait" : "now"
      return { name: name, state: state }
    })
  }
  readonly property bool canEject: app.status !== null && app.status.state === "mounted" && app.status.observed.device !== null && app.status.pending_write === null

  function dotOf(ledKey) {
    if (layerLed === null || !layerLed.colors[ledKey]) return ""
    var hex = Led.hexOf(layerLed.colors[ledKey])
    return hex === "#000000" ? "" : hex
  }

  color: "transparent"

  component Menu: Popup {
    padding: 6
    background: Rectangle {
      radius: 8
      color: Theme.panel
      border.width: 1
      border.color: Theme.panelEdge
    }
  }

  component MenuRow: Rectangle {
    id: item

    property string text: ""
    property string tag: ""
    property bool on: false

    signal picked()

    implicitWidth: Math.max(220, itemRow.implicitWidth + 20)
    implicitHeight: 30
    radius: 5
    color: on ? Theme.surface : itemArea.containsMouse ? Theme.alpha(Theme.text, 0.05) : "transparent"

    Row {
      id: itemRow
      anchors.verticalCenter: parent.verticalCenter
      x: 10
      spacing: 10

      Text {
        text: item.text
        color: item.enabled ? Theme.text : Theme.muted
        font.family: Theme.font
        font.pixelSize: 12
      }

      Text {
        text: item.tag
        color: Theme.dim
        font.family: Theme.font
        font.pixelSize: 12
      }
    }

    MouseArea {
      id: itemArea
      anchors.fill: parent
      hoverEnabled: true
      enabled: item.enabled
      cursorShape: Qt.PointingHandCursor
      onClicked: item.picked()
    }
  }

  Rectangle {
    anchors.bottom: parent.bottom
    width: parent.width
    height: 1
    color: Theme.line
  }

  RowLayout {
    anchors.fill: parent
    anchors.leftMargin: 20
    anchors.rightMargin: 20
    spacing: 14

    Rectangle {
      id: profilePill
      implicitWidth: pillRow.implicitWidth + 24
      implicitHeight: 30
      radius: 15
      color: pillArea.containsMouse ? Theme.alpha(Theme.text, 0.05) : "transparent"
      border.width: 1
      border.color: Theme.muted

      Row {
        id: pillRow
        anchors.centerIn: parent
        spacing: 7

        Text {
          text: "Profile " + root.app.profile
          color: Theme.text
          font.family: Theme.font
          font.pixelSize: 13
          font.weight: Font.Bold
        }

        Text {
          visible: root.active === root.app.profile
          text: "active"
          color: Theme.dim
          font.family: Theme.font
          font.pixelSize: 12
        }

        Text {
          text: "▾"
          color: Theme.dim
          font.family: Theme.font
          font.pixelSize: 12
        }
      }

      MouseArea {
        id: pillArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.app.menu = "profiles"
      }

      Menu {
        id: profiles
        y: profilePill.height + 6
        visible: root.app.menu === "profiles"
        onClosed: if (root.app.menu === "profiles") root.app.menu = ""

        Column {
          Repeater {
            model: 9

            MenuRow {
              required property int index
              text: "Profile " + (index + 1)
              tag: root.active === index + 1 ? "active on the keyboard" : "SmartSet + " + (index + 1)
              on: root.app.profile === index + 1
              onPicked: {
                root.app.menu = ""
                root.app.profile = index + 1
              }
            }
          }
        }
      }
    }

    Segmented {
      options: root.app.layers.map(function(l) { return { value: l.value, label: l.label, dot: root.dotOf(l.led) } })
      value: root.app.layerName
      onPicked: function(v) { root.app.layerName = v }
    }

    Segmented {
      options: [{ value: "keys", label: "Keys" }, { value: "lights", label: "Lights" }]
      value: root.app.mode
      onPicked: function(v) { root.app.mode = v }
    }

    Btn {
      id: backupsButton
      text: "Backups ▾"
      onClicked: root.app.menu = "backups"

      Menu {
        id: backups
        y: backupsButton.height + 6
        visible: root.app.menu === "backups"
        onClosed: if (root.app.menu === "backups") root.app.menu = ""

        Column {
          MenuRow {
            text: "Back up now"
            tag: "layouts, lighting, settings"
            enabled: root.app.mounted
            onPicked: {
              root.app.menu = ""
              root.app.act(["backup"])
            }
          }

          Rectangle {
            width: parent.width
            height: 1
            color: Theme.line
          }

          MenuRow {
            visible: root.app.backups.length === 0
            enabled: false
            text: "No backup yet"
          }

          Repeater {
            model: root.app.backups.slice(0, 12)

            MenuRow {
              required property string modelData
              text: Cycle.backupLabel(modelData, new Date())
              tag: "restore"
              enabled: root.app.mounted
              onPicked: {
                root.app.menu = ""
                root.app.restore(root.app.status.stateDir + "/backups/" + modelData)
              }
            }
          }
        }
      }
    }

    Item { Layout.fillWidth: true }

    Row {
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

          Item {
            visible: step.index > 0
            anchors.verticalCenter: parent.verticalCenter
            width: 32
            height: 1

            Rectangle {
              x: 8
              width: 16
              height: 1
              color: Theme.muted
            }
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

    Btn {
      visible: root.canEject
      small: true
      text: "Eject"
      onClicked: root.app.act(["vdrive", "eject"])
    }
  }
}
