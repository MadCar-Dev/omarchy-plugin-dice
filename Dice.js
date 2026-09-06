// Dice.js — Roll20 / FoundryVTT dice notation: parser, roller, formatter.
// Pure JS with no QML imports so the same file runs under node for tests.
// Nothing here throws to callers: parse() and evaluate() return
// { ok: false, error, column } on any failure.

var LIMITS = {
  maxLength: 200,      // characters of formula text
  maxDice: 1000,       // dice in one term, after rerolls and explosions
  maxSides: 1000000,   // matches the custom-die cap in Model.js
  maxIterations: 100,  // reroll + explode budget per starting die
  maxDepth: 16         // nested parentheses
}

// rng(sides) -> integer in 1..sides
function defaultRng(sides) {
  return Math.floor(Math.random() * sides) + 1
}

// ---- parser -------------------------------------------------------------

function Parser(text) {
  this.s = text
  this.i = 0
  this.depth = 0
}

Parser.prototype.peek = function (n) { return this.s.substr(this.i, n || 1) }
Parser.prototype.peekLower = function () { return this.peek().toLowerCase() }
Parser.prototype.skipWs = function () {
  while (this.i < this.s.length && /\s/.test(this.s.charAt(this.i))) this.i++
}
Parser.prototype.fail = function (msg, column) {
  throw { dice: true, error: msg, column: (column === undefined ? this.i : column) + 1 }
}
Parser.prototype.integer = function () {
  var m = /^\d+/.exec(this.s.slice(this.i))
  if (!m) return null
  this.i += m[0].length
  return parseInt(m[0], 10)
}

Parser.prototype.factor = function () {
  this.skipWs()
  var c = this.peek()
  var start = this.i
  if (c === "(") {
    if (++this.depth > LIMITS.maxDepth) this.fail("Too many nested parentheses")
    this.i++
    var inner = this.expr()
    this.skipWs()
    if (this.peek() !== ")") this.fail("Expected )")
    this.i++
    this.depth--
    return inner
  }
  if (c === "-") {
    this.i++
    return { type: "neg", expr: this.factor() }
  }
  if (c.toLowerCase() === "d") return this.dice(1, start)
  var n = this.integer()
  if (n === null) {
    if (c === "") this.fail("Unexpected end of formula")
    this.fail('Unexpected "' + c + '"')
  }
  if (this.peekLower() === "d") return this.dice(n, start)
  return { type: "num", value: n }
}

Parser.prototype.term = function () {
  var left = this.factor()
  for (;;) {
    this.skipWs()
    var c = this.peek()
    if (c !== "*" && c !== "/") return left
    this.i++
    left = { type: "bin", op: c, left: left, right: this.factor() }
  }
}

Parser.prototype.expr = function () {
  var left = this.term()
  for (;;) {
    this.skipWs()
    var c = this.peek()
    if (c !== "+" && c !== "-") return left
    this.i++
    left = { type: "bin", op: c, left: left, right: this.term() }
  }
}

// dice := [count] 'd' (integer | '%' | 'F') modifier*   (cursor is on the 'd')
Parser.prototype.dice = function (count, start) {
  this.i++
  var node = { type: "dice", count: count, sides: 0, fate: false, keep: null, explode: null, reroll: null, text: "" }
  var c = this.peekLower()
  if (c === "%") { this.i++; node.sides = 100 }
  else if (c === "f") { this.i++; node.fate = true; node.sides = 3 }
  else {
    var n = this.integer()
    if (n === null) this.fail("Expected die size after d")
    node.sides = n
  }
  if (count < 1) this.fail("Roll at least one die", start)
  if (count > LIMITS.maxDice) this.fail("At most " + LIMITS.maxDice + " dice per term", start)
  if (!node.fate && node.sides < 1) this.fail("Die size must be at least 1", start)
  if (node.sides > LIMITS.maxSides) this.fail("Die size at most " + LIMITS.maxSides, start)
  this.modifiers(node, start)
  node.text = this.s.slice(start, this.i)
  return node
}

// modifier := keep | explode | reroll  (explode/reroll parsing lands in Tasks 5-6)
Parser.prototype.modifiers = function (node, start) {
  for (;;) {
    var c = this.peekLower()
    if (c === "k" || c === "d") this.keepModifier(node, c)
    else if (c === "r") this.rerollModifier(node)
    else if (c === "!") this.explodeModifier(node)
    else break
  }
  if (node.fate && (node.explode || node.reroll)) this.fail("Fate dice cannot explode or reroll", start)
}

