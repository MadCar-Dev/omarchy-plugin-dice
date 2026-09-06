# Dice Formula Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the forked RPG Dice bar widget into `madcar.dice`, a formula-driven roller that understands Roll20/Foundry notation (`2d20kh1`, `4d6dl1`, `3d6!`) with a formula box, saved macros, and per-die result traces that dim dropped dice.

**Architecture:** A new pure-JS `Dice.js` (recursive-descent parser + roller with per-die traces) is the only unit with logic risk and is tested under node. `Model.js` keeps state (de)serialization and grows a v2 schema (macros, recent formulas) with a validator injected so it stays QML-free. `Panel.qml` gets a formula box, macro grid, roll-on-click dice, and a results renderer; `BarWidget.qml` only changes ids.

**Tech Stack:** Quickshell QML (Qt 6), plain JavaScript (no ES modules; QML `.js` imports), node ≥ 20 built-in test runner (`node --test`), Omarchy plugin CLI (`omarchy plugin validate|add|enable|disable`).

**Spec:** `docs/superpowers/specs/2026-09-06-dice-formula-engine-design.md`

## Global Constraints

- Plugin id `madcar.dice`; every `moduleName`, `ipcTarget`, IPC `target`, and manifest `id` uses it.
- `Dice.js` and `Model.js` have **no QML imports** and **no `.pragma`, `.import`, `import`/`export`** statements. Export to node only via `if (typeof module !== "undefined" && module.exports) module.exports = {...}` at the end of the file.
- `LIMITS = { maxLength: 200, maxDice: 1000, maxSides: 1000000, maxIterations: 100, maxDepth: 16 }` — `maxIterations` is the reroll/explode budget **per starting die**; `maxDice` bounds the trace of one term.
- `rng` contract: `rng(sides)` returns an **integer in 1..sides**. Production uses `Dice.defaultRng`.
- Nothing in `Dice.js` throws to callers: `parse`/`evaluate` return `{ ok: false, error, column }`.
- Every file read in QML is bounded (`dd iflag=nofollow,nonblock bs=MAX+1 count=1` under `timeout`). Every write is `mktemp` + `mv -f` via `Util.execDetached` with `Util.shellQuote`.
- User text goes through `Model.plainText` and renders with `textFormat: Text.PlainText`.
- Colors/sizes only from `Color` / `Style` tokens and `root.fg` / `root.fontFam`. No hardcoded values.
- State path `~/.local/state/omarchy/dice/state.json`; legacy import from `~/.local/state/omarchy/rpgdice/state.json`.
- Caps: `MAX_MACROS` 64, macro name ≤ 32 chars, formula ≤ 200 chars, `MAX_RECENT` 20, history 10 entries.
- Commits: one per task, message in imperative mood, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01C74kEmz5pa3muTZQXYqAiU`.
- After editing `Dice.js`/`Model.js` and testing in the shell: `omarchy restart shell` (JS imports do not hot-reload).

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `Dice.js` | create | Tokenizer/parser (`parse`), roller (`roll`, `evaluate`), formatter (`format`), `LIMITS`, `defaultRng` |
| `Model.js` | modify | Dice objects (`STANDARD_DICE`, `FATE_DIE`, `customDie`, `rollDie`, `describeDie`), `plainText`, `assetPath`, state v2 (`parseState(raw, isValid)`, `serializeState`), caps |
| `Panel.qml` | modify | Popup UI: formula box, macros grid, dice grid, results, settings; state load/import/save |
| `BarWidget.qml` | modify | ids and tooltip only |
| `manifest.json` | modify | identity |
| `LICENSE` | modify | add fork copyright line |
| `README.md`, `AGENTS.md` | rewrite | user docs; agent rules |
| `test/rng.js` | create | `scripted(values)` and `seeded(seed)` rng helpers |
| `test/dice.test.js` | create | engine tests |
| `test/model.test.js` | create | state tests |
| `package.json` | create | `{ "name": "omarchy-plugin-dice", "private": true, "scripts": { "test": "node --test test/*.test.js" } }` |

---

### Task 1: Plugin identity and license

**Files:**
- Modify: `manifest.json`
- Modify: `BarWidget.qml:9,20,68,70`
- Modify: `Panel.qml:13-15`
- Modify: `LICENSE`

**Interfaces:**
- Produces: plugin id `madcar.dice` used by every later task.

- [ ] **Step 1: Rewrite `manifest.json`**

```json
{
  "schemaVersion": 1,
  "id": "madcar.dice",
  "name": "Dice",
  "version": "2.0.0",
  "author": "Will McCandless",
  "license": "MIT",
  "description": "Formula-driven dice roller for tabletop RPGs: Roll20/Foundry notation (2d20kh1, 4d6dl1, 3d6!), saved macros, Fate and custom dice.",
  "kinds": [
    "bar-widget"
  ],
  "entryPoints": {
    "barWidget": "BarWidget.qml"
  },
  "barWidget": {
    "displayName": "Dice",
    "description": "Roll dice formulas, macros, standard, Fate, and custom dice",
    "category": "Utility",
    "allowMultiple": false,
    "defaultSection": "center"
  }
}
```

- [ ] **Step 2: Change ids in `BarWidget.qml`**

Replace `moduleName: "crueber.rpgdice"` with `moduleName: "madcar.dice"`, `target: "crueber.rpgdice"` with `target: "madcar.dice"`, and `tooltipText: "RPG Dice"` with `tooltipText: "Dice"`. Update the file comment to `// Bar pill for the dice roller: a d20 icon that opens the roll panel.` (unchanged wording is fine).

- [ ] **Step 3: Change ids in `Panel.qml`**

Replace `moduleName: "crueber.rpgdice"` with `moduleName: "madcar.dice"` and `ipcTarget: "crueber.rpgdice"` with `ipcTarget: "madcar.dice"`.

- [ ] **Step 4: Add fork copyright to `LICENSE`**

Directly beneath the existing `Copyright (c) ... Christopher Rueber` line add:

```
Copyright (c) 2026 Will McCandless (fork: omarchy-plugin-dice)
```

- [ ] **Step 5: Validate**

Run: `omarchy plugin validate /mnt/data/projects/omarchy-plugin-dice`
Expected: passes (no errors). If `validate` complains about the version string, keep `"2.0.0"` and fix whatever else it names.

Run: `grep -rn "crueber.rpgdice" --include='*.qml' --include='*.json' .`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add manifest.json BarWidget.qml Panel.qml LICENSE
git commit -m "Rename plugin to madcar.dice and credit the fork"
```

---

### Task 2: Test harness and arithmetic parser

**Files:**
- Create: `package.json`
- Create: `test/rng.js`
- Create: `test/dice.test.js`
- Create: `Dice.js`

**Interfaces:**
- Produces: `Dice.LIMITS`, `Dice.parse(text) -> {ok, ast, text} | {ok:false, error, column}`, `Dice.roll(ast, rng, text) -> {total, raw, terms, text}`, `Dice.evaluate(text, rng) -> {ok:true, result} | {ok:false, error, column}`, `Dice.defaultRng(sides)`. AST node types: `{type:"num", value}`, `{type:"neg", expr}`, `{type:"bin", op, left, right}`, `{type:"dice", ...}` (dice added in Task 3).
- Produces: `test/rng.js` exporting `scripted(values)` (returns `rng(sides)` that shifts the next value and records `sides` in `rng.calls`) and `seeded(seed)` (mulberry32-based `rng(sides)`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "omarchy-plugin-dice",
  "private": true,
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

- [ ] **Step 2: Create `test/rng.js`**

```js
"use strict"

// rng(sides) -> integer 1..sides. Two deterministic providers for tests.

