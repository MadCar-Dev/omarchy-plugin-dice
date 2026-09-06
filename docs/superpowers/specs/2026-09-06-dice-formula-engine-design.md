# Dice formula engine — design

**Status:** Approved by Will 2026-09-06 17:36 CT (brainstorm in Ada's session); amended 2026-09-06 while planning (rng contract, per-die budget, Fate totals, node export)
**Repo:** `MadCar-Dev/omarchy-plugin-dice`, forked from `crueber/omarchy-plugin-rpgdice`
**Plugin id:** `madcar.dice` (replaces `crueber.rpgdice` in the bar)

## Goal

Turn the RPG Dice bar widget into a formula-driven roller that understands the
Roll20 / FoundryVTT dice notation Will uses at the table — `2d20kh1`
(advantage), `4d6dl1` (stats), exploding dice — while keeping what the
original does well: click-to-roll buttons, Fate dice, custom dice, sound,
theme-driven styling, and hardened state persistence.

## Non-goals (v1)

- Success counting (`cs>`, `cf<`), `min`/`max` modifiers, sorting (`s`),
  grouped rolls (`{...}`), inline labels (`[fire]`). Add when missed.
- Any network, macros shared across machines, or dice for non-numeric
  formulas beyond the existing Fate and explicit-sides dice.
- Upstreaming. This is Will's fork; the author is credited, not consulted.

## Architecture

Three source units, one new:

| File | Role | Depends on |
|---|---|---|
| `Dice.js` (**new**) | Pure JS. Tokenizer, recursive-descent parser, evaluator with per-die traces, formatter. No QML imports. | nothing |
| `Model.js` | Existing dice objects, state (de)serialization, text sanitizing. Gains schema v2 (macros, recent formulas). Formula validator injected as `parseState(raw, isValid)`. | nothing |
| `Panel.qml` | Popup UI: formula box, macro grid, dice grid, results, settings. | `Dice.js`, `Model.js`, `qs.Ui`, `qs.Commons` |
| `BarWidget.qml` | Bar pill, IPC. Unchanged except ids. | `Model.js` |

`Dice.js` is the unit with all the logic risk, so it is the unit with the
tests. It can be exercised by node with no shell running.

## Engine (`Dice.js`)

### API

```
Dice.parse(text)            -> { ok: true, ast } | { ok: false, error, column }
Dice.roll(ast, rng)         -> Result
Dice.evaluate(text, rng)    -> { ok: true, result } | { ok: false, error, column }
Dice.format(result)         -> plain-text summary, e.g. "4d6dl1 → 6 5 4 [3] = 15"
Dice.LIMITS                 -> { maxDice, maxSides, maxIterations, maxLength, maxDepth }
```

`rng(sides)` returns an integer in `1..sides`. Production passes
`Dice.defaultRng`; tests pass a scripted or seeded generator so every case is
exact.

### Grammar

```
expr     := term (('+' | '-') term)*
term     := factor (('*' | '/') factor)*
factor   := number | dice | '(' expr ')' | '-' factor
dice     := [count] 'd' sides modifier*
sides    := integer | '%' | 'F'
modifier := keep | explode | reroll
keep     := ('kh' | 'kl' | 'dh' | 'dl' | 'k' | 'd') [integer]
explode  := '!' ['!' | 'p'] [compare]
reroll   := ('r' | 'ro') compare
compare  := ['>' | '<' | '>=' | '<=' | '='] integer
```

- Whitespace is ignored between tokens. Input is case-insensitive.
- `count` defaults to 1. `d%` is `d100`. `dF` has faces `-1, 0, +1`.
- Bare `k` means `kh`; bare `d` means `dl` (Roll20). Missing keep/drop count
  defaults to 1.
- A bare integer after `r`/`ro`/`!` means `=`. `!` with no compare explodes on
  the maximum face. `r` with no compare is a parse error (nothing to reroll).
- `dF` accepts keep/drop; explode and reroll on `dF` are parse errors.
- Division is floating point, result rounded to the nearest integer at the
  end (Roll20 rounds; Foundry truncates — Roll20 wins, and the formatter shows
  the unrounded value when it differs).

### Semantics and order of evaluation

Per dice term, modifiers apply in this fixed order regardless of how they were
written, matching Roll20:

1. **Reroll** (`r` reroll until the compare fails, `ro` reroll once). Rerolled
   values stay in the trace flagged `rerolled: true`, `kept: false`.
2. **Explode** (`!` add a die per triggering die, recursively; `!!` compound
   into one value; `!p` penetrating: each added die is rolled then minus 1).
   Added dice are flagged `exploded: true`.
3. **Keep/drop** over the surviving dice (compound dice count as one).
   Dropped dice are flagged `kept: false`.

Trace element: `{ value, kept, rerolled, exploded, faces }` where `faces` is
present only for compounded dice (the sequence that summed). Term result:
`{ text, sides, trace, total }`. Result: `{ total, terms, text }` where
`terms` is in source order and arithmetic-only nodes contribute nothing to
`terms`.

### Limits (the shell is one long-lived process)

| Limit | Value | Why |
|---|---|---|
| `maxLength` | 200 chars | bounds tokenizer work |
| `maxDice` | 1000 per term, after explosions | bounds trace memory |
| `maxSides` | 1,000,000 | matches existing custom-die cap |
| `maxIterations` | 100 reroll/explode steps per starting die | `d1!` and `d6r>0` terminate; `100d6r1` still works |
| `maxDepth` | 16 nested parentheses | bounds recursion |

Hitting a limit is a **result error**, not an exception: `evaluate` returns
`{ ok: false, error: "…" }`. Nothing in `Dice.js` throws to QML.

## Results and rendering

- `history`: last **10** rolls, newest first. Entry:
  `{ formula, total, terms, time, source }` where `source` is
  `"formula" | "macro:<name>" | "die:<label>"`.
- Row 1: formula as typed (plain text, sanitized) left, total right in
  `Color.accent`, bold.
- Row 2+: one line per dice term: `4d6dl1 → 6 5 4 3`. Each die is its own
  `Text`: kept dice in `root.fg`; dropped and rerolled dice in
  `Qt.darker(root.fg, 1.8)` with `font.strikeout: true`; exploded dice suffixed
  with `!` in `Color.accent`; compound dice show `6+6+2`.
- Fate dice show faces (`- 0 +`) and total numerically (the dF button rolls
  `4dF`). Explicit-sides custom dice keep the faces-only display and no total
  (`total: null`), exactly as today.
- Parse errors show inline under the formula box in `Color.urgent` with the
  caret column: `Unexpected "x" at 5`.

## Panel layout (top → bottom)

1. **Formula box** — `TextField`, placeholder `2d20kh1 + 5`, Enter rolls,
   Up/Down cycle recent formulas. Error line beneath when invalid.
2. **Macros** — `Grid` of `Button`s, label = macro name, tooltip = formula.
   Click rolls immediately. Empty state: "No macros yet — add one in Settings".
3. **Dice** — existing grid: standard dice, `dF`, custom dice. Click rolls
   **immediately** (debounce and `pending` queue removed). A standard-die
   click evaluates the formula `1dN` so it flows through the same path.
4. **Results** — as above.
5. **Settings** — collapsed by default. Sound toggle, volume, **Add macro**
   (name + formula; formula validated by `Dice.parse` before saving, error
   shown inline), macro list with remove, **Add custom die** (unchanged),
   custom-die list.

All components from `qs.Ui`; colors and sizes from `Color` / `Style`. No
hardcoded values. User text through `Model.plainText` with
`textFormat: Text.PlainText`.

## Persistence

- Path: `~/.local/state/omarchy/dice/state.json`.
- Schema v2:

  ```json
  {
    "version": 2,
    "soundEnabled": true,
    "volume": 60,
    "customDice": [ { "name": "coin", "kind": "sides", "sides": ["heads","tails"] } ],
    "macros": [ { "name": "Advantage", "formula": "2d20kh1" } ],
    "recent": [ "4d6dl1", "1d20+5" ]
  }
  ```

- Caps: `MAX_MACROS` 64, macro name ≤ 32 chars, formula ≤ 200 chars,
  `recent` ≤ 20. Formulas are re-validated with `Dice.parse` on load; invalid
  ones are dropped silently.
- Read/write: **unchanged** from the original — bounded `dd` read with
  `iflag=nofollow,nonblock`, `timeout`, `MAX_STATE_BYTES`; atomic
  `mktemp` + `mv -f` write; `Util.shellQuote` on every interpolated string.
- **Import**: on first run, if `~/.local/state/omarchy/dice/state.json` is
  absent and `~/.local/state/omarchy/rpgdice/state.json` exists, read it
  (same bounded reader), take sound/volume/customDice, write v2. The old file
  is left in place.

## Repo, packaging, install

- `manifest.json`: `id` `madcar.dice`, `name` "Dice", version `2.0.0`,
  author "Will McCandless", description updated. `moduleName` / `ipcTarget`
  / IPC `target` all become `madcar.dice`.
- `LICENSE`: MIT, keep the original copyright line, add
  "Copyright (c) 2026 Will McCandless" beneath it.
- `README.md`: rewritten for the fork — notation reference table, install via
  `omarchy plugin add https://github.com/MadCar-Dev/omarchy-plugin-dice.git --enable`,
  credit to Christopher Rueber's original.
- `AGENTS.md`: keep the hard rules (bounded reads, persistence, theme,
  sanitize). Add: `Dice.js` semantics summary, "run `node --test` before
  committing", and the `Model.js`/`Dice.js` hot-reload caveat
  (`omarchy restart shell`).
- Install here: `omarchy plugin add <github url> --enable`, then
  `omarchy plugin disable crueber.rpgdice`. The old plugin stays on disk until
  Will removes it.

## Testing

- `test/dice.test.js` with node's built-in runner (`node --test`), no deps.
  `Dice.js` and `Model.js` end with a guarded
  `if (typeof module !== "undefined" && module.exports) module.exports = {...}`
  that QML ignores (documented in AGENTS.md).
- Scripted rng (exact faces) plus seeded mulberry32 for volume tests. Coverage, at minimum:
  - parse: every grammar production; case-insensitivity; whitespace; errors
    with correct column for `4d`, `d6k`, `2d20kh1kh1` (a second keep is a
    parse error), `dF!`, unbalanced parens, over-length input.
  - roll: `4d6dl1` drops exactly the lowest and total matches the kept three;
    `2d20kh1`; `kl`/`dh`; `!` chain length with seeded forcing; `!!` compounds
    into one trace entry with `faces`; `!p` subtracts 1 from added dice; `r1`
    rerolls until non-1, `ro1` rerolls at most once; compare forms `>`, `<`,
    `>=`, `<=`, `=`; `d%`; `dF` totals; arithmetic precedence; unary minus;
    division rounding.
  - limits: `1000d6!` and `d1!` terminate with an error, not a hang; 201-char
    input rejected; 17 nested parens rejected.
  - format: string shape for the README examples.
- `Model.js`: `parseState` v1 → v2 upgrade, macro validation and caps, recent
  list trimming.
- QML: load in the shell, `journalctl --user -g madcar.dice` clean, manual
  checks of each panel section and the dropped-die dim rendering.

## Success criteria

1. `4d6dl1` shows `6 5 4 3` with the 3 struck and dimmed and totals 15.
2. `2d20kh1` shows both dice, keeps the higher.
3. `3d6!` shows exploded dice marked and counted.
4. Macros persist across `omarchy restart shell` and a reboot.
5. Existing custom dice from `crueber.rpgdice` appear after first launch.
6. `node --test` green; `omarchy plugin validate` passes; journal clean.
