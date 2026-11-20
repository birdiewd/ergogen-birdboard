# birdboard v4.5

A split keyboard designed with [Ergogen](https://ergogen.xyz). It's handwired, like the
[Scotto44](https://scottokeebs.com/blogs/keyboards/scotto44): there is no PCB. The Gateron
low-profile switches clip into a 3D-printed plate that covers just the keys. The 1N4148 diodes
and the 18 AWG solid copper rows and columns are soldered straight onto the switch pins. Each
half's RP2040-Zero and USB-C breakout sit in seats on the case floor, under a flat cover beside
the keys.

## Setup

```bash
pnpm install
```

## Generating the STLs

The printable STLs are kept in the repo in `stl/`:

| File | Part |
| --- | --- |
| `keyboard_case.stl`, `keyboard_case_right.stl` | cases, with the module seats and standoffs |
| `switchplate.stl`, `switchplate_right.stl` | switch plates |
| `mcu_cover.stl`, `mcu_cover_right.stl` | covers over the electronics strip |

After changing the design (`config.yaml`, `footprints/` or `wiring/`), regenerate them:

```bash
npm run stl
```

This runs [viewer/export-stl.js](viewer/export-stl.js). It builds the project into `output/`,
converts every `output/cases/*.jscad` to a binary STL with OpenJSCAD, and replaces the files in
`stl/`.

`output/` is build output and is ignored by git, so commit `stl/` after regenerating:

```bash
git add stl && git commit -m "Regenerate STLs"
```

## Wiring guide

`npm run build` also draws a wiring guide for each half: `output/wiring/wiring_left.svg` and
`wiring_right.svg`. Each is seen from below, as you wire it. The matching
`output/wiring/report_*.md` files have the MCU pin map, the assembly order and the wire lengths.
Both halves use the same pin map.

## Other commands

- `npm run build`: builds Ergogen and the wiring guides into `output/`.
- `npm run view`: starts the local viewer at http://localhost:4600. It rebuilds on every edit and shows the outlines and the 3D cases.
