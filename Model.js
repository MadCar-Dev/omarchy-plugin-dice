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

var DEFAULT_STATE = { soundEnabled: true, volume: 60, customDice: [] }

function clampVolume(v) {
  var n = Number(v)
  if (!isFinite(n)) return 60
  return Math.max(0, Math.min(100, Math.round(n)))
}

function sanitizeCustomDice(list) {
  if (!Array.isArray(list)) return []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var d = list[i]
    if (!d || typeof d !== "object") continue
    var name = plainText(d.name).replace(/^\s+|\s+$/g, "")
    if (!name) continue
    if (d.kind === "sides") {
      var sides = Array.isArray(d.sides) ? d.sides.map(function (x) { return plainText(x) }) : []
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

function parseState(raw) {
  var s = DEFAULT_STATE
  try {
    var parsed = JSON.parse(String(raw || ""))
    if (parsed && typeof parsed === "object") {
      s = {
        soundEnabled: parsed.soundEnabled !== false,
        volume: clampVolume(parsed.volume),
        customDice: sanitizeCustomDice(parsed.customDice)
      }
    }
  } catch (e) {}
  return s
}

function serializeState(s) {
  return JSON.stringify({
    soundEnabled: s.soundEnabled === true,
    volume: clampVolume(s.volume),
    customDice: s.customDice || []
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

// "d20 + d6" for the pending queue.
function pendingLabel(pending) {
  var parts = []
  for (var i = 0; i < pending.length; i++) parts.push(pending[i].label)
  return parts.join(" + ")
}

// "d6: 3, 4, 5   d8: 8" — same-type dice grouped, values comma-separated.
function groupLabel(group) {
  var labels = []
  var buckets = []
  for (var i = 0; i < group.results.length; i++) {
    var r = group.results[i]
    var idx = labels.indexOf(r.label)
    if (idx === -1) {
      labels.push(r.label)
      buckets.push([])
      idx = buckets.length - 1
    }
    buckets[idx].push(r.display)
  }
  var parts = []
  for (var j = 0; j < labels.length; j++)
    parts.push(labels[j] + ": " + buckets[j].join(", "))
  return parts.join("   ")
}
