pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "theme"
import "components"
import "assign.mjs" as Assign
import "edits.mjs" as Edits
import "macro.mjs" as Macro
import "cycle.mjs" as Cycle
import "led.mjs" as Led
import "hint.mjs" as Hint

// The editor's state and every action on it: views bind to this object, clicks and the
// adv360 IPC target call the same functions, and every change goes through the CLI.
ShellRoot {
  id: shell

  readonly property var cliCommand: {
    try { return JSON.parse(Quickshell.env("ADV360_CMD") || "[]") } catch (e) { return [] }
  }
  // Set by tools/gui-shot.sh only: the GUI then draws on that output as a layer surface.
  readonly property string screenName: Quickshell.env("ADV360_SCREEN") || ""
  readonly property string home: Quickshell.env("HOME") || ""
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
  property var disk: null
  property var backups: []
  property var hints: []
  property bool cliMissing: false

  property int profile: 1
  property string layerName: "base"
  property string mode: "keys"
  property string selected: ""
  property string selectedLed: ""
  // The layer colour the LED drawer edits; the top bar's layer by default.
  property string ledLayer: "layd"
  property string drawer: "none"
  // The open menu of the top bar: "", "profiles" or "backups".
  property string menu: ""
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
  property string note: ""
  property var last: null
  // Auto-verify (H2): one `adv360 verify` per write record, keyed by its start time.
  property var verifyResult: null
  property string verifiedFor: ""
  property string cycleKind: ""

  property var queue: []
  property var current: null

  readonly property bool mounted: status !== null && status.state === "mounted"
  readonly property string closedHint: "open the v-Drive first: SmartSet + Hotkey 3"
  readonly property bool busy: current !== null || queue.length > 0
  readonly property string sessionState: session === null ? "clean" : String(session.state)
  readonly property var selectedKey: keyAt(selected)
  readonly property var edits: session === null ? [] : (session.layout ? session.layout.edits : []).concat(session.led ? session.led.edits : [])
  readonly property int pending: edits.length
  readonly property var changes: Edits.changes(edits)
  readonly property var cycle: Cycle.cycleStep(status, session)

  FileView { id: keyboardFile; path: Quickshell.shellDir + "/../data/keyboard.json"; blockLoading: true }
  FileView { id: tokensFile; path: Quickshell.shellDir + "/../data/tokens.json"; blockLoading: true }

  onProfileChanged: { closeDrawer(); refresh() }
  onLayerNameChanged: { closeDrawer(); refresh() }
  onModeChanged: closeDrawer()
  onMenuChanged: if (menu === "profiles") loadHints()
  onCycleChanged: {
    if (cycle.kind !== cycleKind) {
      cycleKind = cycle.kind
      // Edits are refused until the write is verified: the reload drawer takes over.
      if (cycleKind === "write" || cycleKind === "reload" || cycleKind === "verify" || cycleKind === "broken") {
        capturing = false
        selected = ""
        drawer = "reload"
      }
    }
    if (cycle.kind === "verify") autoVerify()
  }
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
  function modifierLabel(token) { return labelOf(token).replace(/^(Left|Right) /, "") }
  function ledName(indicator) {
    var n = Number(String(indicator).slice(3))
    return n <= 3 ? "Left LED " + n : "Right LED " + (n - 3)
  }
  function factoryOf(layer, position) {
    var action = (keyboard.defaults[layer] || {})[position] || keyboard.defaults.base[position]
    return action === undefined ? null : action
  }

  function changeName(edit) {
    var prefix = edit.layer && edit.layer !== "base" ? layerLabel(edit.layer) + " · " : ""
    switch (edit.op) {
    case "set-macro":
    case "remove-macro":
      return prefix + (edit.cotrigger ? modifierLabel(edit.cotrigger) + " + " : "") + nameOf(edit.trigger)
    case "set-led":
      return ledName(edit.indicator)
    case "replace-file":
      return "Restored file"
    default:
      return prefix + nameOf(edit.position)
    }
  }

  function preview(tokens) { return Macro.macroPreview(Macro.stripOf(tokens).strip) }

  // What a change makes the key do, and the tint of its keycap.
  function afterOf(edit) {
    switch (edit.op) {
    case "set-remap":
      return { label: labelOf(edit.action), kind: known(edit.action) ? "remap" : "bad" }
    case "set-taphold":
      return { label: labelOf(edit.tap) + ", hold " + labelOf(edit.hold) + " after " + edit.ms + " ms", kind: known(edit.tap) && known(edit.hold) ? "taphold" : "bad" }
    case "set-macro":
      return { label: "types " + preview(edit.tokens), kind: "macro" }
    case "remove":
      var factory = factoryOf(edit.layer, edit.position)
      return { label: (factory === null ? "nothing" : labelOf(factory)) + " (factory)", kind: "" }
    case "remove-macro":
      return { label: "no macro", kind: "" }
    case "set-led":
      return { label: ledFunctionLabel(edit.function), kind: "" }
    default:
      return { label: "file from backup", kind: "" }
    }
  }

  function beforeLabel(before) {
    switch (before.kind) {
    case "action": return before.action === null ? "nothing" : labelOf(before.action)
    case "taphold": return labelOf(before.tap) + ", hold " + labelOf(before.hold)
    case "macro": return before.tokens === null ? "no macro" : "types " + preview(before.tokens)
    case "led": return ledFunctionLabel(before.function)
    default: return "the current file"
    }
  }
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
    if (position !== "" && !mounted) {
      message = closedHint
      return
    }
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
    if (tab === "review") {
      openReview()
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
    selectedLed = ""
    drawer = "none"
  }

  function selectLed(indicator) {
    if (mode !== "lights") mode = "lights"
    capturing = false
    selected = ""
    selectedLed = indicator
    ledLayer = Led.LAYER_LEDS[layerName] || "layd"
    drawer = indicator === "" ? "none" : "led"
  }

  function ledAt(indicator) {
    return viewData && viewData.leds ? viewData.leds[indicator] || null : null
  }

  function setLedFunction(func) {
    var led = ledAt(selectedLed)
    if (led === null || led.function === func) return
    act(Led.ledArgs(profile, selectedLed, func, Led.colorsFor(led, func, ledLayer)))
  }

  // key: the layer LED key (layd … lay3), or the function of a single-colour LED.
  function setLedColor(key, hex) {
    var led = ledAt(selectedLed)
    if (led === null) return
    var colors = Led.colorsFor(led, led.function, key)
    var rgb = Led.rgbOf(hex)
    if (Led.hexOf(colors[key]) === Led.hexOf(rgb)) return
    colors[key] = rgb
    act(Led.ledArgs(profile, selectedLed, led.function, colors))
  }

  // "Write to keyboard" (H1): the review reads the keyboard's own lines to show what each change replaces.
  function openReview() {
    capturing = false
    selected = ""
    drawer = "review"
    disk = null
    run(["inspect", "--profile", String(profile)], function(code, lines) {
      var p = code === 0 && lines.length > 0 && lines[0].profiles.length > 0 ? lines[0].profiles[0] : null
      disk = p === null ? { layout: [], led: [] } : { layout: p.layout ? p.layout.entries : [], led: p.led ? p.led.entries : [] }
    })
  }

  // The same path as "Write and eject": apply, then show what the keyboard needs next.
  function write() {
    if (sessionState !== "dirty") {
      message = "nothing to write on profile " + profile
      return
    }
    apply(profile)
  }

  // A write whose eject failed stays `written`: apply again retries only the eject.
  function retryEject() {
    var record = status !== null ? status.pending_write : null
    if (record !== null && record.phase.kind === "written") apply(record.profile)
  }

  function verifyAgain() {
    verifiedFor = ""
    if (cycle.kind === "verify") autoVerify()
  }

  function apply(which) {
    run(["apply", "--profile", String(which)], function(code, lines) {
      var report = lines.length > 0 ? lines[lines.length - 1] : null
      last = { verb: "apply", code: code, report: report }
      if (code !== 0) {
        message = report && report.message ? String(report.message) : "apply exited " + code
      } else {
        message = ""
        verifyResult = null
        if (report.outcome.kind === "ejected") {
          selected = ""
          drawer = "reload"
        } else {
          note = "Written to profile " + which + " and read back."
          closeDrawer()
        }
      }
      refresh()
      pollStatus()
    })
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
    var next = value === "" || value === "none" ? null : value
    if (next === cotrigger) return
    cotrigger = next
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
    case "ledFunction": setLedFunction(value); break
    case "ledColor":
      var parts = String(value).split("=")
      var led = ledAt(selectedLed)
      if (parts.length === 2) setLedColor(Led.LAYER_LEDS[parts[0]] || parts[0], parts[1])
      else if (led !== null) setLedColor(led.function, parts[0])
      break
    default: message = "unknown field " + field
    }
  }

  // Dropped on the key the drawer edits, an action lands where a click would put it.
  function dropOn(target, payload) {
    if (payload.position === target) return
    if (target === selected && (drawer === "taphold" || drawer === "macro")) {
      if (payload.token !== undefined) assign(payload.token)
      else copyFrom(payload.position)
      return
    }
    if (payload.token !== undefined) {
      act(["session", "set-remap"].concat(where(), ["--pos", target, "--action", payload.token]))
      return
    }
    var source = keyAt(payload.position)
    var args = source === null ? null : Assign.copyArgs(source, target, layerName, profile)
    if (args === null) message = nameOf(payload.position) + " has no action to copy"
    else act(args)
  }

  function autoVerify() {
    var record = status !== null ? status.pending_write : null
    if (record === null || record.started_at === verifiedFor) return
    verifiedFor = record.started_at
    verifyResult = null
    selected = ""
    drawer = "reload"
    run(["verify"], function(code, lines) {
      var report = lines.length > 0 ? lines[lines.length - 1] : null
      verifyResult = { code: code, report: report }
      last = { verb: "verify", code: code, report: report }
      refresh()
      pollStatus()
    })
  }

  // Opens a session that puts the backup's files back on `which`; Write then makes it real.
  function restore(backupDir, which) {
    closeDrawer()
    if (which !== profile) profile = which
    act(["restore", backupDir, "--profile", String(which)])
  }

  // Back to the factory action; in the macro tab, the macro goes.
  function reset() {
    if (selected === "") return
    if (drawer === "macro") setStrip([])
    else actAll([["session", "remove"].concat(where(), ["--pos", selected])], true)
  }

  function discardAll() {
    actAll([["session", "discard", "--profile", String(profile)]], true)
  }

  // The × of a change (H7): discard the session, then record every other edit again, in order.
  // The first edit of a replay reads the disk, so the v-Drive must be open.
  function removeEdits(indices) {
    if (!mounted || busy) {
      message = mounted ? "wait for the last change to finish" : "open the v-Drive to remove one change; Discard all works without it"
      return
    }
    var calls = [["session", "discard", "--profile", String(profile)]]
    for (var i = 0; i < edits.length; i++) if (indices.indexOf(i) < 0) calls.push(Edits.editArgs(edits[i], profile))
    if (calls.indexOf(null) >= 0) {
      message = "a restored file cannot be replayed: use Discard all"
      return
    }
    actAll(calls, true)
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

  function run(args, callback, batch) {
    queue = queue.concat([{ args: args, callback: callback, batch: batch || null }])
    pump()
  }

  function pump() {
    if (cliProcess.running || current !== null) return
    while (queue.length > 0 && queue[0].batch !== null && queue[0].batch.aborted) queue = queue.slice(1)
    if (queue.length === 0) return
    current = queue[0]
    queue = queue.slice(1)
    cliProcess.command = (cliCommand.length > 0 ? cliCommand : ["adv360"]).concat(current.args)
    cliProcess.running = true
  }

  // Every mutation goes through here: the CLI answers, the window re-reads.
  function act(args) {
    actAll([args])
  }

  // Mutations queued at once, so a second click lands after them; the first failure drops the
  // rest and shows its message. `reload` re-reads the drafts once the window has re-read the key.
  function actAll(calls, reload) {
    if (calls.length === 0) return
    var batch = { aborted: false }
    calls.forEach(function(args, i) {
      run(args, function(code, lines) {
        var report = lines.length > 0 ? lines[lines.length - 1] : null
        last = { verb: args[0] === "session" || args[0] === "vdrive" ? args[0] + " " + args[1] : args[0], code: code, report: report }
        message = code === 0 ? "" : (report && report.message ? String(report.message) : "adv360 exited " + code)
        note = ""
        if (code !== 0) batch.aborted = true
        if (code !== 0 || i === calls.length - 1) refresh(reload === true)
      }, batch)
    })
  }

  function refresh(reload) {
    run(["view", "--profile", String(profile), "--layer", layerName], function(code, lines) {
      viewData = code === 0 && lines.length > 0 ? lines[0] : null
      if (reload === true && selected !== "") loadDrafts()
    })
    run(["session", "status", "--profile", String(profile)], function(code, lines) {
      session = lines.length > 0 ? lines[0] : null
      if (session !== null && (session.state === "dirty" || session.state === "conflict")) {
        run(["diff", "--profile", String(profile)], function(c, l) { diffFiles = c === 0 && l.length > 0 ? l[0].files : [] })
        if (session.state === "dirty") run(["apply", "--profile", String(profile), "--dry-run"], function(c, l) { plan = l.length > 0 ? l[0] : null })
        else plan = null
      } else {
        diffFiles = []
        plan = null
      }
    })
    if (status !== null && status.stateDir) lsProcess.running = true
  }

  function loadHints() {
    hints = []
    if (!mounted) return
    for (var p = 1; p <= 9; p++) {
      (function(which) {
        run(["view", "--profile", String(which), "--layer", "base"], function(code, lines) {
          var next = hints.slice()
          next[which - 1] = code === 0 && lines.length > 0 ? Hint.profileHint(lines[0], keyboard) : null
          hints = next
        })
      })(p)
    }
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
      cycle: cycle,
      pending: pending,
      message: message,
      last: last,
      busy: busy
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
      if (shell.mounted && shell.message === shell.closedHint) shell.message = ""
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
    function selectLed(indicator: string): void { shell.selectLed(indicator) }
    function menu(name: string): void { shell.menu = name === "none" ? "" : name }
    function drawer(tab: string): void { shell.setTab(tab) }
    function slot(name: string): void { shell.slot = name }
    function assign(token: string): void { shell.assign(token) }
    function set(field: string, value: string): void { shell.setField(field, value) }
    function remove(index: int): void { if (index >= 0 && index < shell.changes.length) shell.removeEdits(shell.changes[index].indices) }
    function write(): void { shell.write() }
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
