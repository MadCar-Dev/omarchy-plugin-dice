import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Dice.js" as Dice

// Dice roller panel: formula box (with macros, coming) and dice buttons that
// roll immediately on click, plus Settings (sound + custom dice) and Results
// (per-die roll history) sections.
Panel {
  id: root
  moduleName: "madcar.dice"
  ipcTarget: "madcar.dice"
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

  // ---- persisted state (schema v2, see Model.js) ----
  property bool soundEnabled: true
  property int volume: 60
  property var customDice: []
  property var macros: []
  property var recent: []

  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/omarchy/dice"
  readonly property string stateFile: stateDir + "/state.json"
  // First-run import source: the crueber.rpgdice state this plugin was forked from.
  readonly property string legacyStateFile: Quickshell.env("HOME") + "/.local/state/omarchy/rpgdice/state.json"

  function isValidFormula(text) { return Dice.parse(text).ok }

  // ---- dice ----
  readonly property var allDice: {
    var out = Model.STANDARD_DICE.concat([Model.FATE_DIE])
    for (var i = 0; i < customDice.length; i++) out.push(Model.customDie(customDice[i]))
    return out
  }

  // ---- results (newest first) ----
  property var history: []

  readonly property int maxHistory: 10

  property string formulaText: ""
  property string formulaError: ""
  property int recentIndex: -1   // -1 = editing a fresh formula; 0.. = browsing recent

  function pushHistory(entry) {
    history = [entry].concat(history).slice(0, maxHistory)
    if (soundEnabled) playSound()
  }

  // One die's label: compound faces "6+6+2", Fate "- 0 +", plus "!" when exploded.
  function dieText(die, term) {
    var s
    if (die.faces) s = die.faces.join("+")
    else if (term.fate) s = Dice.fateFace(die.value)
    else s = String(die.value)
    if (die.exploded) s += "!"
    return s
  }

  function dieColor(die) {
    if (!die.kept) return Qt.darker(root.fg, 1.8)
    if (die.exploded) return Color.accent
    return root.fg
  }

  // Evaluate a formula and record it. source: "formula" | "macro:<name>" | "die:<label>"
  function rollFormula(text, source) {
    // Not Model.plainText: it strips '<'/'>', which are dice notation
    // (reroll/explode compares). Dice.parse (a whitelist grammar) validates
    // the formula instead, and results render with textFormat: Text.PlainText.
    var t = String(text === null || text === undefined ? "" : text).replace(/^\s+|\s+$/g, "")
    var r = Dice.evaluate(t, Dice.defaultRng)
    if (!r.ok) {
      formulaError = r.error + (r.column > 0 ? " at " + r.column : "")
      return false
    }
    formulaError = ""
    pushHistory({ formula: t, total: r.result.total, raw: r.result.raw, terms: r.result.terms, time: Date.now(), source: source })
    if (source === "formula") {
      recent = Model.pushRecent(recent, t)
      recentIndex = -1
      saveState()
    }
    return true
  }

  function submitFormula() {
    if (rollFormula(formulaText, "formula")) formulaText = ""
  }

  // Dice buttons roll immediately. Numeric dice go through the formula path
  // (so d20 becomes "1d20"); Fate rolls the standard 4dF; explicit-sides
  // custom dice keep their faces-only result.
  function rollDieButton(die) {
    if (die.kind === "fate") { rollFormula("4dF", "die:dF"); return }
    if (die.kind === "numeric") { rollFormula("1d" + die.sides, "die:" + die.label); return }
    var r = Model.rollDie(die)
    pushHistory({
      formula: Model.plainText(die.label), total: null, raw: null, time: Date.now(), source: "die:" + die.label,
      terms: [{ text: Model.plainText(die.label), sides: "custom", fate: false, total: null,
                trace: [{ value: Model.plainText(r.display), kept: true, rerolled: false, exploded: false }] }]
    })
  }

  // Up/Down in the formula box walk the recent list.
  function recentStep(delta) {
    if (recent.length === 0) return
    var idx = recentIndex + delta
    if (idx < -1) idx = -1
    if (idx >= recent.length) idx = recent.length - 1
    recentIndex = idx
    formulaText = idx === -1 ? "" : recent[idx]
  }

  function playSound() {
    var path = Model.assetPath(Qt.resolvedUrl("assets/dice-roll.wav"))
    var vol = Math.round(volume / 100 * 65536)
    Util.execDetached("paplay --volume=" + vol + " " + Util.shellQuote(path))
  }

  function saveState() {
    var json = Model.serializeState({
      soundEnabled: soundEnabled, volume: volume, customDice: customDice, macros: macros, recent: recent
    })
    Util.execDetached("mkdir -p " + Util.shellQuote(stateDir)
      + " && t=$(mktemp -p " + Util.shellQuote(stateDir) + " .state.XXXXXX)"
      + " && printf '%s' " + Util.shellQuote(json) + " > \"$t\""
      + " && mv -f \"$t\" " + Util.shellQuote(stateFile))
  }

  // ---- custom dice form ----
  property string newName: ""
  property string newType: "numeric"
  property int newSides: 6
  property string newSidesText: ""
  property string formError: ""
  property bool addFormOpen: false

  // ---- macros form ----
  property string newMacroName: ""
  property string newMacroFormula: ""
  property string macroError: ""
  property bool settingsOpen: false

  function addMacro() {
    var name = Model.plainText(newMacroName).replace(/^\s+|\s+$/g, "")
    // Not Model.plainText on the formula — see rollFormula.
    var formula = String(newMacroFormula === null || newMacroFormula === undefined ? "" : newMacroFormula).replace(/^\s+|\s+$/g, "")
    if (name === "") { macroError = "Enter a name"; return }
    if (name.length > Model.MAX_MACRO_NAME) { macroError = "Name is limited to " + Model.MAX_MACRO_NAME + " characters"; return }
    for (var i = 0; i < macros.length; i++)
      if (macros[i].name === name) { macroError = "Name already used"; return }
    if (macros.length >= Model.MAX_MACROS) { macroError = "At most " + Model.MAX_MACROS + " macros"; return }
    var p = Dice.parse(formula)
    if (!p.ok) { macroError = p.error + (p.column > 0 ? " at " + p.column : ""); return }
    macros = macros.concat([{ name: name, formula: formula }])
    macroError = ""
    newMacroName = ""
    newMacroFormula = ""
    saveState()
  }

  function removeMacro(name) {
    var out = []
    for (var i = 0; i < macros.length; i++)
      if (macros[i].name !== name) out.push(macros[i])
    macros = out
    saveState()
  }

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

  function applyState(raw) {
    var s = Model.parseState(raw, root.isValidFormula)
    root.soundEnabled = s.soundEnabled
    root.volume = s.volume
    root.customDice = s.customDice
    root.macros = s.macros
    root.recent = s.recent
  }

  // Bounded read of state.json (see AGENTS.md): one dd open with
  // iflag=nofollow,nonblock under `timeout`, capped at MAX_STATE_BYTES + 1.
  // The legacy rpgdice import only runs when the new state file is absent —
  // existence is tested with `-e` *before* attempting the read, so an
  // existing-but-unreadable new file never falls through to the legacy
  // import. Output carries one marker byte:
  //   N - new file exists, read succeeded (bytes follow)      -> apply
  //   E - new file exists, read failed/empty                  -> apply defaults, no save
  //   L - new file absent, legacy file read (bytes follow)     -> apply + save (import)
  //   (none) - neither file exists                             -> apply defaults, no save
  // Note: `-e` on a symlink to a missing target is false, and a symlink to
  // an existing file is refused by iflag=nofollow — both land on E, so
  // nothing is ever written from a symlinked state.json.
  Process {
    id: stateLoader
    command: ["bash", "-c",
      'r() { timeout ' + Model.STATE_READ_TIMEOUT_SECS
      + ' dd if="$1" iflag=nofollow,nonblock bs=' + (Model.MAX_STATE_BYTES + 1)
      + ' count=1 status=none 2>/dev/null; }; '
      + 'if [ -e "$1" ]; then out=$(r "$1"); if [ -n "$out" ]; then printf "N%s" "$out"; else printf "E"; fi; '
      + 'else out=$(r "$2"); if [ -n "$out" ]; then printf "L%s" "$out"; fi; fi',
      "_", root.stateFile, root.legacyStateFile]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var t = String(text || "")
        var source = t.charAt(0)
        var raw = t.slice(1)
        if (raw.length > Model.MAX_STATE_BYTES) raw = ""
        if (source === "E") { root.applyState(""); return }
        root.applyState(raw)
        if (source === "L") root.saveState()
      }
    }
    Component.onCompleted: running = true
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: formulaField
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: formulaField.activeFocus || nameField.activeFocus || macroNameField.activeFocus
        || macroFormulaField.activeFocus || sidesField.activeFocus
      onCloseRequested: root.close()

      Column {
        id: content
        width: parent.width
        spacing: Style.spacing.md

        // ===================== Formula =====================
        TextField {
          id: formulaField
          width: parent.width
          placeholderText: "2d20kh1 + 5"
          text: root.formulaText
          foreground: root.fg
          onTextEdited: { root.formulaText = text; root.recentIndex = -1 }
          onAccepted: root.submitFormula()
          Keys.onUpPressed: root.recentStep(1)
          Keys.onDownPressed: root.recentStep(-1)
          Keys.onEscapePressed: root.close()
        }

        Text {
          visible: root.formulaError !== ""
          width: parent.width
          text: root.formulaError
          textFormat: Text.PlainText
          color: Color.urgent
          font.family: root.fontFam
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        PanelSeparator { foreground: root.fg }

        // ===================== Macros =====================
        PanelSectionHeader { text: "Macros"; foreground: root.fg; fontFamily: root.fontFam }

        Text {
          visible: root.macros.length === 0
          text: "No macros yet — add one in Settings"
          color: Qt.darker(root.fg, 1.5)
          font.family: root.fontFam
          font.pixelSize: Style.font.bodySmall
          font.italic: true
        }

        Grid {
          id: macroGrid
          visible: root.macros.length > 0
          width: parent.width
          columns: 3
          spacing: Style.spacing.sm

          Repeater {
            model: root.macros

            Button {
              required property var modelData
              width: (macroGrid.width - macroGrid.spacing * (macroGrid.columns - 1)) / macroGrid.columns
              text: Model.plainText(modelData.name)
              tooltipText: Model.plainText(modelData.formula)
              foreground: root.fg
              onClicked: root.rollFormula(modelData.formula, "macro:" + modelData.name)
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
              onClicked: root.rollDieButton(modelData)
            }
          }
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
            id: entryItem
            required property var modelData
            readonly property var entry: modelData
            width: parent.width
            spacing: Style.spacing.xxs

            Row {
              width: parent.width
              spacing: Style.spacing.sm

              Text {
                text: entryItem.entry.formula
                textFormat: Text.PlainText
                color: root.fg
                font.family: root.fontFam
                font.pixelSize: Style.font.body
                elide: Text.ElideRight
                width: parent.width - (entryItem.entry.total !== null ? Style.space(70) : 0) - parent.spacing
              }

              Text {
                visible: entryItem.entry.total !== null
                text: "= " + entryItem.entry.total
                color: Color.accent
                font.family: root.fontFam
                font.pixelSize: Style.font.body
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter
              }
            }

            Repeater {
              model: entryItem.entry.terms

              Flow {
                id: termItem
                required property var modelData
                readonly property var term: modelData
                width: parent.width
                spacing: Style.spacing.xs

                Text {
                  visible: entryItem.entry.terms.length > 1 || termItem.term.text !== entryItem.entry.formula
                  text: termItem.term.text + ":"
                  textFormat: Text.PlainText
                  color: Qt.darker(root.fg, 1.5)
                  font.family: root.fontFam
                  font.pixelSize: Style.font.bodySmall
                }

                Repeater {
                  model: termItem.term.trace

                  Text {
                    required property var modelData
                    text: root.dieText(modelData, termItem.term)
                    textFormat: Text.PlainText
                    color: root.dieColor(modelData)
                    font.family: root.fontFam
                    font.pixelSize: Style.font.bodySmall
                    font.strikeout: !modelData.kept
                  }
                }
              }
            }
          }
        }

        PanelSeparator { foreground: root.fg }

        // ===================== Settings (collapsed) =====================
        Button {
          width: parent.width
          leftAlign: true
          text: "Settings"
          iconText: root.settingsOpen ? "\uF0140" : "\uF0142"
          foreground: root.fg
          onClicked: root.settingsOpen = !root.settingsOpen
        }

        Column {
          visible: root.settingsOpen
          width: parent.width
          spacing: Style.spacing.md

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

          PanelSectionHeader { text: "Macros"; foreground: root.fg; fontFamily: root.fontFam }

          Row {
            width: parent.width
            spacing: Style.spacing.md

            TextField {
              id: macroNameField
              width: parent.width * 0.38
              placeholderText: "Name"
              text: root.newMacroName
              foreground: root.fg
              onTextEdited: root.newMacroName = text
              onAccepted: root.addMacro()
              Keys.onEscapePressed: root.close()
            }

            TextField {
              id: macroFormulaField
              width: parent.width * 0.62 - Style.spacing.md
              placeholderText: "Formula, e.g. 2d20kh1"
              text: root.newMacroFormula
              foreground: root.fg
              onTextEdited: root.newMacroFormula = text
              onAccepted: root.addMacro()
              Keys.onEscapePressed: root.close()
            }
          }

          Row {
            width: parent.width
            spacing: Style.spacing.md

            Button {
              text: "Add macro"
              foreground: root.fg
              onClicked: root.addMacro()
            }

            Text {
              visible: root.macroError !== ""
              text: root.macroError
              textFormat: Text.PlainText
              color: Color.urgent
              font.family: root.fontFam
              font.pixelSize: Style.font.bodySmall
              anchors.verticalCenter: parent.verticalCenter
            }
          }

          Repeater {
            model: root.macros

            Row {
              required property var modelData
              width: parent.width
              spacing: Style.spacing.md

              Column {
                width: parent.width - removeMacroBtn.width - parent.spacing
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
                  text: Model.plainText(modelData.formula)
                  textFormat: Text.PlainText
                  color: Qt.darker(root.fg, 1.5)
                  font.family: root.fontFam
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                  width: parent.width
                }
              }

              PanelActionButton {
                id: removeMacroBtn
                iconText: "×"
                tooltipText: "Remove"
                foreground: root.fg
                hoverColor: Color.urgent
                anchors.verticalCenter: parent.verticalCenter
                onClicked: root.removeMacro(modelData.name)
              }
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
                Keys.onEscapePressed: root.close()
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
              id: sidesField
              visible: root.newType === "sides"
              width: parent.width
              placeholderText: "Sides, comma-separated (e.g. heads, tails)"
              text: root.newSidesText
              foreground: root.fg
              onTextEdited: root.newSidesText = text
              Keys.onEscapePressed: root.close()
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
        }
      }
    }
  }
}
