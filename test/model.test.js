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

test("parseState: defaults are a fresh copy, not the shared DEFAULT_STATE object", () => {
  const s = Model.parseState("", isValid)
  assert.notEqual(s, Model.DEFAULT_STATE)
  assert.notEqual(s.customDice, Model.DEFAULT_STATE.customDice)
  assert.deepEqual(s, Model.DEFAULT_STATE)
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
