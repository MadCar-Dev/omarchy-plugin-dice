"use strict"

// rng(sides) -> integer 1..sides. Two deterministic providers for tests.

// Returns the given faces in order; throws if a test rolls more dice than it
// scripted, so a bug that rolls extra dice fails loudly. The thrown errors
// are dice-tagged ({ dice: true, error, column }), the same shape Dice.js's
// own parser/evaluator errors use, so Dice.evaluate's catch recognizes them
// and surfaces the message instead of masking it as "Could not roll
// formula". A test that expects { ok: true, ... } but under-scripts its rng
// (or scripts a face outside 1..sides) fails with that message
// ("scripted rng exhausted" / "scripted face N outside 1..sides") rather
// than a generic one, and rerolls/explodes still deduct against the same
// per-die budget checked in Dice.js's own limit tests.
function scripted(values) {
  var queue = values.slice()
  function rng(sides) {
    if (queue.length === 0) throw { dice: true, error: "scripted rng exhausted", column: 0 }
    var v = queue.shift()
    if (v < 1 || v > sides) throw { dice: true, error: "scripted face " + v + " outside 1.." + sides, column: 0 }
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
