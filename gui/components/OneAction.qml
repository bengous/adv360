pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../theme"
import "../controls"

// The action grid: one category at a time, a click or a drag assigns the tile.
ColumnLayout {
  id: root

  required property var app
  property var ghost: null
  property string current: ""
  property string fallback: "Special Actions"
  property string picked: ""

  readonly property var shortNames: ({
    "Navigation Keys": "Navigation", "Multimodifiers": "Multimods", "Multimedia": "Media",
    "Mouse Actions": "Mouse", "Function Keys": "F1-F24", "Special Actions": "Special",
    "Layer Shifting": "Layer shift", "Layer Toggling": "Layer toggle", "Numeric Keypad": "Keypad"
  })
  readonly property var categories: app.tokens.categories
  readonly property string category: picked !== "" ? picked : categoryOf(current)
  readonly property var tiles: {
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].name !== category) continue
      var entries = categories[i].tokens
      return Object.keys(entries).map(function(t) { return { token: t, label: entries[t] } })
    }
    return []
  }

  function categoryOf(token) {
    var wanted = String(token).toLowerCase()
    for (var i = 0; i < categories.length; i++) {
      var names = Object.keys(categories[i].tokens)
      for (var j = 0; j < names.length; j++) if (names[j].toLowerCase() === wanted) return categories[i].name
    }
    return fallback
  }

  spacing: 8

  Connections {
    target: root.app
    function onSelectedChanged() { root.picked = "" }
  }

  Row {
    Layout.fillWidth: true
    spacing: 2
    clip: true

    Repeater {
      model: root.categories

      Rectangle {
        id: tab

        required property var modelData
        readonly property bool on: root.category === modelData.name

        width: tabText.implicitWidth + 18
        height: 24
        radius: 5
        color: on ? Theme.surface : "transparent"

        Text {
          id: tabText
          anchors.centerIn: parent
          text: root.shortNames[tab.modelData.name] || tab.modelData.name
          color: tab.on || tabArea.containsMouse ? Theme.text : Theme.dim
          font.family: Theme.font
          font.pixelSize: 12
        }

        Rectangle {
          visible: tab.on
          anchors.bottom: parent.bottom
          width: parent.width
          height: 2
          color: Theme.focus
        }

        MouseArea {
          id: tabArea
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.picked = tab.modelData.name
        }
      }
    }
  }

  Flickable {
    Layout.fillWidth: true
    Layout.fillHeight: true
    contentHeight: grid.height
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Grid {
      id: grid
      width: parent.width
      columns: 8
      spacing: 6

      Repeater {
        model: root.tiles

        Keycap {
          id: tile

          required property var modelData
          width: (grid.width - grid.spacing * (grid.columns - 1)) / grid.columns
          label: modelData.label
          current: root.current !== "" && modelData.token.toLowerCase() === root.current.toLowerCase()
          hover: tileArea.containsMouse

          MouseArea {
            id: tileArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            property point from
            property bool dragging: false
            onPressed: function(mouse) { from = Qt.point(mouse.x, mouse.y); dragging = false }
            onPositionChanged: function(mouse) {
              if (!pressed || root.ghost === null) return
              if (!dragging && Math.abs(mouse.x - from.x) + Math.abs(mouse.y - from.y) > 8) {
                dragging = true
                root.ghost.begin({ token: tile.modelData.token }, tile.modelData.label)
              }
              if (dragging) root.ghost.follow(this, mouse.x, mouse.y)
            }
            onReleased: {
              if (dragging) root.ghost.end()
              else root.app.assign(tile.modelData.token)
              dragging = false
            }
            onCanceled: {
              if (dragging) root.ghost.cancel()
              dragging = false
            }
          }
        }
      }
    }
  }
}
