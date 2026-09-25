import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import "."
import "components"

ShellRoot {
  id: shell

  readonly property var cliCommand: {
    try { return JSON.parse(Quickshell.env("ADV360_CMD") || "[]") } catch (e) { return [] }
  }
  // Set by tools/gui-shot.sh only: the GUI then draws on that output as a layer surface.
  readonly property string screenName: Quickshell.env("ADV360_SCREEN") || ""
  readonly property var testScreen: {
    for (var i = 0; i < Quickshell.screens.length; i++) if (Quickshell.screens[i].name === screenName) return Quickshell.screens[i]
    return null
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
  property var last: null

  readonly property bool mounted: status !== null && status.state === "mounted"
  readonly property int pending: {
    if (session === null) return 0
    return (session.layout ? session.layout.edits.length : 0) + (session.led ? session.led.edits.length : 0)
  }

  FileView { id: keyboardFile; path: Quickshell.shellDir + "/data/keyboard.json"; blockLoading: true }
  FileView { id: tokensFile; path: Quickshell.shellDir + "/data/tokens.json"; blockLoading: true }

  onProfileChanged: { selected = ""; refresh() }
  onLayerNameChanged: refresh()
  Component.onCompleted: {
    if (screenName !== "" && testScreen === null) {
      console.error("adv360: no screen named " + screenName)
      // The engine connects its exit handler after the root component completes.
      Qt.callLater(Qt.exit, 1)
      return
    }
    pollStatus()
    refresh()
  }

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
      var report = lines.length > 0 ? lines[lines.length - 1] : null
      last = { verb: args[0] === "session" || args[0] === "vdrive" ? args[0] + " " + args[1] : args[0], code: code, report: report }
      message = code === 0 ? "" : (report && report.message ? String(report.message) : "adv360 exited " + code)
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
        run(["apply", "--profile", String(profile), "--dry-run"], function(c, l) { plan = l.length > 0 ? l[0] : null })
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

  function snapshot() {
    return {
      profile: profile,
      layer: layerName,
      mode: tab === "lighting" ? "lights" : "keys",
      selected: selected === "" ? null : selected,
      drawer: "none",
      cycle: null,
      pending: pending,
      message: message,
      last: last,
      busy: current !== null || queue.length > 0
    }
  }

  CliProcess {
    id: cliProcess
    onFinished: function(code, stdout) {
      var done = shell.current
      shell.current = null
      if (done && done.callback) done.callback(code, shell.parseLines(stdout))
      shell.pump()
    }
    onStartFailed: { shell.cliMissing = true; shell.current = null; shell.queue = [] }
  }

  CliProcess {
    id: statusProcess
    onFinished: function(code, stdout) {
      var lines = shell.parseLines(stdout)
      var next = code === 0 && lines.length > 0 ? lines[0] : null
      var wasMounted = shell.mounted
      shell.status = next
      if (shell.mounted !== wasMounted) shell.refresh()
    }
    onStartFailed: shell.cliMissing = true
  }

  CliProcess {
    id: lsProcess
    command: ["ls", "-1", (shell.status && shell.status.stateDir ? shell.status.stateDir : "") + "/backups"]
    onFinished: function(code, stdout) {
      shell.backups = code === 0 ? String(stdout).split("\n").filter(function(l) { return l.trim() !== "" }).reverse() : []
    }
  }

  Timer { interval: 1000; running: true; repeat: true; onTriggered: shell.pollStatus() }

  IpcHandler {
    target: "adv360"

    function profile(n: int): void { shell.profile = n }
    function layer(name: string): void { shell.layerName = name }
    function state(): string { return JSON.stringify(shell.snapshot()) }
  }

  LazyLoader {
    active: shell.screenName === ""

    FloatingWindow {
      title: "Kinesis Advantage360"
      color: Color.background
      implicitWidth: 1320
      implicitHeight: 860

      Editor {
        anchors.fill: parent
        anchors.margins: Style.spacing.panelPadding
        app: shell
      }
    }
  }

  LazyLoader {
    active: shell.testScreen !== null

    PanelWindow {
      screen: shell.testScreen
      anchors { left: true; right: true; top: true; bottom: true }
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "adv360-shot"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      color: Color.background

      Editor {
        anchors.fill: parent
        anchors.margins: Style.spacing.panelPadding
        app: shell
      }
    }
  }
}
