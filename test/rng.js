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