// keep := ('kh'|'kl'|'dh'|'dl'|'k'|'d') [integer]; bare k = kh, bare d = dl
Parser.prototype.keepModifier = function (node, c) {
  if (node.keep) this.fail("Only one keep/drop modifier per term")
  var at = this.i
  this.i++
  var side = this.peekLower()
  var mode
  if (side === "h" || side === "l") { this.i++; mode = c + side }
  else mode = c === "k" ? "kh" : "dl"
  var n = this.integer()
  if (n === null) n = 1
  if (n < 1) this.fail("Keep/drop count must be at least 1", at)
  node.keep = { mode: mode, count: n }
}

// compare := ['>'|'<'|'>='|'<='|'='] integer ; a bare integer means '='.
// required=false returns null when no compare follows.
Parser.prototype.compare = function (required, what) {
  var op = "="
  var two = this.peek(2)
  var one = this.peek()
  if (two === ">=" || two === "<=") { op = two; this.i += 2 }
  else if (one === ">" || one === "<" || one === "=") { op = one; this.i += 1 }
  else if (!/^\d/.test(one)) {
    if (required) this.fail("Expected a number after " + what)
    return null
  }
  var n = this.integer()
  if (n === null) this.fail("Expected a number after " + what)
  return { op: op, value: n }
}

// reroll := ('r' | 'ro') compare
Parser.prototype.rerollModifier = function (node) {
  if (node.reroll) this.fail("Only one reroll modifier per term")
  this.i++
  var once = false
  if (this.peekLower() === "o") { this.i++; once = true }
  node.reroll = { once: once, cmp: this.compare(true, once ? "ro" : "r") }
}

// explode := '!' ['!' | 'p'] [compare]
Parser.prototype.explodeModifier = function (node) {
  if (node.explode) this.fail("Only one explode modifier per term")
  this.i++
  var kind = "!"
  if (this.peek() === "!") { this.i++; kind = "!!" }
  else if (this.peekLower() === "p") { this.i++; kind = "!p" }
  node.explode = { kind: kind, cmp: this.compare(false, "!") }
}

function parse(text) {
  var s = String(text === null || text === undefined ? "" : text)
  if (s.length > LIMITS.maxLength)
    return { ok: false, error: "Formula longer than " + LIMITS.maxLength + " characters", column: LIMITS.maxLength + 1 }
  var p = new Parser(s)
  try {
    p.skipWs()
    if (p.i >= s.length) p.fail("Enter a formula", 0)
    var ast = p.expr()
    p.skipWs()
    if (p.i < s.length) p.fail('Unexpected "' + s.charAt(p.i) + '"')
    return { ok: true, ast: ast, text: s }
  } catch (e) {
    if (e && e.dice) return { ok: false, error: e.error, column: e.column }
    return { ok: false, error: "Could not parse formula", column: 1 }
  }
}

// ---- roller -------------------------------------------------------------

function evalNode(node, rng, terms) {
  switch (node.type) {
    case "num": return node.value
    case "neg": return -evalNode(node.expr, rng, terms)
    case "dice": {
      var t = rollDiceTerm(node, rng)
      terms.push(t)
      return t.total
    }
    case "bin": {
      var l = evalNode(node.left, rng, terms)
      var r = evalNode(node.right, rng, terms)
      if (node.op === "+") return l + r
      if (node.op === "-") return l - r
      if (node.op === "*") return l * r
      if (r === 0) throw { dice: true, error: "Division by zero", column: 0 }
      return l / r
    }
  }
  throw { dice: true, error: "Bad formula node", column: 0 }
}

function rollFace(node, rng) {
  var v = rng(node.sides)
  return node.fate ? v - 2 : v
}

function entry(value) {
  return { value: value, kept: true, rerolled: false, exploded: false }
}

// Mark dropped dice among the still-kept entries. Sort indexes by value so
// ties resolve in roll order and only `count` dice change state.
function applyKeep(trace, keep) {
  var idx = []
  for (var i = 0; i < trace.length; i++) if (trace[i].kept) idx.push(i)
  idx.sort(function (a, b) { return trace[a].value - trace[b].value || a - b })
  var n = Math.min(keep.count, idx.length)
  var drop
  if (keep.mode === "kh") drop = idx.slice(0, idx.length - n)
  else if (keep.mode === "kl") drop = idx.slice(n)
  else if (keep.mode === "dh") drop = idx.slice(idx.length - n)
  else drop = idx.slice(0, n)
  for (var d = 0; d < drop.length; d++) trace[drop[d]].kept = false
}

