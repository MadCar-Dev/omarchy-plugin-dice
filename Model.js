// Pure dice logic for the RPG dice widget. No QML imports — plain JS so the
// same functions are shared between the bar widget and the panel.

// Standard polyhedral set. d% is the percentile die (1..100).
var STANDARD_DICE = [
  { id: "d4",   label: "d4",  kind: "numeric", sides: 4 },
  { id: "d6",   label: "d6",  kind: "numeric", sides: 6 },
  { id: "d8",   label: "d8",  kind: "numeric", sides: 8 },
  { id: "d10",  label: "d10", kind: "numeric", sides: 10 },
  { id: "d12",  label: "d12", kind: "numeric", sides: 12 },
  { id: "d20",  label: "d20", kind: "numeric", sides: 20 },
  { id: "d100", label: "d%",  kind: "numeric", sides: 100 }
]

// Fate die: two "-", two blank, two "+".
var FATE_FACES = ["-", "", "+", "-", "", "+"]
var FATE_DIE = { id: "dF", label: "dF", kind: "fate" }

function rollNumeric(sides) {
  return Math.floor(Math.random() * sides) + 1
}

function rollFate() {
  return FATE_FACES[Math.floor(Math.random() * FATE_FACES.length)]
}

function rollSides(sides) {
  return sides[Math.floor(Math.random() * sides.length)]
}

// Roll one die → { label, display, value }. `value` is the numeric
// contribution; fate and explicit-sides dice are non-additive (value null),
// so they only show the face rolled.
function rollDie(die) {
  if (die.kind === "fate") {
    var face = rollFate()
    return { label: die.label, display: face, value: null }
  }
  if (die.kind === "sides") {
    var s = rollSides(die.sides)
    return { label: die.label, display: String(s), value: null }
  }
  var v = rollNumeric(die.sides)
  return { label: die.label, display: String(v), value: v }
}

// Split a user-entered sides string on commas or newlines, trimming blanks.
function parseSides(text) {
  var parts = String(text || "").split(/[\n,]+/)
  var out = []
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].replace(/^\s+|\s+$/g, "")
    if (p !== "") out.push(p)
  }
  return out
}

// Strip characters that could smuggle rich-text markup into Text elements.
function plainText(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[<>&]/g, "")
}

// Convert a resolved file:// URL to a filesystem path.
function assetPath(url) {
  var s = String(url || "")
  if (s.indexOf("file://") === 0) s = s.slice(7)
  try { return decodeURIComponent(s) } catch (e) { return s }
}

// ---- state ----

// Schema v2. v1 files (no `version`, no macros/recent) load as v2 with
// empty macros and recent lists.
var DEFAULT_STATE = { version: 2, soundEnabled: true, volume: 60, customDice: [], macros: [], recent: [] }

// Hard bounds on persisted state. The file is a tiny config blob, so anything
// beyond these limits is garbage — refusing to grow the in-memory model past
// them keeps a corrupt or oversized state.json from forcing unbounded
// allocation in the long-lived shell.
var MAX_STATE_BYTES = 65536
var MAX_CUSTOM_DICE = 128
var MAX_SIDES = 256
var MAX_MACROS = 64
var MAX_MACRO_NAME = 32
var MAX_FORMULA = 200
var MAX_RECENT = 20
// dd open/read deadline (seconds) for state.json — bounds a stalled read.
var STATE_READ_TIMEOUT_SECS = 5

function clampVolume(v) {
  var n = Number(v)
  if (!isFinite(n)) return 60
  return Math.max(0, Math.min(100, Math.round(n)))
}

function trim(s) { return String(s).replace(/^\s+|\s+$/g, "") }

function sanitizeCustomDice(list) {
  if (!Array.isArray(list)) return []
  var out = []
  for (var i = 0; i < list.length && out.length < MAX_CUSTOM_DICE; i++) {
    var d = list[i]
    if (!d || typeof d !== "object") continue
    var name = trim(plainText(d.name))
    if (!name) continue
    if (d.kind === "sides") {
      var src = Array.isArray(d.sides) ? d.sides : []
      var sides = []
      for (var s = 0; s < src.length && sides.length < MAX_SIDES; s++)
        sides.push(plainText(src[s]))
      if (sides.length === 0) continue
      out.push({ name: name, kind: "sides", sides: sides })
    } else {
      var n = Number(d.sides)
      if (!isFinite(n) || n < 1 || n > 1000000) continue
      out.push({ name: name, kind: "numeric", sides: Math.round(n) })
    }
  }
  return out
}

