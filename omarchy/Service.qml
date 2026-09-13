import QtQuick
import Quickshell
import Quickshell.Io

// kind "service": keeps `adv360 watch` alive so the v-Drive mount notification fires
// with no GUI open. The CLI does the notifying; this file only restarts it.
Item {
  id: root

  property var shell: null
  property string omarchyPath: ""

  readonly property string binary: Quickshell.env("HOME") + "/.local/bin/adv360"

  Process {
    id: watcher
    command: [root.binary, "watch"]
    running: true
    onRunningChanged: if (!running) restart.start()
  }

  // A missing or crashing binary must not spin the shell: one attempt per 30 s.
  Timer {
    id: restart
    interval: 30000
    onTriggered: watcher.running = true
  }
}
