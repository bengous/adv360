import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "theme"
import "components"
import "assign.mjs" as Assign
import "edits.mjs" as Edits

// The editor's state and every action on it: views bind to this object, clicks and the
// adv360 IPC target call the same functions, and every change goes through the CLI.
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
  readonly property var labelMap: Assign.labels(tokens)
  readonly property var layers: [
    { value: "base", label: "Base", led: "layd" }, { value: "keypad", label: "Kp", led: "layk" },
    { value: "function1", label: "Fn1", led: "lay1" }, { value: "function2", label: "Fn2", led: "lay2" },
    { value: "function3", label: "Fn3", led: "lay3" }
  ]

  property var status: null
  property var viewData: null
  property var session: null
  property var diffFiles: []
  property var plan: null
  property var backups: []
  property bool cliMissing: false

  property int profile: 1
  property string layerName: "base"
  property string mode: "keys"
  property string selected: ""
  property string drawer: "none"
  property bool capturing: false
  property string message: ""
  property var last: null

  property var queue: []
  property var current: null

  readonly property bool mounted: status !== null && status.state === "mounted"
  readonly property var selectedKey: keyAt(selected)
  readonly property var edits: session === null ? [] : (session.layout ? session.layout.edits : []).concat(session.led ? session.led.edits : [])
  readonly property int pending: edits.length

  FileView { id: keyboardFile; path: Quickshell.shellDir + "/../data/keyboard.json"; blockLoading: true }
  FileView { id: tokensFile; path: Quickshell.shellDir + "/../data/tokens.json"; blockLoading: true }

  onProfileChanged: { closeDrawer(); refresh() }
  onLayerNameChanged: refresh()
  onModeChanged: closeDrawer()
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

  function keyAt(position) {
    if (!viewData || !viewData.keys || position === "") return null
    for (var i = 0; i < viewData.keys.length; i++) if (viewData.keys[i].position === position) return viewData.keys[i]
    return null
  }

  function nameOf(position) { return Assign.keyName(position, keyboard.defaults.base, labelMap) }
  function labelOf(token) { return labelMap[String(token).toLowerCase()] || String(token) }
  function known(token) { return Assign.isKnown(String(token), tokens) }
  function ledFunctionLabel(name) { return name === "layer" ? "Layer" : tokens.led[name] || name }
  function layerLabel(name) {
    for (var i = 0; i < layers.length; i++) if (layers[i].value === name) return layers[i].label
    return name
  }
  function where() { return ["--profile", String(profile), "--layer", layerName] }

  function tabFor(key) {
    if (key === null) return "one"
    return key.kind === "taphold" ? "taphold" : key.kind === "default" && key.macros.length > 0 ? "macro" : "one"
  }

  function select(position) {
    capturing = false
    selected = position
    drawer = position === "" ? "none" : tabFor(keyAt(position))
  }

  function closeDrawer() {
    capturing = false
    selected = ""
    drawer = "none"
  }

  // A click on the drawn keyboard: opens the drawer, or, drawer open, copies that key's action (H5).
  function keyClicked(position) {
    if (drawer === "none" || selected === "") select(position)
    else if (position === selected) closeDrawer()
    else copyFrom(position)
  }

  function assign(token) {
    capturing = false
    if (selected === "") {
      message = "select a key first"
      return
    }
    act(["session", "set-remap"].concat(where(), ["--pos", selected, "--action", token]))
  }

  function copyFrom(position) {
    var source = keyAt(position)
    if (source === null) return
    var args = Assign.copyArgs(source, selected, layerName, profile)
    if (args === null) message = nameOf(position) + " has no action to copy"
    else act(args)
  }

  function dropOn(target, payload) {
    if (payload.token !== undefined) {
      act(["session", "set-remap"].concat(where(), ["--pos", target, "--action", payload.token]))
      return
    }
    var source = keyAt(payload.position)
    var args = source === null ? null : Assign.copyArgs(source, target, layerName, profile)
    if (args === null) message = nameOf(payload.position) + " has no action to copy"
    else act(args)
  }

  function reset() {
    if (selected !== "") act(["session", "remove"].concat(where(), ["--pos", selected]))
  }

  function discardAll() {
    act(["session", "discard", "--profile", String(profile)])
  }

  // The × of a change (H7): discard the session, then record every other edit again, in order.
  function removeEdit(index) {
    var calls = []
    for (var i = 0; i < edits.length; i++) if (i !== index) calls.push(Edits.editArgs(edits[i], profile))
    if (calls.indexOf(null) >= 0) {
      message = "a restored file cannot be replayed: use Discard all"
      return
    }
    run(["session", "discard", "--profile", String(profile)], function(code, lines) {
      if (code !== 0) failed("session discard", code, lines)
      else replay(calls, 0)
    })
  }

  function replay(calls, i) {
    if (i >= calls.length) {
      message = ""
      refresh()
      return
    }
    run(calls[i], function(code, lines) {
      if (code !== 0) failed(calls[i].slice(0, 2).join(" "), code, lines)
      else replay(calls, i + 1)
    })
  }

  function failed(verb, code, lines) {
    var report = lines.length > 0 ? lines[lines.length - 1] : null
    last = { verb: verb, code: code, report: report }
    message = report && report.message ? String(report.message) : verb + " exited " + code
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
      mode: mode,
      selected: selected === "" ? null : selected,
      drawer: drawer,
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
    function mode(name: string): void { shell.mode = name }
    function select(position: string): void { shell.select(position) }
    function drawer(tab: string): void { if (tab === "none") shell.closeDrawer(); else shell.drawer = tab }
    function assign(token: string): void { shell.assign(token) }
    function state(): string { return JSON.stringify(shell.snapshot()) }
  }

  LazyLoader {
    active: shell.screenName === ""

    FloatingWindow {
      title: "Kinesis Advantage360"
      color: Theme.surface
      implicitWidth: 1320
      implicitHeight: 860

      Editor {
        anchors.fill: parent
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
      color: Theme.surface

      Editor {
        anchors.fill: parent
        app: shell
      }
    }
  }
}