// Macros: { name, formula }. `isValid(formula)` is injected (Dice.parse in
// the panel) so this file stays free of QML imports and testable alone.
function sanitizeMacros(list, isValid) {
  if (!Array.isArray(list)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < list.length && out.length < MAX_MACROS; i++) {
    var m = list[i]
    if (!m || typeof m !== "object") continue
    var name = trim(plainText(m.name)).slice(0, MAX_MACRO_NAME)
    if (!name || seen[name]) continue
    var formula = typeof m.formula === "string" ? trim(m.formula) : ""
    if (!formula || formula.length > MAX_FORMULA || !isValid(formula)) continue
    seen[name] = true
    out.push({ name: name, formula: formula })
  }
  return out
}

function sanitizeRecent(list, isValid) {
  if (!Array.isArray(list)) return []
  var out = []
  for (var i = 0; i < list.length && out.length < MAX_RECENT; i++) {
    var f = list[i]
    if (typeof f !== "string") continue
    f = trim(f)
    if (!f || f.length > MAX_FORMULA || !isValid(f)) continue
    out.push(f)
  }
  return out
}

// Newest first, no duplicates, at most MAX_RECENT.
function pushRecent(recent, formula) {
  var out = [formula]
  for (var i = 0; i < recent.length && out.length < MAX_RECENT; i++)
    if (recent[i] !== formula) out.push(recent[i])
  return out
}

function parseState(raw, isValid) {
  var s = DEFAULT_STATE
  try {
    var parsed = JSON.parse(String(raw || ""))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      s = {
        version: 2,
        soundEnabled: parsed.soundEnabled !== false,
        volume: clampVolume(parsed.volume),
        customDice: sanitizeCustomDice(parsed.customDice),
        macros: sanitizeMacros(parsed.macros, isValid),
        recent: sanitizeRecent(parsed.recent, isValid)
      }
    }
  } catch (e) {}
  return s
}

function serializeState(s) {
  return JSON.stringify({
    version: 2,
    soundEnabled: s.soundEnabled === true,
    volume: clampVolume(s.volume),
    customDice: s.customDice || [],
    macros: s.macros || [],
    recent: s.recent || []
  })
}

// A rollable die object for a stored custom-die definition.
function customDie(def) {
  if (def.kind === "sides")
    return { id: "custom:" + def.name, label: def.name, kind: "sides", sides: def.sides }
  return { id: "custom:" + def.name, label: def.name, kind: "numeric", sides: def.sides }
}

// Human description of a custom die for the settings list.
function describeDie(def) {
  if (def.kind === "sides") return def.sides.length + " sides: " + def.sides.join(", ")
  return "d" + def.sides
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STANDARD_DICE: STANDARD_DICE, FATE_DIE: FATE_DIE, rollDie: rollDie, parseSides: parseSides,
    plainText: plainText, assetPath: assetPath, DEFAULT_STATE: DEFAULT_STATE,
    MAX_STATE_BYTES: MAX_STATE_BYTES, MAX_CUSTOM_DICE: MAX_CUSTOM_DICE, MAX_SIDES: MAX_SIDES,
    MAX_MACROS: MAX_MACROS, MAX_MACRO_NAME: MAX_MACRO_NAME, MAX_FORMULA: MAX_FORMULA, MAX_RECENT: MAX_RECENT,
    STATE_READ_TIMEOUT_SECS: STATE_READ_TIMEOUT_SECS, clampVolume: clampVolume,
    sanitizeCustomDice: sanitizeCustomDice, sanitizeMacros: sanitizeMacros, sanitizeRecent: sanitizeRecent,
    pushRecent: pushRecent, parseState: parseState, serializeState: serializeState,
    customDie: customDie, describeDie: describeDie
  }
}
