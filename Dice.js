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

// Dice terms are added in Task 3; until then any 'd' is a parse error.
Parser.prototype.dice = function (count, start) {
  this.fail("Dice not supported yet", start)
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

// Filled in by Task 3.
function rollDiceTerm(node, rng) {
  throw { dice: true, error: "Dice not supported yet", column: 0 }
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

// ---- node export (ignored by QML) ----------------------------------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LIMITS: LIMITS, defaultRng: defaultRng, parse: parse, roll: roll, evaluate: evaluate }
}