// Returns the given faces in order; throws if a test rolls more dice than it
// scripted, so a bug that rolls extra dice fails loudly.
function scripted(values) {
  var queue = values.slice()
  function rng(sides) {
    if (queue.length === 0) throw new Error("scripted rng exhausted (sides=" + sides + ")")
    var v = queue.shift()
    if (v < 1 || v > sides) throw new Error("scripted face " + v + " outside 1.." + sides)
    rng.calls.push(sides)
    return v
  }
  rng.calls = []
  rng.remaining = function () { return queue.length }
  return rng
}

// mulberry32: small, seedable, good enough for property-style tests.
function seeded(seed) {
  var a = seed >>> 0
  function next() {
    a = (a + 0x6D2B79F5) >>> 0
    var t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return function rng(sides) { return Math.floor(next() * sides) + 1 }
}

module.exports = { scripted: scripted, seeded: seeded }
```

- [ ] **Step 3: Write the failing tests for arithmetic**

`test/dice.test.js`:

```js
"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const Dice = require("../Dice.js")
const { scripted, seeded } = require("./rng.js")

test("parse: plain integer", () => {
  const p = Dice.parse("7")
  assert.equal(p.ok, true)
  assert.deepEqual(p.ast, { type: "num", value: 7 })
})

test("parse: precedence and parentheses", () => {
  const p = Dice.parse("1 + 2 * 3")
  assert.equal(p.ok, true)
  assert.deepEqual(p.ast, {
    type: "bin", op: "+",
    left: { type: "num", value: 1 },
    right: { type: "bin", op: "*", left: { type: "num", value: 2 }, right: { type: "num", value: 3 } }
  })
  const q = Dice.parse("(1 + 2) * 3")
  assert.equal(q.ok, true)
  assert.equal(q.ast.op, "*")
})

test("parse: unary minus", () => {
  const p = Dice.parse("-3 + 5")
  assert.equal(p.ok, true)
  assert.deepEqual(p.ast.left, { type: "neg", expr: { type: "num", value: 3 } })
})

test("parse: errors carry a 1-based column", () => {
  assert.deepEqual(Dice.parse(""), { ok: false, error: "Enter a formula", column: 1 })
  assert.deepEqual(Dice.parse("1 + x"), { ok: false, error: 'Unexpected "x"', column: 5 })
  assert.deepEqual(Dice.parse("(1 + 2"), { ok: false, error: "Expected )", column: 7 })
  assert.deepEqual(Dice.parse("1 +"), { ok: false, error: "Unexpected end of formula", column: 4 })
})

test("parse: length and depth limits", () => {
  const long = "1+".repeat(101)
  const p = Dice.parse(long)
  assert.equal(p.ok, false)
  assert.match(p.error, /longer than 200/)
  const deep = "(".repeat(17) + "1" + ")".repeat(17)
  const q = Dice.parse(deep)
  assert.equal(q.ok, false)
  assert.equal(q.error, "Too many nested parentheses")
  const okDeep = "(".repeat(16) + "1" + ")".repeat(16)
  assert.equal(Dice.parse(okDeep).ok, true)
})

test("evaluate: arithmetic, rounding, division by zero", () => {
  assert.equal(Dice.evaluate("1 + 2 * 3").result.total, 7)
  assert.equal(Dice.evaluate("(1 + 2) * 3").result.total, 9)
  assert.equal(Dice.evaluate("-3 + 5").result.total, 2)
  const half = Dice.evaluate("7 / 2").result
  assert.equal(half.total, 4)      // Roll20 rounds
  assert.equal(half.raw, 3.5)
  const dz = Dice.evaluate("1 / 0")
  assert.equal(dz.ok, false)
  assert.equal(dz.error, "Division by zero")
})

test("LIMITS are the spec values", () => {
  assert.deepEqual(Dice.LIMITS, { maxLength: 200, maxDice: 1000, maxSides: 1000000, maxIterations: 100, maxDepth: 16 })
})

test("defaultRng stays in 1..sides", () => {
  for (let i = 0; i < 1000; i++) {
    const v = Dice.defaultRng(6)
    assert.ok(v >= 1 && v <= 6 && Number.isInteger(v))
  }
})
```

- [ ] **Step 4: Run to verify failure**

Run: `cd /mnt/data/projects/omarchy-plugin-dice && node --test test/*.test.js`
Expected: FAIL — `Cannot find module '../Dice.js'`.

- [ ] **Step 5: Create `Dice.js` with the arithmetic parser and evaluator**

```js
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
```

- [ ] **Step 6: Run tests**

Run: `node --test test/*.test.js`
Expected: all 8 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json test/rng.js test/dice.test.js Dice.js
git commit -m "Add Dice.js arithmetic parser with node test harness"
```

---

### Task 3: Dice terms (NdX, d%, dF) with traces

**Files:**
- Modify: `Dice.js` (replace the `Parser.prototype.dice` and `rollDiceTerm` stubs; add helpers)
- Modify: `test/dice.test.js` (append)

**Interfaces:**
- Produces: dice AST node `{ type: "dice", count, sides, fate, keep: null, explode: null, reroll: null, text }`; term result `{ text, sides, fate, trace, total }`; trace entry `{ value, kept, rerolled, exploded }` (plus `faces` for compound dice, Task 6). `sides` in the term result is the number, or the string `"F"` for Fate.

- [ ] **Step 1: Append failing tests**

```js
test("parse: dice term shapes", () => {
  assert.deepEqual(Dice.parse("d6").ast, { type: "dice", count: 1, sides: 6, fate: false, keep: null, explode: null, reroll: null, text: "d6" })
  assert.equal(Dice.parse("4D6").ast.count, 4)
  assert.equal(Dice.parse("d%").ast.sides, 100)
  const f = Dice.parse("4dF").ast
  assert.equal(f.fate, true)
  assert.equal(f.sides, 3)
  assert.equal(Dice.parse("2d6+d4").ast.right.text, "d4")
})

test("parse: dice term errors", () => {
  assert.deepEqual(Dice.parse("4d"), { ok: false, error: "Expected die size after d", column: 3 })
  assert.deepEqual(Dice.parse("0d6"), { ok: false, error: "Roll at least one die", column: 1 })
  assert.deepEqual(Dice.parse("d0"), { ok: false, error: "Die size must be at least 1", column: 1 })
  assert.deepEqual(Dice.parse("1001d6"), { ok: false, error: "At most 1000 dice per term", column: 1 })
  assert.deepEqual(Dice.parse("d1000001"), { ok: false, error: "Die size at most 1000000", column: 1 })
})

test("roll: NdX trace and total", () => {
  const rng = scripted([3, 5, 1])
  const r = Dice.evaluate("3d6", rng).result
  assert.equal(r.total, 9)
  assert.equal(r.terms.length, 1)
  assert.deepEqual(r.terms[0], {
    text: "3d6", sides: 6, fate: false, total: 9,
    trace: [
      { value: 3, kept: true, rerolled: false, exploded: false },
      { value: 5, kept: true, rerolled: false, exploded: false },
      { value: 1, kept: true, rerolled: false, exploded: false }
    ]
  })
  assert.deepEqual(rng.calls, [6, 6, 6])
})

test("roll: d% rolls 1..100 and dF maps 1..3 to -1..1", () => {
  const pct = Dice.evaluate("d%", scripted([100])).result
  assert.equal(pct.total, 100)
  assert.equal(pct.terms[0].sides, 100)
  const fate = Dice.evaluate("4dF", scripted([1, 2, 3, 3])).result
  assert.equal(fate.terms[0].sides, "F")
  assert.equal(fate.terms[0].fate, true)
  assert.deepEqual(fate.terms[0].trace.map(e => e.value), [-1, 0, 1, 1])
  assert.equal(fate.total, 1)
})

test("roll: terms come back in source order with arithmetic applied", () => {
  const r = Dice.evaluate("d4 + 2*d6 - 1", scripted([4, 3])).result
  assert.deepEqual(r.terms.map(t => t.text), ["d4", "d6"])
  assert.equal(r.total, 4 + 6 - 1)
})

test("roll: seeded rng stays within faces over many dice", () => {
  const r = Dice.evaluate("200d8", seeded(42)).result
  assert.equal(r.terms[0].trace.length, 200)
  for (const e of r.terms[0].trace) assert.ok(e.value >= 1 && e.value <= 8)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/*.test.js`
Expected: the new tests FAIL with `Dice not supported yet`.

- [ ] **Step 3: Implement dice parsing and rolling**

Replace the `Parser.prototype.dice` stub with:

```js
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

// Modifiers are added in Tasks 4-6.
Parser.prototype.modifiers = function (node, start) {}
```

Replace the `rollDiceTerm` stub with:

```js
function rollFace(node, rng) {
  var v = rng(node.sides)
  return node.fate ? v - 2 : v
}

function entry(value) {
  return { value: value, kept: true, rerolled: false, exploded: false }
}

function rollDiceTerm(node, rng) {
  var trace = []
  for (var i = 0; i < node.count; i++) trace.push(entry(rollFace(node, rng)))
  var total = 0
  for (var j = 0; j < trace.length; j++) if (trace[j].kept) total += trace[j].value
  return { text: node.text, sides: node.fate ? "F" : node.sides, fate: node.fate, trace: trace, total: total }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/*.test.js`
Expected: all PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add Dice.js test/dice.test.js
git commit -m "Parse and roll NdX, d% and dF terms with per-die traces"
```

---

### Task 4: Keep and drop modifiers

**Files:**
- Modify: `Dice.js` (`Parser.prototype.modifiers`, new `applyKeep`, call in `rollDiceTerm`)
- Modify: `test/dice.test.js` (append)

**Interfaces:**
- Produces: `node.keep = { mode: "kh"|"kl"|"dh"|"dl", count }`. Dropped trace entries have `kept: false`.

- [ ] **Step 1: Append failing tests**

```js
test("parse: keep/drop forms", () => {
  assert.deepEqual(Dice.parse("2d20kh1").ast.keep, { mode: "kh", count: 1 })
  assert.deepEqual(Dice.parse("4d6dl1").ast.keep, { mode: "dl", count: 1 })
  assert.deepEqual(Dice.parse("4d6k3").ast.keep, { mode: "kh", count: 3 })   // bare k = kh
  assert.deepEqual(Dice.parse("4d6d").ast.keep, { mode: "dl", count: 1 })    // bare d = dl, count 1
  assert.deepEqual(Dice.parse("3d6KL2").ast.keep, { mode: "kl", count: 2 })
  assert.deepEqual(Dice.parse("3d6dh1").ast.keep, { mode: "dh", count: 1 })
  assert.deepEqual(Dice.parse("4d6dl1kh1"), { ok: false, error: "Only one keep/drop modifier per term", column: 7 })
  assert.deepEqual(Dice.parse("4d6kh0"), { ok: false, error: "Keep/drop count must be at least 1", column: 4 })
})

test("roll: 4d6dl1 drops exactly the lowest and totals the rest", () => {
  const r = Dice.evaluate("4d6dl1", scripted([6, 5, 4, 3])).result
  assert.deepEqual(r.terms[0].trace.map(e => [e.value, e.kept]), [[6, true], [5, true], [4, true], [3, false]])
  assert.equal(r.total, 15)
})

test("roll: keep highest / lowest, drop highest", () => {
  const adv = Dice.evaluate("2d20kh1", scripted([7, 18])).result
  assert.deepEqual(adv.terms[0].trace.map(e => e.kept), [false, true])
  assert.equal(adv.total, 18)
  const dis = Dice.evaluate("2d20kl1", scripted([7, 18])).result
  assert.deepEqual(dis.terms[0].trace.map(e => e.kept), [true, false])
  assert.equal(dis.total, 7)
  const dh = Dice.evaluate("3d6dh1", scripted([2, 6, 4])).result
  assert.deepEqual(dh.terms[0].trace.map(e => e.kept), [true, false, true])
  assert.equal(dh.total, 6)
})

test("roll: keep count larger than dice keeps all; drop larger than dice drops all", () => {
  assert.equal(Dice.evaluate("2d6kh5", scripted([2, 3])).result.total, 5)
  assert.equal(Dice.evaluate("2d6dl5", scripted([2, 3])).result.total, 0)
})

test("roll: ties drop only as many as asked", () => {
  const r = Dice.evaluate("3d6dl1", scripted([3, 3, 3])).result
  assert.equal(r.terms[0].trace.filter(e => !e.kept).length, 1)
  assert.equal(r.total, 6)
})

test("roll: Fate dice accept keep/drop", () => {
  const r = Dice.evaluate("4dFkh3", scripted([1, 3, 3, 2])).result
  assert.equal(r.total, 2)
  assert.equal(r.terms[0].trace[0].kept, false)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/*.test.js`
Expected: new tests FAIL (`keep` is `null`, totals wrong).

- [ ] **Step 3: Implement**

Replace the empty `Parser.prototype.modifiers` with:

```js
// modifier := keep | explode | reroll  (explode/reroll parsing lands in Tasks 5-6)
Parser.prototype.modifiers = function (node, start) {
  for (;;) {
    var c = this.peekLower()
    if (c === "k" || c === "d") this.keepModifier(node, c)
    else break
  }
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
```

Add `applyKeep` above `rollDiceTerm` and call it before totalling:

```js
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
```

In `rollDiceTerm`, after the roll loop and before the total loop, insert:

```js
  if (node.keep) applyKeep(trace, node.keep)
```

- [ ] **Step 4: Run tests**

Run: `node --test test/*.test.js`
Expected: all PASS (20 tests).

- [ ] **Step 5: Commit**

```bash
git add Dice.js test/dice.test.js
git commit -m "Add keep and drop modifiers (kh, kl, dh, dl, k, d)"
```

---

### Task 5: Reroll modifiers

**Files:**
- Modify: `Dice.js` (`compare` parser, `rerollModifier`, per-die rolling with budget)
- Modify: `test/dice.test.js` (append)

**Interfaces:**
- Produces: `node.reroll = { once: boolean, cmp: { op, value } }`, `op` one of `">" "<" ">=" "<=" "="`. Rerolled entries: `{ value, kept: false, rerolled: true, exploded: false }` placed immediately before their replacement. `matches(cmp, value)` helper. Per-die iteration budget with error `"Reroll/explode limit reached"`.

- [ ] **Step 1: Append failing tests**

```js
test("parse: reroll forms and compares", () => {
  assert.deepEqual(Dice.parse("2d6r1").ast.reroll, { once: false, cmp: { op: "=", value: 1 } })
  assert.deepEqual(Dice.parse("d20ro<3").ast.reroll, { once: true, cmp: { op: "<", value: 3 } })
  assert.deepEqual(Dice.parse("d6r>=5").ast.reroll.cmp, { op: ">=", value: 5 })
  assert.deepEqual(Dice.parse("d6r<=2").ast.reroll.cmp, { op: "<=", value: 2 })
  assert.deepEqual(Dice.parse("d6r=6").ast.reroll.cmp, { op: "=", value: 6 })
  assert.deepEqual(Dice.parse("d6r"), { ok: false, error: "Expected a number after r", column: 4 })
  assert.deepEqual(Dice.parse("d6ro"), { ok: false, error: "Expected a number after ro", column: 5 })
  assert.deepEqual(Dice.parse("d6r1r2"), { ok: false, error: "Only one reroll modifier per term", column: 5 })
  assert.deepEqual(Dice.parse("dFr1"), { ok: false, error: "Fate dice cannot explode or reroll", column: 1 })
})

test("roll: r rerolls until the compare fails, ro rerolls once", () => {
  const r = Dice.evaluate("2d6r1", scripted([1, 1, 4, 2])).result
  assert.deepEqual(r.terms[0].trace.map(e => [e.value, e.kept, e.rerolled]),
    [[1, false, true], [1, false, true], [4, true, false], [2, true, false]])
  assert.equal(r.total, 6)
  const ro = Dice.evaluate("1d6ro1", scripted([1, 1])).result
  assert.deepEqual(ro.terms[0].trace.map(e => [e.value, e.kept]), [[1, false], [1, true]])
  assert.equal(ro.total, 1)
})

test("roll: reroll compare operators", () => {
  assert.equal(Dice.evaluate("d20ro<3", scripted([2, 15])).result.total, 15)
  assert.equal(Dice.evaluate("d20ro<3", scripted([3])).result.total, 3)
  assert.equal(Dice.evaluate("d6r>4", scripted([5, 6, 2])).result.total, 2)
})

test("roll: reroll then keep/drop only considers surviving dice", () => {
  const r = Dice.evaluate("4d6r1dl1", scripted([1, 6, 5, 4, 3])).result
  const kept = r.terms[0].trace.filter(e => e.kept).map(e => e.value)
  assert.deepEqual(kept, [6, 5, 4])
  assert.equal(r.total, 15)
})

test("roll: a reroll that can never stop hits the per-die budget", () => {
  const r = Dice.evaluate("d6r>0", seeded(1))
  assert.equal(r.ok, false)
  assert.equal(r.error, "Reroll/explode limit reached")
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/*.test.js`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

Add to the parser (after `keepModifier`):

```js
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
```

Extend `modifiers` and add the Fate check:

```js
Parser.prototype.modifiers = function (node, start) {
  for (;;) {
    var c = this.peekLower()
    if (c === "k" || c === "d") this.keepModifier(node, c)
    else if (c === "r") this.rerollModifier(node)
    else break
  }
  if (node.fate && (node.explode || node.reroll)) this.fail("Fate dice cannot explode or reroll", start)
}
```

Roller: add `matches` and restructure `rollDiceTerm` around a per-die budget. Replace `rollDiceTerm` with:

```js
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

  for (var i = 0; i < node.count; i++) {
    budget = 0
    trace.push(entry(rollOne()))
  }
  if (node.keep) applyKeep(trace, node.keep)
  var total = 0
  for (var j = 0; j < trace.length; j++) if (trace[j].kept) total += trace[j].value
  return { text: node.text, sides: node.fate ? "F" : node.sides, fate: node.fate, trace: trace, total: total }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/*.test.js`
Expected: all PASS (25 tests).

- [ ] **Step 5: Commit**

```bash
git add Dice.js test/dice.test.js
git commit -m "Add reroll modifiers r and ro with comparison operators"
```

---

### Task 6: Exploding dice (`!`, `!!`, `!p`)

**Files:**
- Modify: `Dice.js` (`explodeModifier`, explosion loop in `rollDiceTerm`)
- Modify: `test/dice.test.js` (append)

**Interfaces:**
- Produces: `node.explode = { kind: "!"|"!!"|"!p", cmp: {op, value} | null }`. Added dice: `{ value, kept: true, rerolled: false, exploded: true }`. Compound (`!!`) produces one entry `{ value: sum, kept, rerolled: false, exploded: true, faces: [...] }` when at least one explosion happened, else a plain entry. Penetrating (`!p`) subtracts 1 from each added die; the compare is tested on the raw face.

- [ ] **Step 1: Append failing tests**

```js
test("parse: explode forms", () => {
  assert.deepEqual(Dice.parse("3d6!").ast.explode, { kind: "!", cmp: null })
  assert.deepEqual(Dice.parse("3d6!!").ast.explode, { kind: "!!", cmp: null })
  assert.deepEqual(Dice.parse("3d6!p").ast.explode, { kind: "!p", cmp: null })
  assert.deepEqual(Dice.parse("d6!>5").ast.explode, { kind: "!", cmp: { op: ">", value: 5 } })
  assert.deepEqual(Dice.parse("d6!5").ast.explode, { kind: "!", cmp: { op: "=", value: 5 } })
  assert.deepEqual(Dice.parse("d6!!<=2").ast.explode, { kind: "!!", cmp: { op: "<=", value: 2 } })
  assert.equal(Dice.parse("3d6!+2").ok, true)   // '+' is not a compare
  assert.deepEqual(Dice.parse("d6!!!"), { ok: false, error: "Only one explode modifier per term", column: 5 })
  assert.deepEqual(Dice.parse("d6!r1!"), { ok: false, error: "Only one explode modifier per term", column: 6 })
  assert.deepEqual(Dice.parse("dF!"), { ok: false, error: "Fate dice cannot explode or reroll", column: 1 })
})

test("roll: ! adds a die for each max face, recursively", () => {
  const r = Dice.evaluate("2d6!", scripted([6, 6, 2, 3])).result
  assert.deepEqual(r.terms[0].trace.map(e => [e.value, e.exploded]), [[6, false], [6, true], [2, true], [3, false]])
  assert.equal(r.total, 17)
})

test("roll: ! with a compare target", () => {
  const r = Dice.evaluate("d6!>4", scripted([5, 6, 1])).result
  assert.deepEqual(r.terms[0].trace.map(e => e.value), [5, 6, 1])
  assert.equal(r.total, 12)
})

test("roll: !! compounds into one entry with faces", () => {
  const r = Dice.evaluate("2d6!!", scripted([6, 6, 2, 4])).result
  assert.deepEqual(r.terms[0].trace, [
    { value: 14, kept: true, rerolled: false, exploded: true, faces: [6, 6, 2] },
    { value: 4, kept: true, rerolled: false, exploded: false }
  ])
  assert.equal(r.total, 18)
})

test("roll: !p subtracts one from each added die and tests the raw face", () => {
  const r = Dice.evaluate("d6!p", scripted([6, 6, 3])).result
  assert.deepEqual(r.terms[0].trace.map(e => e.value), [6, 5, 2])
  assert.equal(r.total, 13)
})

test("roll: explosions happen after rerolls and before keep/drop", () => {
  // d6r1!kh1 : roll 1 → reroll → 6 → explode → 4 ; keep highest one
  const r = Dice.evaluate("1d6r1!kh1", scripted([1, 6, 4])).result
  assert.deepEqual(r.terms[0].trace.map(e => [e.value, e.kept, e.rerolled, e.exploded]),
    [[1, false, true, false], [6, true, false, false], [4, false, false, true]])
  assert.equal(r.total, 6)
})

test("roll: an explosion that never stops hits the per-die budget", () => {
  const r = Dice.evaluate("d1!", seeded(3))
  assert.equal(r.ok, false)
  assert.equal(r.error, "Reroll/explode limit reached")
})

test("roll: a term cannot grow past maxDice", () => {
  // 1000d2! explodes on half the faces; the trace passes 1000 long before any one die's budget does
  const r = Dice.evaluate("1000d2!", seeded(5))
  assert.equal(r.ok, false)
  assert.equal(r.error, "Too many dice in one term")
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/*.test.js`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

Parser: add `explodeModifier` and hook it into `modifiers`:

```js
// explode := '!' ['!' | 'p'] [compare]
Parser.prototype.explodeModifier = function (node) {
  if (node.explode) this.fail("Only one explode modifier per term")
  this.i++
  var kind = "!"
  if (this.peek() === "!") { this.i++; kind = "!!" }
  else if (this.peekLower() === "p") { this.i++; kind = "!p" }
  node.explode = { kind: kind, cmp: this.compare(false, "!") }
}

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
```

Roller: replace the `for (var i = 0; i < node.count; i++)` loop in `rollDiceTerm` with:

```js
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
```

- [ ] **Step 4: Run tests**

Run: `node --test test/*.test.js`
Expected: all PASS (33 tests).

- [ ] **Step 5: Commit**

```bash
git add Dice.js test/dice.test.js
git commit -m "Add exploding, compounding and penetrating dice"
```

---

### Task 7: Formatter

**Files:**
- Modify: `Dice.js` (add `fateFace`, `formatTerm`, `format`; export them)
- Modify: `test/dice.test.js` (append)

**Interfaces:**
- Produces: `Dice.fateFace(value) -> "-" | "0" | "+"`, `Dice.formatTerm(term) -> "6 5 4 [3]"` (dropped/rerolled in brackets, exploded suffixed `!`, compound as `6+6+2!`), `Dice.format(result) -> "4d6dl1 → 6 5 4 [3] = 15"` for a single term whose text equals the formula, otherwise `"d20+2d6 → d20: 17 | 2d6: 3 5 = 25"`. When `raw !== total`, append ` (7/2 = 3.5)` style: `" (3.5)"`.

- [ ] **Step 1: Append failing tests**

```js
test("format: single term, dropped in brackets", () => {
  const r = Dice.evaluate("4d6dl1", scripted([6, 5, 4, 3])).result
  assert.equal(Dice.formatTerm(r.terms[0]), "6 5 4 [3]")
  assert.equal(Dice.format(r), "4d6dl1 → 6 5 4 [3] = 15")
})

test("format: exploded, compound, rerolled, fate", () => {
  const ex = Dice.evaluate("d6!", scripted([6, 2])).result
  assert.equal(Dice.formatTerm(ex.terms[0]), "6 2!")
  const cp = Dice.evaluate("d6!!", scripted([6, 2])).result
  assert.equal(Dice.formatTerm(cp.terms[0]), "6+2!")
  const rr = Dice.evaluate("d6r1", scripted([1, 4])).result
  assert.equal(Dice.formatTerm(rr.terms[0]), "[1] 4")
  const f = Dice.evaluate("4dF", scripted([1, 2, 3, 3])).result
  assert.equal(Dice.formatTerm(f.terms[0]), "- 0 + +")
})

test("format: multiple terms are labelled; rounding shown", () => {
  const r = Dice.evaluate("d20+2d6", scripted([17, 3, 5])).result
  assert.equal(Dice.format(r), "d20+2d6 → d20: 17 | 2d6: 3 5 = 25")
  const h = Dice.evaluate("d6/2", scripted([3])).result
  assert.equal(Dice.format(h), "d6/2 → d6: 3 = 2 (1.5)")
  const n = Dice.evaluate("2+3").result
  assert.equal(Dice.format(n), "2+3 = 5")
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/*.test.js`
Expected: FAIL — `Dice.formatTerm is not a function`.

- [ ] **Step 3: Implement**

Add before the export block:

```js
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
```

Update the export:

```js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LIMITS: LIMITS, defaultRng: defaultRng, parse: parse, roll: roll, evaluate: evaluate,
    fateFace: fateFace, formatTerm: formatTerm, format: format
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/*.test.js`
Expected: all PASS (36 tests).

- [ ] **Step 5: Commit**

```bash
git add Dice.js test/dice.test.js
git commit -m "Add plain-text formatter for roll results"
```

---

### Task 8: Model.js state schema v2

**Files:**
- Modify: `Model.js` (remove `pendingLabel`, `groupLabel`; add v2 state; add export)
- Create: `test/model.test.js`

**Interfaces:**
- Consumes: nothing from `Dice.js` directly — the validator is injected: `isValid(formula) -> boolean`.
- Produces: `Model.DEFAULT_STATE = { version: 2, soundEnabled: true, volume: 60, customDice: [], macros: [], recent: [] }`; `Model.MAX_MACROS = 64`, `Model.MAX_MACRO_NAME = 32`, `Model.MAX_FORMULA = 200`, `Model.MAX_RECENT = 20`; `Model.sanitizeMacros(list, isValid)`, `Model.sanitizeRecent(list, isValid)`, `Model.parseState(raw, isValid)`, `Model.serializeState(state)`, `Model.pushRecent(recent, formula)` (moves to front, dedupes, caps). Existing `STANDARD_DICE`, `FATE_DIE`, `rollDie`, `parseSides`, `plainText`, `assetPath`, `customDie`, `describeDie`, `sanitizeCustomDice`, `clampVolume`, `MAX_STATE_BYTES`, `STATE_READ_TIMEOUT_SECS` stay as they are.

- [ ] **Step 1: Write failing tests**

`test/model.test.js`:

```js
"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")
const Dice = require("../Dice.js")

const isValid = (f) => Dice.parse(f).ok

test("parseState: v1 file upgrades to v2 with empty macros and recent", () => {
  const v1 = JSON.stringify({ soundEnabled: false, volume: 30, customDice: [{ name: "coin", kind: "sides", sides: ["heads", "tails"] }] })
  const s = Model.parseState(v1, isValid)
  assert.deepEqual(s, {
    version: 2, soundEnabled: false, volume: 30,
    customDice: [{ name: "coin", kind: "sides", sides: ["heads", "tails"] }],
    macros: [], recent: []
  })
})

test("parseState: garbage and empty input give defaults", () => {
  assert.deepEqual(Model.parseState("", isValid), Model.DEFAULT_STATE)
  assert.deepEqual(Model.parseState("{not json", isValid), Model.DEFAULT_STATE)
  assert.deepEqual(Model.parseState("[]", isValid), Model.DEFAULT_STATE)
})

test("sanitizeMacros: trims, strips markup, validates formulas, dedupes, caps", () => {
  const list = [
    { name: "  Advantage ", formula: "2d20kh1" },
    { name: "<b>Stats</b>", formula: "4d6dl1" },
    { name: "Broken", formula: "4d" },
    { name: "Advantage", formula: "1d20" },
    { name: "", formula: "1d6" },
    { name: "x".repeat(40), formula: "1d6" },
    { name: "Long", formula: "1+".repeat(101) + "1" },
    "not an object"
  ]
  assert.deepEqual(Model.sanitizeMacros(list, isValid), [
    { name: "Advantage", formula: "2d20kh1" },
    { name: "bStats/b", formula: "4d6dl1" },
    { name: "x".repeat(32), formula: "1d6" }
  ])
  const many = []
  for (let i = 0; i < 70; i++) many.push({ name: "m" + i, formula: "1d6" })
  assert.equal(Model.sanitizeMacros(many, isValid).length, 64)
  assert.deepEqual(Model.sanitizeMacros(null, isValid), [])
})

test("sanitizeRecent: strings only, valid only, capped at 20", () => {
  const list = ["4d6dl1", 7, "nope(", "1d20+5"]
  assert.deepEqual(Model.sanitizeRecent(list, isValid), ["4d6dl1", "1d20+5"])
  const many = []
  for (let i = 1; i <= 25; i++) many.push(i + "d6")
  assert.equal(Model.sanitizeRecent(many, isValid).length, 20)
})

test("pushRecent: newest first, dedupe, cap", () => {
  assert.deepEqual(Model.pushRecent(["1d6", "2d6"], "2d6"), ["2d6", "1d6"])
  assert.deepEqual(Model.pushRecent(["1d6"], "3d8"), ["3d8", "1d6"])
  const full = []
  for (let i = 1; i <= 20; i++) full.push(i + "d4")
  const r = Model.pushRecent(full, "99d4")
  assert.equal(r.length, 20)
  assert.equal(r[0], "99d4")
  assert.equal(r[19], "19d4")
})

test("serializeState: round-trips v2 and clamps volume", () => {
  const s = { version: 2, soundEnabled: true, volume: 250, customDice: [], macros: [{ name: "A", formula: "d20" }], recent: ["d20"] }
  const back = Model.parseState(Model.serializeState(s), isValid)
  assert.deepEqual(back, { version: 2, soundEnabled: true, volume: 100, customDice: [], macros: [{ name: "A", formula: "d20" }], recent: ["d20"] })
})

test("removed helpers are gone", () => {
  assert.equal(Model.pendingLabel, undefined)
  assert.equal(Model.groupLabel, undefined)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/*.test.js`
Expected: `test/model.test.js` FAILS — `Model.parseState is not a function` (no export yet).

- [ ] **Step 3: Implement in `Model.js`**

Delete the `pendingLabel` and `groupLabel` functions (everything from the comment `// "d20 + d6" for the pending queue.` to the end of `groupLabel`).

Replace the `// ---- state ----` block from `var DEFAULT_STATE` through `serializeState` with:

```js
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
```

Append at the end of the file:

```js
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
```

- [ ] **Step 4: Run tests**

Run: `node --test test/*.test.js`
Expected: all PASS (43 tests).

- [ ] **Step 5: Commit**

```bash
git add Model.js test/model.test.js
git commit -m "Add state schema v2 with macros and recent formulas"
```

---

### Task 9: Panel state — new path, legacy import, v2 save

**Files:**
- Modify: `Panel.qml` (properties, `stateDir`/`stateFile`, `applyState`, `saveState`, `stateLoader`; import `Dice.js`)

**Interfaces:**
- Consumes: `Model.parseState(raw, isValid)`, `Model.serializeState`, `Dice.parse`.
- Produces: panel properties `macros: var`, `recent: var`, `stateFile`, `legacyStateFile`; functions `isValidFormula(text)`, `applyState(raw)`, `saveState()`.

- [ ] **Step 1: Add the import and properties**

In `Panel.qml`, after `import "Model.js" as Model` add:

```qml
import "Dice.js" as Dice
```

Replace the `// ---- persisted state ----` block through `stateFile` with:

```qml
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
```

- [ ] **Step 2: Replace `saveState` and `applyState`**

```qml
  function saveState() {
    var json = Model.serializeState({
      soundEnabled: soundEnabled, volume: volume, customDice: customDice, macros: macros, recent: recent
    })
    Util.execDetached("mkdir -p " + Util.shellQuote(stateDir)
      + " && t=$(mktemp -p " + Util.shellQuote(stateDir) + " .state.XXXXXX)"
      + " && printf '%s' " + Util.shellQuote(json) + " > \"$t\""
      + " && mv -f \"$t\" " + Util.shellQuote(stateFile))
  }

  function applyState(raw) {
    var s = Model.parseState(raw, root.isValidFormula)
    root.soundEnabled = s.soundEnabled
    root.volume = s.volume
    root.customDice = s.customDice
    root.macros = s.macros
    root.recent = s.recent
  }
```

- [ ] **Step 3: Replace the `stateLoader` Process**

The reader tries the new file, then the legacy file, each with the same bounded `dd`. The first output byte tags the source: `N` new, `L` legacy. A legacy load is written straight back as v2 so the import happens once.

```qml
  // Bounded read of state.json (see AGENTS.md): one dd open with
  // iflag=nofollow,nonblock under `timeout`, capped at MAX_STATE_BYTES + 1.
  // Falls back to the legacy rpgdice file on first run; output is prefixed
  // with N (new) or L (legacy) so the panel knows whether to persist the import.
  Process {
    id: stateLoader
    command: ["bash", "-c",
      'r() { timeout ' + Model.STATE_READ_TIMEOUT_SECS
      + ' dd if="$1" iflag=nofollow,nonblock bs=' + (Model.MAX_STATE_BYTES + 1)
      + ' count=1 status=none 2>/dev/null; }; '
      + 'out=$(r "$1"); if [ -n "$out" ]; then printf "N%s" "$out"; '
      + 'else out=$(r "$2"); if [ -n "$out" ]; then printf "L%s" "$out"; fi; fi',
      "_", root.stateFile, root.legacyStateFile]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var t = String(text || "")
        var source = t.charAt(0)
        var raw = t.slice(1)
        if (raw.length > Model.MAX_STATE_BYTES) raw = ""
        root.applyState(raw)
        if (source === "L") root.saveState()
      }
    }
    Component.onCompleted: running = true
  }
```

- [ ] **Step 4: Verify in the shell**

Symlink the checkout into the plugins dir so the shell loads it (leave `crueber.rpgdice` alone for now):

Run:
```bash
ln -sfn /mnt/data/projects/omarchy-plugin-dice ~/.config/omarchy/plugins/madcar.dice
omarchy-shell shell rescanPlugins
omarchy plugin enable madcar.dice center
omarchy restart shell
sleep 3
journalctl --user -n 200 --no-pager | grep -iE "madcar.dice|Dice.js|Panel.qml" | grep -viE "^$" | tail -20
```
Expected: no QML errors mentioning the plugin. (Expected at this point: the panel still shows the old UI; rolling still works via the old code path.)

Run: `cat ~/.local/state/omarchy/dice/state.json`
Expected: if `~/.local/state/omarchy/rpgdice/state.json` existed, a v2 JSON with `"version":2` and the old custom dice; otherwise no file yet (nothing saved until a setting changes).

- [ ] **Step 5: Commit**

```bash
git add Panel.qml
git commit -m "Move state to madcar.dice with one-time import from rpgdice"
```

---

### Task 10: Roll pipeline — formula box, roll on click, history entries

**Files:**
- Modify: `Panel.qml` (remove debounce/pending; add `rollFormula`, `rollDieButton`, formula box UI; simplify Dice grid)

**Interfaces:**
- Consumes: `Dice.evaluate`, `Model.rollDie`, `Model.pushRecent`, `Model.plainText`.
- Produces: `history` entries `{ formula, total, terms, time, source }`, where `terms[i] = { text, sides, fate, trace: [{ value, kept, rerolled, exploded, faces? }], total }`; for explicit-sides dice `total: null`, one term with `trace: [{ value: "<face>", kept: true, rerolled: false, exploded: false }]`, `fate: false`, `sides: "custom"`. Functions `rollFormula(text, source)`, `rollDieButton(die)`, property `formulaError: string`, `formulaText: string`, `recentIndex: int`.

- [ ] **Step 1: Remove the debounce queue**

Delete the `// ---- roll queue (debounce) ----` block (`pending`, `pendingLabel`), the `queueDie`/`rollAll` functions, the `Timer { id: debounceTimer ... }`, and the `Text { visible: root.pending.length > 0 ... "Rolling: " ... }` element in the Dice section.

- [ ] **Step 2: Add the roll functions**

After `// ---- results (newest first) ----` / `property var history: []` add:

```qml
  readonly property int maxHistory: 10

  property string formulaText: ""
  property string formulaError: ""
  property int recentIndex: -1   // -1 = editing a fresh formula; 0.. = browsing recent

  function pushHistory(entry) {
    history = [entry].concat(history).slice(0, maxHistory)
    if (soundEnabled) playSound()
  }

  // Evaluate a formula and record it. source: "formula" | "macro:<name>" | "die:<label>"
  function rollFormula(text, source) {
    var t = Model.plainText(text).replace(/^\s+|\s+$/g, "")
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
```

- [ ] **Step 3: Add the formula box at the top of `content`**

Inside `Column { id: content ... }`, before the `// ===================== Settings` header, insert:

```qml
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
```

- [ ] **Step 4: Point the Dice grid at `rollDieButton`**

In the Dice grid's `Button`, replace `onClicked: root.queueDie(modelData)` with `onClicked: root.rollDieButton(modelData)`.

- [ ] **Step 5: Verify in the shell**

Run: `omarchy restart shell && sleep 3 && journalctl --user -n 200 --no-pager | grep -iE "madcar.dice|Dice.js|Panel.qml|ReferenceError|TypeError" | tail -20`
Expected: no errors. Manual checks (the Results section still renders with the *old* `groupLabel` code until Task 11, so only check behaviour that does not depend on it):
- Click d20: a history entry appears immediately (no 1.5 s wait). Sound plays if enabled.
- Type `4d6dl1`, Enter: no error; the field clears.
- Type `4d6dl`, then `4d`, Enter: red error `Expected die size after d at 3`.
- Up arrow recalls `4d6dl1`.

Note: if the Results section throws because `Model.groupLabel` is gone, temporarily replace the `Text { text: Model.groupLabel(modelData) ... }` with `Text { text: modelData.formula ... }` — Task 11 rewrites that block anyway.

- [ ] **Step 6: Commit**

```bash
git add Panel.qml
git commit -m "Add formula box and roll dice immediately on click"
```

---

### Task 11: Results rendering with dimmed dropped dice

**Files:**
- Modify: `Panel.qml` (replace the Results `Repeater` body)

**Interfaces:**
- Consumes: history entry shape from Task 10; `Dice.fateFace`.
- Produces: functions `dieText(entry, term) -> string`, `dieColor(entry) -> color`.

- [ ] **Step 1: Add the die presentation helpers**

Near `pushHistory` add:

```qml
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
```

- [ ] **Step 2: Replace the Results repeater**

Replace everything from `Repeater { model: root.history` to the end of that repeater with:

```qml
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
```

- [ ] **Step 3: Verify in the shell**

Run: `omarchy restart shell && sleep 3 && journalctl --user -n 200 --no-pager | grep -iE "madcar.dice|Panel.qml|ReferenceError|TypeError" | tail -20`
Expected: no errors. Manual checks:
- `4d6dl1` → four dice shown; the lowest is dimmer and struck through; total is the sum of the other three.
- `2d20kh1` → both dice, the lower struck.
- `3d6!` → any 6 followed by an extra die marked `6!` in accent.
- `d20+2d6` → two term lines labelled `d20:` and `2d6:`.
- Click `dF` → four faces from `- 0 +`, with a total.
- Click an explicit-sides custom die (add `coin` = `heads, tails` in Settings if none) → face shown, no total.

- [ ] **Step 4: Commit**

```bash
git add Panel.qml
git commit -m "Render per-die results with dropped dice dimmed and struck"
```

---

### Task 12: Macros — grid, add and remove, settings collapsed

**Files:**
- Modify: `Panel.qml` (Macros section, Settings add-macro form, collapsed Settings, section order)

**Interfaces:**
- Consumes: `Model.sanitizeMacros`, `root.isValidFormula`, `rollFormula`.
- Produces: functions `addMacro()`, `removeMacro(name)`; properties `newMacroName`, `newMacroFormula`, `macroError`, `settingsOpen`.

- [ ] **Step 1: Add macro state and functions**

After the custom-dice form properties (`property bool addFormOpen: false`) add:

```qml
  // ---- macros form ----
  property string newMacroName: ""
  property string newMacroFormula: ""
  property string macroError: ""
  property bool settingsOpen: false

  function addMacro() {
    var name = Model.plainText(newMacroName).replace(/^\s+|\s+$/g, "")
    var formula = Model.plainText(newMacroFormula).replace(/^\s+|\s+$/g, "")
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
```

- [ ] **Step 2: Reorder the panel: Formula, Macros, Dice, Results, Settings**

Inside `Column { id: content }` the order becomes:

1. Formula box + error (Task 10).
2. Macros section (new, below).
3. `PanelSeparator`, Dice section (existing grid).
4. `PanelSeparator`, Results section (Task 11).
5. `PanelSeparator`, Settings (existing Sound/Volume/Custom dice content, plus the macro form) wrapped so it collapses.

Insert the Macros section right after the formula error `Text`:

```qml
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
```

Move the existing Settings block (from `PanelSectionHeader { text: "Settings" ...}` through the custom-dice `Repeater`) to the **end** of `content`, after Results, and wrap it:

```qml
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

          // ... existing Toggle (Sound), Row (Volume) ...

          PanelSeparator { foreground: root.fg }

          PanelSectionHeader { text: "Macros"; foreground: root.fg; fontFamily: root.fontFam }

          Row {
            width: parent.width
            spacing: Style.spacing.md

            TextField {
              width: parent.width * 0.38
              placeholderText: "Name"
              text: root.newMacroName
              foreground: root.fg
              onTextEdited: root.newMacroName = text
              onAccepted: root.addMacro()
            }

            TextField {
              width: parent.width * 0.62 - Style.spacing.md
              placeholderText: "Formula, e.g. 2d20kh1"
              text: root.newMacroFormula
              foreground: root.fg
              onTextEdited: root.newMacroFormula = text
              onAccepted: root.addMacro()
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

          // ... existing "Custom dice" header, Add custom die button, form, and list ...
        }
```

The `// ... existing ...` comments mark where the untouched original elements go; move them verbatim.

- [ ] **Step 3: Verify in the shell**

Run: `omarchy restart shell && sleep 3 && journalctl --user -n 200 --no-pager | grep -iE "madcar.dice|Panel.qml|ReferenceError|TypeError" | tail -20`
Expected: no errors. Manual checks:
- Panel order: formula, Macros ("No macros yet…"), Dice, Results, Settings (collapsed).
- Settings → add `Advantage` / `2d20kh1` → button appears in Macros; clicking rolls it, result labelled `2d20kh1`.
- Add `Bad` / `4d` → inline error `Expected die size after d at 3`, nothing saved.
- `omarchy restart shell` → macro still there. `cat ~/.local/state/omarchy/dice/state.json` shows `"macros":[{"name":"Advantage","formula":"2d20kh1"}]`.
- Remove the macro with ×; file updates.

- [ ] **Step 4: Run the full checks**

Run: `node --test test/ && omarchy plugin validate /mnt/data/projects/omarchy-plugin-dice`
Expected: 43 tests PASS; validate passes.

- [ ] **Step 5: Commit**

```bash
git add Panel.qml
git commit -m "Add saved macros and collapse settings beneath results"
```

---

### Task 13: Docs, install, retire the old plugin

**Files:**
- Rewrite: `README.md`
- Rewrite: `AGENTS.md`
- Delete: `preview.png` (shows the old UI; take a new one after install and add it back as `preview.png`)

**Interfaces:** none.

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# Dice

An [Omarchy](https://omarchy.org/) shell plugin that rolls tabletop RPG dice
from the status bar using Roll20 / FoundryVTT notation — `2d20kh1`, `4d6dl1`,
`3d6!` — with saved macros, standard and Fate dice, custom dice, and an
optional roll sound.

Forked from Christopher Rueber's
[omarchy-plugin-rpgdice](https://github.com/crueber/omarchy-plugin-rpgdice)
(MIT). The formula engine, macros, and per-die result traces are new; the
hardened state handling and theme integration are his.

![Dice panel](preview.png)

## Features

- **Formula box** — type any expression and press Enter. Up/Down recall recent
  formulas.
- **Macros** — save named formulas (Advantage `2d20kh1`, Stats `4d6dl1`) as
  one-click buttons.
- **Per-die results** — every die is shown; dropped and rerolled dice are
  dimmed and struck through, exploded dice are marked `!`.
- **Standard dice** — d4 … d20, d% (d100), all rolling on click.
- **Fate dice (dF)** — one click rolls `4dF`.
- **Custom dice** — numeric (1–1,000,000 sides) or explicit faces
  (`heads, tails`).
- **Sound** — toggleable roll sound with adjustable volume.
- **Persistent state** — sound, volume, macros, custom dice and recent formulas
  survive restarts.

## Notation

| Write | Meaning | Example |
|---|---|---|
| `NdX` | roll N dice with X sides | `3d6` |
| `d%` / `dF` | percentile die / Fate die (−, 0, +) | `d%`, `4dF` |
| `+ - * /` `( )` | arithmetic; division rounds to nearest | `(2d6+3)*2` |
| `kh N` / `kl N` | keep N highest / lowest | `2d20kh1` |
| `dh N` / `dl N` | drop N highest / lowest | `4d6dl1` |
| `k N` / `d N` | shorthand for `kh` / `dl` | `4d6k3` |
| `!` | explode: max face rolls another die | `3d6!` |
| `!!` | compound: exploded dice add into one | `3d6!!` |
| `!p` | penetrating: each extra die −1 | `3d6!p` |
| `r` / `ro` | reroll while / reroll once | `2d6r1`, `d20ro<3` |
| `> < >= <= =` | targets for `!` and `r` | `d6!>4`, `d10r<=2` |

Modifiers apply in Roll20 order: reroll, then explode, then keep/drop. Limits:
200 characters, 1000 dice per term, 16 nested parentheses, 100 rerolls or
explosions per starting die.

## Installation

```sh
omarchy plugin add https://github.com/MadCar-Dev/omarchy-plugin-dice.git --enable
```

If you had `crueber.rpgdice` installed, its sound, volume, and custom dice are
imported on first launch. Disable the old widget with
`omarchy plugin disable crueber.rpgdice`.

## Removal

```sh
omarchy plugin remove madcar.dice --yes
```

State lives in `~/.local/state/omarchy/dice/state.json` and survives removal.

## Configuration

The bar icon is overridable via the widget's entry in
`~/.config/omarchy/shell.json` (the default is the d20 glyph, U+F1155):

```json
{ "id": "madcar.dice", "icon": "d20" }
```

## Development

QML hot-reloads on save under `~/.config/omarchy/plugins/madcar.dice/`.
`Dice.js` and `Model.js` do **not** — run `omarchy restart shell` after editing
them. Tests need node ≥ 20:

```sh
node --test test/
omarchy plugin validate ~/.config/omarchy/plugins/madcar.dice
```

| File | Purpose |
|------|---------|
| `manifest.json` | Plugin manifest |
| `BarWidget.qml` | Bar pill (d20 icon), panel lifecycle, IPC |
| `Panel.qml` | Popup panel: formula, macros, dice, results, settings, persistence |
| `Dice.js` | Formula parser, roller, formatter — pure JS, tested under node |
| `Model.js` | Dice objects, text sanitizing, state schema v2 |
| `test/` | node tests for `Dice.js` and `Model.js` |
| `assets/dice-roll.wav` | Bundled roll sound |

## License

[MIT](LICENSE)
```

- [ ] **Step 2: Rewrite `AGENTS.md`**

Keep the original's **Hard rules** (bounded reads, persistence, theme, sanitize) verbatim, and replace the rest so the file reads:

```markdown
# AGENTS.md

Guidance for agents (and humans) working on this Omarchy shell plugin.

## What this is

A `bar-widget` plugin for the Omarchy shell (Quickshell), id `madcar.dice`,
forked from `crueber/omarchy-plugin-rpgdice`. A d20 icon in the bar opens a
panel that rolls Roll20/Foundry dice formulas, saved macros, and dice buttons.
Repo: `MadCar-Dev/omarchy-plugin-dice`; installed checkout at
`~/.config/omarchy/plugins/madcar.dice/`.

## Layout

| File | Role |
|------|------|
| `manifest.json` | Plugin manifest |
| `BarWidget.qml` | Bar pill, panel lifecycle, IPC |
| `Panel.qml` | Popup: formula box, macros, dice, results, settings, state load/save |
| `Dice.js` | Formula parser + roller + formatter. Pure JS, no QML imports |
| `Model.js` | Dice objects, `plainText`, state schema v2. Pure JS, no QML imports |
| `test/` | `node --test` suites for `Dice.js` and `Model.js`; `rng.js` has `scripted`/`seeded` rngs |

## Development loop

- QML hot-reloads on save. **`Dice.js` and `Model.js` do not** — the shell
  caches compiled JS imports. After editing either: `omarchy restart shell`.
- Before committing: `node --test test/*.test.js` and `omarchy plugin validate <dir>`.
- Check for load errors: `journalctl --user | grep -i madcar.dice`.
- Pure-JS files export to node only via
  `if (typeof module !== "undefined" && module.exports) module.exports = {...}`
  at the end of the file. No `.pragma`, `.import`, `import`, or `export`.

## Hard rules

(… the original four subsections: **Bound every file read**, **Persistence**,
**Theme**, **Sanitize user text** — unchanged, with `rpgdice` paths replaced
by `~/.local/state/omarchy/dice/state.json` …)

## Dice semantics (`Dice.js`)

- `rng(sides)` returns an integer in `1..sides`; tests inject `scripted([...])`.
- Per term, modifiers apply in fixed order: **reroll → explode → keep/drop**.
- Trace entry `{ value, kept, rerolled, exploded, faces? }`. Dropped and
  rerolled dice stay in the trace with `kept: false`; totals sum kept values.
- `dF` faces are −1/0/+1 and total numerically; explode/reroll on `dF` is a
  parse error. Explicit-sides custom dice never enter the formula path.
- Division rounds to nearest (Roll20); `raw` keeps the unrounded value.
- Limits in `LIMITS`: 200 chars, 1000 dice/term, 1e6 sides, 100
  reroll+explode steps per starting die, 16 nesting levels. Every limit is a
  returned error, never a thrown one.

## State (`Model.js`)

- Schema v2: `{ version, soundEnabled, volume, customDice, macros, recent }`.
  v1 files (rpgdice) load as v2. Caps: 128 custom dice, 64 macros, name ≤ 32,
  formula ≤ 200, 20 recent.
- `parseState(raw, isValid)` takes the formula validator as a parameter so
  `Model.js` never imports `Dice.js`.
```

- [ ] **Step 3: Install for real and retire the old plugin**

Replace the development symlink with a proper install, then disable the original:

```bash
omarchy plugin disable madcar.dice
rm ~/.config/omarchy/plugins/madcar.dice
git -C /mnt/data/projects/omarchy-plugin-dice push origin master
omarchy plugin add https://github.com/MadCar-Dev/omarchy-plugin-dice.git --enable
omarchy plugin disable crueber.rpgdice
omarchy restart shell
sleep 3
omarchy plugin list | grep -E "dice|rpgdice"
journalctl --user -n 200 --no-pager | grep -iE "madcar.dice|Panel.qml|Dice.js|ReferenceError|TypeError" | tail
```

Expected: `madcar.dice enabled`, `crueber.rpgdice disabled`, clean journal, one d20 icon in the bar. Open the panel: macros and custom dice are present (imported or saved earlier).

- [ ] **Step 4: New preview image**

Open the panel with a couple of results showing (a `4d6dl1` with a struck die), take a screenshot of the panel region with `omarchy-cmd-screenshot` (or `grim -g "$(slurp)" preview.png`), save as `preview.png` in the repo root.

- [ ] **Step 5: Commit and push**

```bash
git add README.md AGENTS.md preview.png
git commit -m "Document the dice formula engine and macros"
git push origin master
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Engine API, grammar, semantics, limits | 2–7 |
| Results and rendering (trace, dim, strikeout, `!`, compound, Fate faces-only, errors with column) | 10, 11 |
| Panel layout (formula, macros, dice roll-on-click, results, settings collapsed) | 10, 12 |
| Persistence v2, caps, bounded read/write, legacy import | 8, 9 |
| Repo, packaging, install, README/AGENTS, disable rpgdice | 1, 13 |
| Testing (node runner, seeded rng, listed cases, QML journal check) | 2–8, verification steps in 9–13 |

Gaps closed while writing: the spec's "eval shim" became a guarded `module.exports` (simpler, same effect); the spec's `rng() -> [0,1)` became `rng(sides) -> 1..sides` so scripted tests are exact; the iteration budget is per starting die rather than per term so `100d6r1` works; Fate terms total numerically in formulas (the dF **button** rolls `4dF`), while explicit-sides dice keep the faces-only display. The spec is amended to match.

**Placeholder scan:** none. The `// ... existing ...` markers in Task 12 refer to concrete original blocks named in the same step.

**Type consistency:** `rollFormula(text, source)`, `pushHistory(entry)`, `rollDieButton(die)`, `isValidFormula(text)`, `dieText(die, term)`, `dieColor(die)`, `addMacro()`, `removeMacro(name)`, `recentStep(delta)` are defined once and used with those names. History entry and term/trace shapes match between Tasks 10 and 11 and `Dice.js` (Tasks 3–7). `Model.parseState(raw, isValid)` signature matches Tasks 8 and 9.
