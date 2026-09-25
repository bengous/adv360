pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"
import "../press.mjs" as Press

// Everything inside the window, shared by the floating window and the test panel.
Item {
  id: root

  required property var app

  focus: true
  Keys.onEscapePressed: root.app.closeDrawer()

  ColumnLayout {
    anchors.fill: parent
    spacing: 0

    TopBar {
      Layout.fillWidth: true
      Layout.minimumWidth: 0
      Layout.margins: 16
      Layout.bottomMargin: 8
      status: root.app.status
      profile: root.app.profile
      layerName: root.app.layerName
      tab: root.app.mode === "lights" ? "lighting" : "layout"
      cycle: root.app.cycle
      onProfileSelected: function(n) { root.app.profile = n }
      onLayerSelected: function(name) { root.app.layerName = name }
      onTabSelected: function(name) { root.app.mode = name === "lighting" ? "lights" : "keys" }
      onBackupRequested: root.app.act(["backup"])
      onEjectRequested: root.app.act(["vdrive", "eject"])
    }

    Text {
      Layout.fillWidth: true
      Layout.leftMargin: 16
      visible: text !== ""
      text: root.app.cliMissing ? "adv360 is not on PATH: run install.sh first" : ""
      color: Theme.bad
      font.family: Theme.font
      font.pixelSize: 12
      wrapMode: Text.Wrap
    }

    RowLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      Layout.margins: 16
      Layout.topMargin: 0
      spacing: 16

      ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 14

        Keyboard {
          id: keyboardView
          Layout.fillWidth: true
          Layout.fillHeight: true
          keyboard: root.app.keyboard
          tokens: root.app.tokens
          viewData: root.app.viewData
          layerName: root.app.layerName
          selected: root.app.selected
          targeting: root.app.selected !== ""
          lights: root.app.mode === "lights"
          selectedLed: root.app.selectedLed
          glow: root.app.drawer === "reload" && root.app.cycle.kind === "reload" ? ["smartset", "hk4"] : []
          ghost: ghost
          onKeyClicked: function(position) { root.app.keyClicked(position) }
          onDropped: function(position, payload) { root.app.dropOn(position, payload) }
          onLedClicked: function(indicator) { root.app.selectLed(indicator) }
        }

        Drawer {
          id: drawer
          visible: root.app.drawer !== "none"
          Layout.fillWidth: true
          Layout.preferredHeight: ({ one: 232, taphold: 280, macro: 316, review: 330, reload: 150, led: 200 })[root.app.drawer] || 232
          app: root.app
          ghost: ghost
          notchX: keyboardView.x + (root.app.drawer === "led" ? keyboardView.ledCenter(root.app.selectedLed) : keyboardView.centerOf(root.app.selected)).x - x
        }

        BottomPane {
          visible: root.app.drawer === "none"
          Layout.fillWidth: true
          Layout.fillHeight: false
          Layout.preferredHeight: 80
          status: root.app.status
          backups: root.app.backups
          profile: root.app.profile
          onVerifyRequested: root.app.act(["verify"])
          onRestoreRequested: function(dir) { root.app.act(["restore", dir, "--profile", String(root.app.profile)]) }
        }
      }
    }

    Tray {
      Layout.fillWidth: true
      Layout.preferredHeight: 56
      app: root.app
    }
  }

  // "Press a key": the next physical key pressed becomes the action, Esc included.
  Item {
    id: catcher
    Keys.onPressed: function(event) {
      event.accepted = true
      if (event.isAutoRepeat) return
      var token = Press.tokenForKey(event.key, event.nativeScanCode, event.text)
      if (token === null) root.app.message = "no action token for that key"
      else root.app.assign(token)
    }
  }

  Connections {
    target: root.app
    function onCapturingChanged() {
      if (root.app.capturing) catcher.forceActiveFocus()
      else root.forceActiveFocus()
    }
  }

  // While capturing, a click outside the drawer ends the capture and goes nowhere else.
  MouseArea {
    anchors.fill: parent
    enabled: root.app.capturing
    onPressed: function(mouse) {
      if (drawer.contains(mapToItem(drawer, mouse.x, mouse.y))) mouse.accepted = false
      else root.app.capturing = false
    }
  }

  // The keycap that follows the pointer while an action is dragged onto a key.
  Keycap {
    id: ghost

    property var payload: null

    visible: Drag.active
    z: 10
    Drag.keys: ["adv360"]
    Drag.hotSpot.x: width / 2
    Drag.hotSpot.y: height / 2

    function begin(payload, label) {
      ghost.payload = payload
      ghost.label = label
      Drag.active = true
    }

    function follow(item, x, y) {
      var p = item.mapToItem(root, x, y)
      ghost.x = p.x - width / 2
      ghost.y = p.y - height / 2
    }

    function end() {
      Drag.drop()
      Drag.active = false
    }
  }
}
