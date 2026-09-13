import Quickshell.Io

Process {
  id: root

  property bool exitSeen: false

  signal finished(int exitCode, string stdout)
  signal startFailed()

  stdout: StdioCollector {
    id: collectedStdout
    waitForEnd: true
  }

  stderr: StdioCollector {
    waitForEnd: true
    onStreamFinished: if (text.trim() !== "") console.warn("adv360", text.trim())
  }

  onExited: function(exitCode) {
    exitSeen = true
    root.finished(exitCode, collectedStdout.text)
  }

  // A binary that is not on PATH never reaches onExited: Process reverts
  // running to false on a failed start, and that is the only signal QML gets.
  onRunningChanged: {
    if (running) {
      exitSeen = false
      return
    }
    if (!exitSeen) root.startFailed()
    exitSeen = false
  }
}
