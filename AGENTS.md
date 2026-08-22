# AGENTS.md

Guidance for agents (and humans) working on this Omarchy shell plugin.

## What this is

A `bar-widget` plugin for the Omarchy shell (Quickshell). It renders a d20 icon
in the bar that opens a popup panel for rolling RPG dice. It lives at
`~/.config/omarchy/plugins/crueber.rpgdice/` and is a git checkout of
`git.packden.us/crueber/omarchy-plugin-rpgdice`.

## Layout

| File | Role |
|------|------|
| `manifest.json` | Plugin manifest (id, kinds, entry points, widget metadata) |
| `BarWidget.qml` | Bar pill (d20 icon), panel lifecycle, and IPC |
| `Panel.qml` | Popup panel: Settings/Dice/Results, roll debounce, sound, persistence |
| `Model.js` | Pure dice logic and state (de)serialization — no QML imports |
| `assets/dice-roll.wav` | Bundled roll sound |

## Development loop

- QML files under the plugin dir hot-reload on save.
- **`Model.js` does not reliably hot-reload.** The shell caches compiled JS
  imports, so a `Model.js` change can silently keep running the old code.
  After editing `Model.js`, run `omarchy restart shell`.
- Validate before committing: `omarchy plugin validate <plugin-dir>`.
- Force a plugin rescan: `omarchy-shell shell rescanPlugins`.
- Check for load errors: `journalctl --user` (grep for the plugin id).

## Hard rules

### Bound every file read (memory gating)

The shell is a single long-lived process. Never read a file into it without a
size bound — an oversized or corrupt file forces unbounded allocation.

- `FileView` reads the *entire* file before any code can validate or reject it.
  Do not use it for user-writable files.
- Read `state.json` with a stat-gated `Process` that only `cat`s files under
  `MAX_STATE_BYTES` (64 KiB). See `Panel.qml`'s `stateLoader`.
- Cap the in-memory model too: `MAX_CUSTOM_DICE` (128) and `MAX_SIDES` (256)
  in `Model.js`. A file under the byte cap can still contain a huge array.

### Persistence

- State lives at `~/.local/state/omarchy/rpgdice/state.json`.
- Read: the bounded `Process` above. Write: `Util.execDetached` with
  `Util.shellQuote` — never interpolate raw strings into a shell command.

### Theme

Use `qs.Ui` / `qs.Commons` components and `Color` / `Style` tokens. Never
hardcode colors or sizes; the active theme drives them.

### Sanitize user text

Custom die names and sides are user input rendered by `Text`. Run them through
`Model.plainText` (strips `<>&`) and set `textFormat: Text.PlainText` to
prevent rich-text injection into the long-lived shell.

## Dice semantics

- Fate (`dF`) and explicit-sides dice are non-additive: `rollDie` returns
  `value: null` for them, so they show faces only (no group total). A blank
  Fate face displays empty, not `0`.
- Only all-numeric groups show a `= total`.
- Results group identical dice (`d6: 3, 4, 5`), values in roll order.

## Testing

`Model.js` is pure JS (no QML imports) — test it directly with any JS runtime
(e.g. `bun`). The QML is verified by loading it in the shell and checking
`journalctl --user` for errors.
