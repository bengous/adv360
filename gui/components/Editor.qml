import QtQuick
import QtQuick.Layouts
import qs.Commons

// Everything inside the window, shared by the floating window and the test panel.
ColumnLayout {
  id: root

  required property var app

  spacing: Style.spacing.panelGap

  TopBar {
    Layout.fillWidth: true
    Layout.minimumWidth: 0
    status: root.app.status
    profile: root.app.profile
    layerName: root.app.layerName
    tab: root.app.tab
    onProfileSelected: function(n) { root.app.profile = n }
    onLayerSelected: function(name) { root.app.layerName = name }
    onTabSelected: function(name) { root.app.tab = name }
    onBackupRequested: root.app.act(["backup"])
    onEjectRequested: root.app.act(["vdrive", "eject"])
  }

  Text {
    Layout.fillWidth: true
    visible: text !== ""
    text: root.app.cliMissing ? "adv360 is not on PATH: run install.sh first"
      : (root.app.status !== null && root.app.status.next ? "Next: " + root.app.status.next : "")
    color: root.app.cliMissing ? Color.urgent : Color.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.body
    wrapMode: Text.Wrap
  }

  RowLayout {
    Layout.fillWidth: true
    Layout.fillHeight: true
    spacing: Style.spacing.panelGap

    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      spacing: Style.spacing.panelGap

      Keyboard {
        Layout.fillWidth: true
        Layout.preferredHeight: root.height * 0.55
        Layout.minimumWidth: 0
        keyboard: root.app.keyboard
        viewData: root.app.viewData
        layerName: root.app.layerName
        selected: root.app.selected
        onKeyClicked: function(position) { root.app.selected = position; root.app.tab = "layout" }
      }

      BottomPane {
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumWidth: 0
        session: root.app.session
        status: root.app.status
        diffFiles: root.app.diffFiles
        plan: root.app.plan
        message: root.app.message
        backups: root.app.backups
        profile: root.app.profile
        onApplyRequested: root.app.act(["apply", "--profile", String(root.app.profile)])
        onDiscardRequested: root.app.act(["session", "discard", "--profile", String(root.app.profile)])
        onVerifyRequested: root.app.act(["verify"])
        onRestoreRequested: function(dir) { root.app.act(["restore", dir, "--profile", String(root.app.profile)]) }
      }
    }

    Sidebar {
      visible: root.app.tab === "layout"
      Layout.preferredWidth: 360
      Layout.fillHeight: true
      tokens: root.app.tokens
      viewData: root.app.viewData
      selected: root.app.selected
      profile: root.app.profile
      layerName: root.app.layerName
      onAction: function(args) { root.app.act(args) }
    }

    LightingSidebar {
      visible: root.app.tab === "lighting"
      Layout.preferredWidth: 360
      Layout.fillHeight: true
      viewData: root.app.viewData
      profile: root.app.profile
      onAction: function(args) { root.app.act(args) }
    }
  }
}
