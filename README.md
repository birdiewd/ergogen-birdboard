# birdboard v4.6

A split keyboard designed with [Ergogen](https://ergogen.xyz). The art on the case and plate,
and the keycap legends, are UV printed. It's handwired, like the
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
| `keyboard_case.stl`, `keyboard_case_right.stl` | cases, with the module seats and standoffs, and a 0.8 mm chamfer round the bottom edge |
| `switchplate.stl`, `switchplate_right.stl` | switch plates (they also cover the pods) |

The case and plate print in one colour. The art on them is UV printed afterwards.

## The art, UV printed

Seen from below, each case reads as a cartoon moose head, drawn in one colour in
[art/moose.js](art/moose.js):
- **Head:** a line just inside the case edge, following it round the key area.
- **Antlers:** small blocky antlers with three prongs each, in the two pods.
- **Face:** a simple line face on the thumb-cluster muzzle.

The word "moose" is also hand-lettered on top of each switch plate, in [art/text.js](art/text.js).
It sits in the band of plate below the thumb cluster, which still shows with the keycaps on,
and runs parallel to the bottom edge. It reads left to right on both halves.

Both are printed on the eufyMake E1, like the keycap legends. `npm run stl` writes the print
files to `art/print/`:
- `print_case_left.svg`, `print_case_right.svg`: the moose, as seen looking at the case's
  underside.
- `print_plate_left.svg`, `print_plate_right.svg`: the word, as seen looking down on the plate.

Each is true size, and the drawing is exactly the part's outline's bounding box (the case
172.2 × 110.1 mm, the plate 167.2 × 105.1 mm). The art is filled shapes in a cream colour,
with no strokes and nothing else in the file.

1. Put the case upside down on the E1's bed, floor up. For the plate, put it top up.
2. In eufyMake Studio, import that part's print file. Line the drawing's edges up with the
   part's outermost edges in the camera view, and size it to the part if it isn't already.
3. Use a white underlay on a dark case or plate, so the cream stays bright.
4. Print, then do the other half with its own file.

`npm run build` also writes previews, the art drawn on its part: `output/art/moose_left.svg`
and `moose_right.svg` (seen from below), and `output/art/text_left.svg` and `text_right.svg`
(seen from above, with the keycaps shaded, so you can see the word stays clear of them).

## Keycaps and legends

The keycaps are our own: low profile, flat, for the KS-33's MX-style cross stem. Their
legends are UV printed on a eufyMake E1. Everything is generated from [config.yaml](config.yaml)
(the `cap_*` and `holder_*` settings) and the keymap plan, [keymap/legends.json](keymap/legends.json).

| File | Part |
| --- | --- |
| `stl/keycap_1u.stl` | 1u cap, 18 × 18 mm (print 44) |
| `stl/keycap_1u_homing.stl` | 1u cap with a homing groove, for F and J (print 2) |
| `stl/keycap_1_5u.stl` | 1.5u cap for the inner thumb key, 27.5 × 18 mm (print 2) |
| `stl/keycap_holder.stl` | holds one half's 24 caps, top up, on the E1's bed |

Each cap is one piece: a flat top `cap_top_t` (1.2 mm) thick with rounded corners, and the stem
post joined under it, 4.5 mm tall in all. The face's edge is chamfered 0.4 mm at 45°
(`cap_face_chamfer`). They print top down, so the face comes out bed-smooth. The post's end is
level with the bottom of the skirt. The post rides on the switch's slider, so the skirt can't
reach the plate at bottom-out.

The homing cap has a rounded groove cut into its face, 5 mm long, `cap_homing_depth` (0.4 mm)
deep and 2.5 mm from the front edge (the `cap_homing_*` settings). Face down, it's a void in
the first layers with a short bridge over it.

**Fit:** the cross socket's clearance is `cap_stem_tol`. It's 0.2 mm, the best fit from an
earlier fit test of 0.05 to 0.2 mm. If the stems grip too tightly or too loosely on another
printer, change it and export again.

### Planning the legends

Run `npm run view` and open http://localhost:4600/keymap (or **Keymap ↗** in the viewer):
- **Keys:** both halves are shown as they're laid out. Click a key and type its legends: the
  base legend sits in the middle, and each layer's legend sits in its own place (Lower in the
  bottom-left corner, Raise in the top-right), smaller and in the layer's colour. A shift
  legend, if a key has one, sits centred along the top, and the base legend stays in the
  middle. The menu beside the base legend can draw it in the shift colour or a layer's colour
  instead, e.g. for the key that switches to that layer (the middle thumb keys are Lower and
  Raise). The **Top** menu fills the key's whole top with the shift colour or a layer's colour,
  printed under its legends. Legends slide clear of each other, and shrink only when there isn't room. Tab, Shift+Tab and Enter move
  between keys.
- **Icons:** the icon panel searches Font Awesome Free's 1,895 icons by name and search terms.
  Click one to put it in the legend you're editing. In a legend, an icon is written as its
  name between colons, `:volume-high:`. Solid style is the default; `:regular/keyboard:` and
  `:brands/apple:` pick the others. Unicode symbols (⌘ ⌥ ⏎ and the like) still work too.
- **Layers and style:** each layer's name, colour and place on the cap (either side, or any
  corner), the cap colour, and legend sizes. The buttons at
  the top show one layer at a time.
- Changes save to `keymap/legends.json` on their own.

The legends are set in Segoe UI Bold, with Segoe UI Symbol for symbols. These are read from
Windows' fonts folder at build time and written into the print files as outlines, so the printer
never substitutes a font. Other TrueType fonts can be set in the plan's `style`. Symbol fonts
draw arrows and icons small and light, so symbols are drawn larger and bolder than the font has
them, centred on the letters' height: `style.symbol.scale` (1.4 times) and
`style.symbol.weight` (fattened by 0.07 mm all round).

Icons come from [Font Awesome Free](https://fontawesome.com) 6.7.2, whose fonts and icon list
are kept in [keymap/fonts/fontawesome/](keymap/fonts/fontawesome/). Its icons are licensed
under CC BY 4.0 and its fonts under the SIL OFL 1.1; see the
[licence](keymap/fonts/fontawesome/LICENSE.txt). (Version 6 is used because version 7 ships
only compressed web fonts.) An icon's size is set by `style.icons.scale`: its em square is
that many cap heights (1.3).

### Printing the legends on the E1

`npm run stl` writes the print files to `keymap/print/`:
- `print_left.svg`, `print_right.svg`: one half's legends each, at true size. The drawing is
  exactly the holder's outline, 127 × 127 mm.
- `preview_left.svg`, `preview_right.svg`: the same on the holder, with each slot's key named.

1. Print the holder and the caps, then put one half's caps in the holder, top up. The 1.5u
   cap goes in the wide slot, and the cut-off corner goes top left.
2. In eufyMake Studio, import that half's print file. Line its edges up with the holder in
   the camera view, and size it to 127 × 127 mm if it isn't already.
3. Use a white underlay if the caps are a dark colour, so the coloured legends stay bright.
4. Print, then swap in the other half's caps and do the same with its print file. The
   preview shows which key each slot's cap belongs to.

## Wiring guide

`npm run build` also draws a wiring guide for each half: `output/wiring/wiring_left.svg` and
`wiring_right.svg`. Each is seen from below, as you wire it. The matching
`output/wiring/report_*.md` files have the MCU pin map, the assembly order and the wire lengths.
Both halves use the same pin map.

## Other commands

- `npm run build`: builds Ergogen and the wiring guides into `output/`.
- `npm run view`: starts the local viewer at http://localhost:4600. It rebuilds on every edit and shows the outlines and the 3D cases.
