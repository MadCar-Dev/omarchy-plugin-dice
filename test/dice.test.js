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

// Regression for the Panel.qml formula path: the panel used to run every
// formula through Model.plainText before Dice.parse. plainText strips
// '<'/'>', silently turning "2d6r<2" into "2d6r2" with no error. These
// compare operators must parse intact — pins the grammar the panel relies on.
test("parse: comparison operators survive intact (panel must not run formulas through Model.plainText)", () => {
  const cases = [
    { formula: "2d6r<2", pick: (ast) => ast.reroll.cmp.op, op: "<" },
    { formula: "d6!>4", pick: (ast) => ast.explode.cmp.op, op: ">" },
    { formula: "d6r>=5", pick: (ast) => ast.reroll.cmp.op, op: ">=" },
    { formula: "d10r<=2", pick: (ast) => ast.reroll.cmp.op, op: "<=" },
    { formula: "d20ro<3", pick: (ast) => ast.reroll.cmp.op, op: "<" }
  ]
  for (const c of cases) {
    const p = Dice.parse(c.formula)
    assert.equal(p.ok, true, c.formula)
    assert.equal(c.pick(p.ast), c.op, c.formula)
  }
})

test("parse: a formula of exactly 200 characters is accepted", () => {
  const formula = "1+".repeat(99) + "10"
  assert.equal(formula.length, 200)
  const p = Dice.parse(formula)
  assert.equal(p.ok, true)
})

test("roll: 2d6!!kh1 keeps the compounded die over the plain one", () => {
  const r = Dice.evaluate("2d6!!kh1", scripted([6, 6, 2, 4])).result
  assert.deepEqual(r.terms[0].trace, [
    { value: 14, kept: true, rerolled: false, exploded: true, faces: [6, 6, 2] },
    { value: 4, kept: false, rerolled: false, exploded: false }
  ])
  assert.equal(r.total, 14)
})

test("parse: bare k with no explicit count means kh1", () => {
  assert.deepEqual(Dice.parse("d6k").ast.keep, { mode: "kh", count: 1 })
})

test("evaluate: literal 0 totals zero", () => {
  assert.equal(Dice.evaluate("0").result.total, 0)
})

test("evaluate: unary minus on a dice term", () => {
  assert.equal(Dice.evaluate("-d6", scripted([4])).result.total, -4)
})

test("evaluate: multiplication by a negative number", () => {
  assert.equal(Dice.evaluate("d6*-1", scripted([3])).result.total, -3)
})

test("parse: whitespace cannot separate a dice term from its modifiers", () => {
  assert.deepEqual(Dice.parse("3d6 kh1"), { ok: false, error: 'Unexpected "k"', column: 5 })
})
