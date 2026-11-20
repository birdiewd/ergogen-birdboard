# birdboard v4

A split keyboard designed with [Ergogen](https://ergogen.xyz). Instead of an FR4 PCB, v4 uses a
3D-printed wiring board, with channels for hand-laid 18 AWG solid copper wire.

## Setup

```bash
pnpm install
```

## Generating the STLs

The printable STLs are kept in the repo in `stl/`:

| File | Part |
| --- | --- |
| `wireboard_left.stl`, `wireboard_right.stl` | wiring boards |
| `keyboard_case.stl`, `keyboard_case_right.stl` | cases |
| `switchplate.stl`, `switchplate_right.stl` | switch plates |
| `mcu_cover.stl`, `mcu_cover_right.stl` | MCU covers |

After changing the design (`config.yaml`, `footprints/` or `wiring/`), regenerate them:

```bash
npm run stl
```

This runs [viewer/export-stl.js](viewer/export-stl.js). It builds the project into `output/`,
converts every `output/cases/*.jscad` to a binary STL with OpenJSCAD, and replaces the files in
`stl/`. If the wiring check finds clashes, it prints a warning; see
`output/wiring/report_left.md` and `output/wiring/report_right.md`. The wiring boards take
about a minute to convert.

`output/` is build output and is ignored by git, so commit `stl/` after regenerating:

```bash
git add stl && git commit -m "Regenerate STLs"
```

## Other commands

- `npm run build`: builds Ergogen and the wiring boards into `output/`. This includes the `.jscad` files, the wiring maps (`output/wiring/wiring_map_*.svg`) and the assembly reports.
- `npm run view`: starts the local viewer at http://localhost:4600. It rebuilds on every edit and shows the outlines and the 3D cases.
