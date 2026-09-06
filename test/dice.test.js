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
