# birdboard v4.5

A split keyboard designed with [Ergogen](https://ergogen.xyz). It's handwired, like the
[Scotto44](https://scottokeebs.com/blogs/keyboards/scotto44): there is no PCB. The Gateron
low-profile switches clip into a 3D-printed plate that covers just the keys. The 1N4148 diodes
and the 18 AWG solid copper rows and columns are soldered straight onto the switch pins. Each
half has two pods at the top of its case. The RP2040-Zero sits in the outer one, and its USB-C
port is the connection to the computer. A USB-C breakout sits in the inner one, as the link to
the other half. Both ports come out of the top wall, and the plate covers both pods.

## Setup

```bash
pnpm install
```

## Generating the STLs

The printable STLs are kept in the repo in `stl/`:

| File | Part |
| --- | --- |
| `keyboard_case.stl`, `keyboard_case_right.stl` | cases, with the module seats and standoffs |
| `switchplate.stl`, `switchplate_right.stl` | switch plates (they also cover the pods) |
| `keyboard_case_art.stl`, `keyboard_case_art_right.stl` | the moose on the case's underside, in a second colour |
| `switchplate_text.stl`, `switchplate_text_right.stl` | "moose" on the plate's top, in a second colour |

### The moose on the underside

Seen from below, each case reads as a cartoon moose head, drawn in one colour in
[art/moose.js](art/moose.js):
- **Head:** a line just inside the case edge, following it round the key area.
- **Antlers:** small blocky antlers with three prongs each, in the two pods.
- **Face:** a simple line face on the thumb-cluster muzzle.

It's inlaid into the case's bottom face, `art_depth` (0.6 mm, 3 layers) deep. To print it in two
colours, load `keyboard_case.stl` and `keyboard_case_art.stl` together as one multi-part object.
They share coordinates, so they line up. Give the art its own filament and print the case floor
down.

`npm run build` writes a preview of each half, seen from below, to `output/art/moose_left.svg`
and `output/art/moose_right.svg`.

The word "moose" is also hand-lettered on top of each switch plate, in [art/text.js](art/text.js).
It sits in the band of plate below the thumb cluster, which still shows with the keycaps on,
and runs parallel to the bottom edge. It reads left to right on both halves. It's inlaid the same
way, 0.6 mm into the plate's top face. The plate prints top-down, so the lettering comes out in the
first layers. Load `switchplate.stl` and `switchplate_text.stl` together as one multi-part object.
The previews, seen from above with the keycaps shaded, are `output/art/text_left.svg` and
`text_right.svg`.

## Wiring guide

`npm run build` also draws a wiring guide for each half: `output/wiring/wiring_left.svg` and
`wiring_right.svg`. Each is seen from below, as you wire it. The matching
`output/wiring/report_*.md` files have the MCU pin map, the assembly order and the wire lengths.
Both halves use the same pin map.

## Other commands

- `npm run build`: builds Ergogen and the wiring guides into `output/`.
- `npm run view`: starts the local viewer at http://localhost:4600. It rebuilds on every edit and shows the outlines and the 3D cases.
