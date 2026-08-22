import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Dice roller panel: three sections — Settings (sound + custom dice),
// Dice (roll buttons), Results (roll history). Clicking dice queues them and
// a 1.5s debounce rolls everything queued at once.
Panel {
  id: root
  moduleName: "crueber.rpgdice"
  ipcTarget: "crueber.rpgdice"
  manageIpc: false

  property var anchorItem: null
  property bool openedFromHotkey: false
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  function open() { openedFromHotkey = false; root.controller.show() }
  function openFromHotkey() { openedFromHotkey = true; root.controller.show() }
  function close() { root.controller.hide() }
  function toggle() { if (root.opened) root.close(); else root.openFromHotkey() }

  readonly property color fg: bar ? bar.foreground : Color.foreground
  readonly property string fontFam: bar ? bar.fontFamily : Style.font.family

  // ---- persisted state ----
  property bool soundEnabled: true
  property int volume: 60
  property var customDice: []

  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/omarchy/rpgdice"
  readonly property string stateFile: stateDir + "/state.json"

  // ---- dice ----
  readonly property var allDice: {
    var out = Model.STANDARD_DICE.concat([Model.FATE_DIE])
    for (var i = 0; i < customDice.length; i++) out.push(Model.customDie(customDice[i]))
    return out
  }

  // ---- roll queue (debounce) ----
  property var pending: []
  readonly property string pendingLabel: Model.pendingLabel(pending)

  // ---- results (newest first) ----
  property var history: []

  function queueDie(die) {
    pending = pending.concat([die])
    debounceTimer.restart()
  }

  function rollAll() {
    if (pending.length === 0) return
    var dice = pending
    pending = []
    var results = []
    var total = 0
    var allNumeric = true
    for (var i = 0; i < dice.length; i++) {
      var r = Model.rollDie(dice[i])
      results.push(r)
      if (r.value === null) allNumeric = false
      else total += r.value
    }
    history = [{ results: results, total: allNumeric ? total : null, time: Date.now() }]
      .concat(history).slice(0, 5)
    if (soundEnabled) playSound()
  }

  function playSound() {
    var path = Model.assetPath(Qt.resolvedUrl("assets/dice-roll.wav"))
    var vol = Math.round(volume / 100 * 65536)
    Util.execDetached("paplay --volume=" + vol + " " + Util.shellQuote(path))
  }

  function saveState() {
    var json = Model.serializeState({ soundEnabled: soundEnabled, volume: volume, customDice: customDice })
    Util.execDetached("mkdir -p " + Util.shellQuote(stateDir)
      + " && printf '%s' " + Util.shellQuote(json) + " > " + Util.shellQuote(stateFile))
  }

  // ---- custom dice form ----
  property string newName: ""
  property string newType: "numeric"
  property int newSides: 6
  property string newSidesText: ""
  property string formError: ""
  property bool addFormOpen: false

  function addCustomDie() {
    var name = Model.plainText(newName).replace(/^\s+|\s+$/g, "")
    if (name === "") { formError = "Enter a name"; return }
    for (var i = 0; i < customDice.length; i++)
      if (customDice[i].name === name) { formError = "Name already used"; return }
    if (newType === "sides") {
      var sides = Model.parseSides(newSidesText)
      if (sides.length === 0) { formError = "Enter at least one side"; return }
      customDice = customDice.concat([{ name: name, kind: "sides", sides: sides }])
    } else {
      var n = Math.round(newSides)
      if (n < 1 || n > 1000000) { formError = "Sides must be 1–1000000"; return }
      customDice = customDice.concat([{ name: name, kind: "numeric", sides: n }])
    }
    formError = ""
    newName = ""
    newSidesText = ""
    saveState()
  }

  function removeCustomDie(name) {
    var out = []
    for (var i = 0; i < customDice.length; i++)
      if (customDice[i].name !== name) out.push(customDice[i])
    customDice = out
    saveState()
  }

  FileView {
    id: stateView
    path: root.stateFile
    printErrors: false
    onLoaded: {
      var s = Model.parseState(text())
      root.soundEnabled = s.soundEnabled
      root.volume = s.volume
      root.customDice = s.customDice
    }
  }

  Timer {
    id: debounceTimer
    interval: 1500
    onTriggered: root.rollAll()
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()

      Column {
        id: content
        width: parent.width
        spacing: Style.spacing.md

        // ===================== Settings =====================
        PanelSectionHeader { text: "Settings"; foreground: root.fg; fontFamily: root.fontFam }

        Toggle {
          width: parent.width
          label: "Sound"
          description: "Play a sound when dice are rolled"
          checked: root.soundEnabled
          foreground: root.fg
          fontFamily: root.fontFam
          onClicked: { root.soundEnabled = !root.soundEnabled; root.saveState() }
        }

        Row {
          width: parent.width
          spacing: Style.spacing.md
          opacity: root.soundEnabled ? 1 : 0.4

          Text {
            text: "Volume"
            color: Qt.darker(root.fg, 1.4)
            font.family: root.fontFam
            font.pixelSize: Style.font.bodySmall
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(64)
          }

          PanelSlider {
            id: volSlider
            width: parent.width - Style.space(64) - Style.spacing.md
            bar: root.bar
            value: root.volume
            minimum: 0
            maximum: 100
            step: 1
            integer: true
            onMoved: function(v) { if (root.soundEnabled) root.volume = v }
            onReleased: function(v) { if (root.soundEnabled) { root.volume = v; root.saveState() } }
          }
        }

        PanelSeparator { foreground: root.fg }

        PanelSectionHeader { text: "Custom dice"; foreground: root.fg; fontFamily: root.fontFam }

        Button {
          width: parent.width
          leftAlign: true
          text: "Add custom die"
          iconText: root.addFormOpen ? "\uF0140" : "\uF0142"
          foreground: root.fg
          onClicked: root.addFormOpen = !root.addFormOpen
        }

        Column {
          visible: root.addFormOpen
          width: parent.width
          spacing: Style.spacing.md

          Row {
            width: parent.width
            spacing: Style.spacing.md

            TextField {
              id: nameField
              width: parent.width * 0.42
              placeholderText: "Name"
              text: root.newName
              foreground: root.fg
              onTextEdited: root.newName = text
            }

            Dropdown {
              id: typeDropdown
              width: parent.width * 0.58 - Style.spacing.md
              value: root.newType
              options: [
                { value: "numeric", label: "Numeric (dN)" },
                { value: "sides", label: "Explicit sides" }
              ]
              foreground: root.fg
              onChanged: function(v) { root.newType = v }
            }
          }

          NumberField {
            visible: root.newType === "numeric"
            label: "Sides (1–1000000)"
            value: root.newSides
            from: 1
            to: 1000000
            stepSize: 1
            foreground: root.fg
            onModified: function(v) { root.newSides = v }
          }

          TextField {
            visible: root.newType === "sides"
            width: parent.width
            placeholderText: "Sides, comma-separated (e.g. heads, tails)"
            text: root.newSidesText
            foreground: root.fg
            onTextEdited: root.newSidesText = text
          }

          Row {
            width: parent.width
            spacing: Style.spacing.md

            Button {
              text: "Add die"
              foreground: root.fg
              onClicked: root.addCustomDie()
            }

            Text {
              visible: root.formError !== ""
              text: root.formError
              color: Color.urgent
              font.family: root.fontFam
              font.pixelSize: Style.font.bodySmall
              anchors.verticalCenter: parent.verticalCenter
            }
          }
        }

        Repeater {
          model: root.customDice

          Row {
            required property var modelData
            width: parent.width
            spacing: Style.spacing.md

            Column {
              width: parent.width - removeBtn.width - parent.spacing
              spacing: Style.spacing.xxs
              anchors.verticalCenter: parent.verticalCenter

              Text {
                text: Model.plainText(modelData.name)
                textFormat: Text.PlainText
                color: root.fg
                font.family: root.fontFam
                font.pixelSize: Style.font.body
                font.bold: true
                elide: Text.ElideRight
                width: parent.width
              }

              Text {
                text: Model.describeDie(modelData)
                textFormat: Text.PlainText
                color: Qt.darker(root.fg, 1.5)
                font.family: root.fontFam
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
                width: parent.width
              }
            }

            PanelActionButton {
              id: removeBtn
              iconText: "×"
              tooltipText: "Remove"
              foreground: root.fg
              hoverColor: Color.urgent
              anchors.verticalCenter: parent.verticalCenter
              onClicked: root.removeCustomDie(modelData.name)
            }
          }
        }

        PanelSeparator { foreground: root.fg }

        // ===================== Dice =====================
        PanelSectionHeader { text: "Dice"; foreground: root.fg; fontFamily: root.fontFam }

        Grid {
          id: diceGrid
          width: parent.width
          columns: 4
          spacing: Style.spacing.sm

          Repeater {
            model: root.allDice

            Button {
              required property var modelData
              width: (diceGrid.width - diceGrid.spacing * (diceGrid.columns - 1)) / diceGrid.columns
              text: Model.plainText(modelData.label)
              foreground: root.fg
              onClicked: root.queueDie(modelData)
            }
          }
        }

        Text {
          visible: root.pending.length > 0
          text: "Rolling: " + root.pendingLabel
          textFormat: Text.PlainText
          color: Color.accent
          font.family: root.fontFam
          font.pixelSize: Style.font.bodySmall
        }

        PanelSeparator { foreground: root.fg }

        // ===================== Results =====================
        PanelSectionHeader { text: "Results"; foreground: root.fg; fontFamily: root.fontFam }

        Text {
          visible: root.history.length === 0
          text: "No rolls yet"
          color: Qt.darker(root.fg, 1.5)
          font.family: root.fontFam
          font.pixelSize: Style.font.bodySmall
          font.italic: true
        }

        Repeater {
          model: root.history

          Column {
            required property var modelData
            width: parent.width
            spacing: Style.spacing.xs

            Row {
              width: parent.width
              spacing: Style.spacing.sm

              Text {
                text: Model.groupLabel(modelData)
                textFormat: Text.PlainText
                color: root.fg
                font.family: root.fontFam
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
                width: parent.width - (modelData.total !== null ? Style.space(70) : 0)
              }

              Text {
                visible: modelData.total !== null
                text: "= " + modelData.total
                color: Color.accent
                font.family: root.fontFam
                font.pixelSize: Style.font.body
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter
              }
            }
          }
        }
      }
    }
  }
}
