import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "theme"
import "components"
import "assign.mjs" as Assign
import "edits.mjs" as Edits
import "macro.mjs" as Macro

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
  // Tap & hold draft: written once both slots hold an action.
  property string slot: "tap"
  property string tapDraft: ""
  property string holdDraft: ""
  property int delay: 200
  // Macro draft: written on every change of the strip.
  property var strip: []
  property var speed: null
  property var repeat: null
  property var cotrigger: null
  property bool macroWritten: false
  property var writtenCotrigger: null
  property string message: ""
  property var last: null

  property var queue: []
  property var current: null

  readonly property bool mounted: status !== null && status.state === "mounted"
  readonly property var selectedKey: keyAt(selected)
  readonly property var edits: session === null ? [] : (session.layout ? session.layout.edits : []).concat(session.led ? session.led.edits : [])
  readonly property int pending: edits.length
  readonly property var changes: Edits.changes(edits)

  FileView { id: keyboardFile; path: Quickshell.shellDir + "/../data/keyboard.json"; blockLoading: true }
  FileView { id: tokensFile; path: Quickshell.shellDir + "/../data/tokens.json"; blockLoading: true }

  onProfileChanged: { closeDrawer(); refresh() }
  onLayerNameChanged: { closeDrawer(); refresh() }
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
  function actionOf(key) { return Assign.actionOf(key) }
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
    loadDrafts()
  }

  function setTab(tab) {
    if (tab === "none") {
      closeDrawer()
      return
    }
    capturing = false
    drawer = tab
    loadDrafts()
  }

  function loadDrafts() {
    var key = keyAt(selected)
    var taphold = key !== null && key.kind === "taphold"
    tapDraft = taphold ? key.tap : key === null ? "" : String(Assign.actionOf(key) || "")
    holdDraft = taphold ? key.hold : ""
    delay = taphold ? key.ms : 200
    slot = taphold ? "tap" : "hold"
    var macro = key !== null && key.macros.length > 0 ? key.macros[0] : null
    var parsed = Macro.stripOf(macro === null ? [] : macro.tokens)
    strip = parsed.strip
    speed = parsed.speed
    repeat = parsed.repeat
    cotrigger = macro === null ? null : macro.cotrigger
    macroWritten = macro !== null
    writtenCotrigger = cotrigger
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

  // A tile, a key of the drawn keyboard or a pressed key: the tab decides where the action lands.
  // In the macro tab, "-lshf" and "+lshf" add a press and a release.
  function assign(token) {
    capturing = false
    if (selected === "") {
      message = "select a key first"
      return
    }
    if (drawer === "taphold") fillSlot(token)
    else if (drawer === "macro") setStrip(strip.concat(Macro.stripOf([token]).strip))
    else act(["session", "set-remap"].concat(where(), ["--pos", selected, "--action", token]))
  }

  function copyFrom(position) {
    var source = keyAt(position)
    if (source === null) return
    if (drawer !== "one") {
      var action = Assign.actionOf(source)
      if (action === null || action === "") message = nameOf(position) + " has no action to copy"
      else assign(action)
      return
    }
    var args = Assign.copyArgs(source, selected, layerName, profile)
    if (args === null) message = nameOf(position) + " has no action to copy"
    else act(args)
  }

  function fillSlot(token) {
    if (slot === "tap") tapDraft = token
    else holdDraft = token
    if (slot === "tap" && holdDraft === "") slot = "hold"
    else if (slot === "hold" && tapDraft === "") slot = "tap"
    writeTapHold()
  }

  function setDelay(ms) {
    var next = Math.max(1, Math.min(999, Math.round(ms)))
    if (next === delay) return
    delay = next
    writeTapHold()
  }

  function writeTapHold() {
    if (tapDraft !== "" && holdDraft !== "") {
      act(["session", "set-taphold"].concat(where(), ["--pos", selected, "--tap", tapDraft, "--ms", String(delay), "--hold", holdDraft]))
    }
  }

  function macroFlags(which) {
    return ["--trigger", selected].concat(which === null ? [] : ["--cotrigger", which])
  }

  // set-macro names a macro by trigger and co-trigger: a new co-trigger first removes the old macro (H6).
  function writeMacro() {
    var calls = []
    if (macroWritten && (strip.length === 0 || writtenCotrigger !== cotrigger)) {
      calls.push(["session", "remove"].concat(where(), macroFlags(writtenCotrigger)))
    }
    if (strip.length > 0) {
      calls.push(["session", "set-macro"].concat(where(), macroFlags(cotrigger), ["--tokens", Macro.macroTokens(strip, speed, repeat)]))
    }
    macroWritten = strip.length > 0
    writtenCotrigger = cotrigger
    actAll(calls)
  }

  function setStrip(next) {
    strip = next
    writeMacro()
  }

  function cycleStroke(index) {
    var order = { tap: "down", down: "up", up: "tap" }
    setStrip(strip.map(function(item, i) { return i === index ? { token: item.token, stroke: order[item.stroke] } : item }))
  }

  function removeStep(index) {
    setStrip(strip.filter(function(item, i) { return i !== index }))
  }

  function setCotrigger(value) {
    cotrigger = value === "" || value === "none" ? null : value
    if (strip.length > 0 || macroWritten) writeMacro()
  }

  function setSpeed(n) {
    speed = n >= 1 && n <= 9 ? Math.round(n) : null
    if (strip.length > 0) writeMacro()
  }

  function setRepeat(n) {
    repeat = n >= 2 && n <= 9 ? Math.round(n) : null
    if (strip.length > 0) writeMacro()
  }

  function setField(field, value) {
    switch (field) {
    case "delay": setDelay(Number(value)); break
    case "speed": setSpeed(Number(value)); break
    case "repeat": setRepeat(Number(value)); break
    case "cotrigger": setCotrigger(value); break
    default: message = "unknown field " + field
    }
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

  // Back to the factory action; in the macro tab, the macro goes.
  function reset() {
    if (selected === "") return
    if (drawer === "macro") setStrip([])
    else act(["session", "remove"].concat(where(), ["--pos", selected]))
  }

  function discardAll() {
    act(["session", "discard", "--profile", String(profile)])
  }

  // The × of a change (H7): discard the session, then record every other edit again, in order.
  function removeEdits(indices) {
    var calls = []
    for (var i = 0; i < edits.length; i++) if (indices.indexOf(i) < 0) calls.push(Edits.editArgs(edits[i], profile))
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
    actAll([args])
  }

  // Mutations in order; the first failure stops the rest and shows its message.
  function actAll(calls) {
    if (calls.length === 0) return
    var args = calls[0]
    run(args, function(code, lines) {
      var report = lines.length > 0 ? lines[lines.length - 1] : null
      last = { verb: args[0] === "session" || args[0] === "vdrive" ? args[0] + " " + args[1] : args[0], code: code, report: report }
      message = code === 0 ? "" : (report && report.message ? String(report.message) : "adv360 exited " + code)
      if (code === 0 && calls.length > 1) actAll(calls.slice(1))
      else refresh()
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
    function drawer(tab: string): void { shell.setTab(tab) }
    function slot(name: string): void { shell.slot = name }
    function assign(token: string): void { shell.assign(token) }
    function set(field: string, value: string): void { shell.setField(field, value) }
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
