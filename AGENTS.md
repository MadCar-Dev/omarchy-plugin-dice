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

### Bound every file read (memory gating)

The shell is a single long-lived process. Never read a file into it without a
size bound — an oversized or corrupt file forces unbounded allocation.

- `FileView` reads the *entire* file before any code can validate or reject it.
  Do not use it for user-writable files.
- Read `state.json` with the bounded `Process` in `Panel.qml`'s `stateLoader`:
  a single `dd` open (`iflag=nofollow,nonblock`) so a symlink is refused and a
  FIFO can't hang, a byte cap of `MAX_STATE_BYTES`, and a `timeout` deadline.
  Never `test`/`stat` the path and then `cat` it — the path can change in
  between, redirecting or hanging the read.
- Cap the in-memory model too: `MAX_CUSTOM_DICE` (128) and `MAX_SIDES` (256)
  in `Model.js`. A file under the byte cap can still contain a huge array.

### Persistence

- State lives at `~/.local/state/omarchy/dice/state.json`.
- Read: the bounded `Process` above. Write: `mktemp` a file in the state dir,
  print the JSON into it, then `mv -f` it over `state.json` — a plain
  `> state.json` follows a symlink and truncates its target.
- Use `Util.execDetached` with `Util.shellQuote` — never interpolate raw
  strings into a shell command.

### Theme

Use `qs.Ui` / `qs.Commons` components and `Color` / `Style` tokens. Never
hardcode colors or sizes; the active theme drives them.

### Sanitize user text

Custom die names and sides are user input rendered by `Text`. Run them through
`Model.plainText` (strips `<>&`) and set `textFormat: Text.PlainText` to
prevent rich-text injection into the long-lived shell.

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