function matches(cmp, value) {
  switch (cmp.op) {
    case ">": return value > cmp.value
    case "<": return value < cmp.value
    case ">=": return value >= cmp.value
    case "<=": return value <= cmp.value
    default: return value === cmp.value
  }
}

function limitError(msg) {
  return { dice: true, error: msg, column: 0 }
}

function rollDiceTerm(node, rng) {
  var trace = []
  var budget = 0   // reroll + explode steps for the current starting die

  function spend() {
    if (trace.length >= LIMITS.maxDice) throw limitError("Too many dice in one term")
    if (++budget > LIMITS.maxIterations) throw limitError("Reroll/explode limit reached")
  }

  // Roll one die, applying rerolls. Rerolled faces are pushed as dropped
  // entries so the trace shows the chain; the final face is returned.
  function rollOne() {
    var v = rollFace(node, rng)
    if (node.reroll) {
      while (matches(node.reroll.cmp, v)) {
        spend()
        trace.push({ value: v, kept: false, rerolled: true, exploded: false })
        v = rollFace(node, rng)
        if (node.reroll.once) break
      }
    }
    return v
  }

  var ex = node.explode
  var exCmp = ex ? (ex.cmp || { op: "=", value: node.sides }) : null

  for (var i = 0; i < node.count; i++) {
    budget = 0
    var v = rollOne()
    if (!ex) { trace.push(entry(v)); continue }

    if (ex.kind === "!!") {
      var faces = [v]
      var sum = v
      var last = v
      while (matches(exCmp, last)) {
        spend()
        last = rollOne()
        faces.push(last)
        sum += last
      }
      if (faces.length > 1) trace.push({ value: sum, kept: true, rerolled: false, exploded: true, faces: faces })
      else trace.push(entry(v))
      continue
    }

    trace.push(entry(v))
    var cur = v
    while (matches(exCmp, cur)) {
      spend()
      var raw = rollOne()
      trace.push({ value: ex.kind === "!p" ? raw - 1 : raw, kept: true, rerolled: false, exploded: true })
      cur = raw
    }
  }
  if (node.keep) applyKeep(trace, node.keep)
  var total = 0
  for (var j = 0; j < trace.length; j++) if (trace[j].kept) total += trace[j].value
  return { text: node.text, sides: node.fate ? "F" : node.sides, fate: node.fate, trace: trace, total: total }
}

// roll(ast, rng, text) -> { total, raw, terms, text }. Terms are in source
// order because evaluation is left-to-right.
function roll(ast, rng, text) {
  var terms = []
  var raw = evalNode(ast, rng || defaultRng, terms)
  return { total: Math.round(raw), raw: raw, terms: terms, text: text || "" }
}

function evaluate(text, rng) {
  var p = parse(text)
  if (!p.ok) return p
  try {
    return { ok: true, result: roll(p.ast, rng, p.text) }
  } catch (e) {
    if (e && e.dice) return { ok: false, error: e.error, column: e.column || 0 }
    return { ok: false, error: "Could not roll formula", column: 0 }
  }
}

// ---- formatter ----------------------------------------------------------

function fateFace(v) {
  return v < 0 ? "-" : (v > 0 ? "+" : "0")
}

// "6 5 4 [3]" — dropped/rerolled bracketed, exploded suffixed with '!'
function formatTerm(term) {
  var parts = []
  for (var i = 0; i < term.trace.length; i++) {
    var e = term.trace[i]
    var s
    if (e.faces) s = e.faces.join("+")
    else if (term.fate) s = fateFace(e.value)
    else s = String(e.value)
    if (e.exploded) s += "!"
    if (!e.kept) s = "[" + s + "]"
    parts.push(s)
  }
  return parts.join(" ")
}

// "4d6dl1 → 6 5 4 [3] = 15" | "d20+2d6 → d20: 17 | 2d6: 3 5 = 25" | "2+3 = 5"
function format(result) {
  var out = result.text
  if (result.terms.length === 1 && result.terms[0].text === result.text)
    out += " → " + formatTerm(result.terms[0])
  else if (result.terms.length > 0) {
    var labelled = []
    for (var i = 0; i < result.terms.length; i++)
      labelled.push(result.terms[i].text + ": " + formatTerm(result.terms[i]))
    out += " → " + labelled.join(" | ")
  }
  out += " = " + result.total
  if (result.raw !== result.total) out += " (" + result.raw + ")"
  return out
}

// ---- node export (ignored by QML) ----------------------------------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LIMITS: LIMITS, defaultRng: defaultRng, parse: parse, roll: roll, evaluate: evaluate,
    fateFace: fateFace, formatTerm: formatTerm, format: format
  }
}
