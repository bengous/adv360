import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import "."
import "components"

ShellRoot {
  FloatingWindow {
    id: win
    title: "Kinesis Advantage360"
    color: Color.background
    implicitWidth: 1320
    implicitHeight: 860

    readonly property var cliCommand: {
      try { return JSON.parse(Quickshell.env("ADV360_CMD") || "[]") } catch (e) { return [] }
    }
    readonly property var keyboard: JSON.parse(keyboardFile.text())
    readonly property var tokens: JSON.parse(tokensFile.text())

    property var status: null
    property int profile: 1
    property string layerName: "base"
    property string tab: "layout"
    property var viewData: null
    property var session: null
    property var diffFiles: []
    property var plan: null
    property string selected: ""
    property string message: ""
    property bool cliMissing: false
    property var backups: []
    property var queue: []
    property var current: null

    readonly property string layoutRel: "layouts/layout" + profile + ".txt"
    readonly property bool mounted: status !== null && status.state === "mounted"
    readonly property bool dirty: session !== null && session.state === "dirty"

    FileView { id: keyboardFile; path: Quickshell.shellDir + "/data/keyboard.json"; blockLoading: true }
    FileView { id: tokensFile; path: Quickshell.shellDir + "/data/tokens.json"; blockLoading: true }

    onProfileChanged: { selected = ""; refresh() }
    onLayerNameChanged: refresh()
    Component.onCompleted: { pollStatus(); refresh() }

    function parseLines(text) {
      var out = []
      var lines = String(text || "").split("\n")
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trim() === "") continue
        try { out.push(JSON.parse(lines[i])) } catch (e) { console.warn("adv360", "bad JSON line", lines[i]) }
      }
      return out
    }

    function run(args, callback) {
      queue = queue.concat([{ args: args, callback: callback }])
      pump()
    }

    function pump() {
      if (cliProcess.running || current !== null || queue.length === 0) return
      current = queue[0]
      queue = queue.slice(1)
      cliProcess.command = (cliCommand.length > 0 ? cliCommand : ["adv360"]).concat(current.args)
      cliProcess.running = true
    }

    // Every mutation goes through here: the CLI answers, the window re-reads.
    function act(args) {
      run(args, function(code, lines) {
        var last = lines.length > 0 ? lines[lines.length - 1] : null
        message = code === 0 ? "" : (last && last.message ? String(last.message) : "adv360 exited " + code)
        refresh()
      })
    }

    function refresh() {
      run(["view", "--profile", String(profile), "--layer", layerName], function(code, lines) {
        viewData = code === 0 && lines.length > 0 ? lines[0] : null
      })
      run(["session", "status", "--profile", String(profile)], function(code, lines) {
        session = lines.length > 0 ? lines[0] : null
        if (session !== null && session.state === "dirty") {
          run(["diff", "--profile", String(profile)], function(c, l) { diffFiles = c === 0 && l.length > 0 ? l[0].files : [] })
          run(["apply", "--profile", String(profile), "--dry-run"], function(c, l) { plan = c === 0 && l.length > 0 ? l[0] : (l.length > 0 ? l[0] : null) })
        } else {
          diffFiles = []
          plan = null
        }
      })
      if (status !== null && status.stateDir) lsProcess.running = true
    }

    function pollStatus() {
      if (statusProcess.running) return
      statusProcess.command = (cliCommand.length > 0 ? cliCommand : ["adv360"]).concat(["vdrive", "status"])
      statusProcess.running = true
    }

    CliProcess {
      id: cliProcess
      onFinished: function(code, stdout) {
        var done = win.current
        win.current = null
        if (done && done.callback) done.callback(code, win.parseLines(stdout))
        win.pump()
      }
      onStartFailed: { win.cliMissing = true; win.current = null; win.queue = [] }
    }

    CliProcess {
      id: statusProcess
      onFinished: function(code, stdout) {
        var lines = win.parseLines(stdout)
        var next = code === 0 && lines.length > 0 ? lines[0] : null
        var wasMounted = win.mounted
        win.status = next
        if (win.mounted !== wasMounted) win.refresh()
      }
      onStartFailed: win.cliMissing = true
    }

    CliProcess {
      id: lsProcess
      command: ["ls", "-1", (win.status && win.status.stateDir ? win.status.stateDir : "") + "/backups"]
      onFinished: function(code, stdout) {
        win.backups = code === 0 ? String(stdout).split("\n").filter(function(l) { return l.trim() !== "" }).reverse() : []
      }
    }

    Timer { interval: 1000; running: true; repeat: true; onTriggered: win.pollStatus() }

    ColumnLayout {
      anchors.fill: parent
      anchors.margins: Style.spacing.panelPadding
      spacing: Style.spacing.panelGap

      TopBar {
        Layout.fillWidth: true
        Layout.minimumWidth: 0
        status: win.status
        profile: win.profile
        layerName: win.layerName
        tab: win.tab
        onProfileSelected: function(n) { win.profile = n }
        onLayerSelected: function(name) { win.layerName = name }
        onTabSelected: function(name) { win.tab = name }
        onBackupRequested: win.act(["backup"])
        onEjectRequested: win.act(["vdrive", "eject"])
      }

      Text {
        Layout.fillWidth: true
        visible: text !== ""
        text: win.cliMissing ? "adv360 is not on PATH: run install.sh first"
          : (win.status !== null && win.status.next ? "Next: " + win.status.next : "")
        color: win.cliMissing ? Color.urgent : Color.muted
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
            id: keyboardView
            Layout.fillWidth: true
            Layout.preferredHeight: win.height * 0.55
            Layout.minimumWidth: 0
            keyboard: win.keyboard
            viewData: win.viewData
            layerName: win.layerName
            selected: win.selected
            onKeyClicked: function(position) { win.selected = position; win.tab = "layout" }
          }

          BottomPane {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: 0
            session: win.session
            status: win.status
            diffFiles: win.diffFiles
            plan: win.plan
            message: win.message
            backups: win.backups
            profile: win.profile
            onApplyRequested: win.act(["apply", "--profile", String(win.profile)])
            onDiscardRequested: win.act(["session", "discard", "--profile", String(win.profile)])
            onVerifyRequested: win.act(["verify"])
            onRestoreRequested: function(dir) { win.act(["restore", dir, "--profile", String(win.profile)]) }
          }
        }

        Sidebar {
          visible: win.tab === "layout"
          Layout.preferredWidth: 360
          Layout.fillHeight: true
          tokens: win.tokens
          viewData: win.viewData
          selected: win.selected
          profile: win.profile
          layerName: win.layerName
          onAction: function(args) { win.act(args) }
        }

        LightingSidebar {
          visible: win.tab === "lighting"
          Layout.preferredWidth: 360
          Layout.fillHeight: true
          viewData: win.viewData
          profile: win.profile
          onAction: function(args) { win.act(args) }
        }
      }
    }
  }
}
