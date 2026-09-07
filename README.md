# Dice

An [Omarchy](https://omarchy.org/) shell plugin that rolls tabletop RPG dice
from the status bar using Roll20 / FoundryVTT notation — `2d20kh1`, `4d6dl1`,
`3d6!` — with saved macros, standard and Fate dice, custom dice, and an
optional roll sound.

Forked from Christopher Rueber's
[omarchy-plugin-rpgdice](https://github.com/crueber/omarchy-plugin-rpgdice)
(MIT). The formula engine, macros, and per-die result traces are new; the
hardened state handling and theme integration are his.

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
200 characters, 1000 dice per term including rerolled and exploded dice,
16 nested parentheses, 100 rerolls or explosions per starting die.

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
node --test test/*.test.js
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
