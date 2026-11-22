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
| `keyboard_case.stl`, `keyboard_case_right.stl` | cases, with the module seats and standoffs, and a 0.8 mm chamfer round the bottom edge |
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

## Keycaps and legends

The keycaps are our own: low profile, flat topped, for the KS-33's MX-style cross stem. Their
legends are UV printed on a eufyMake E1. Everything is generated from [config.yaml](config.yaml)
(the `cap_*` and `holder_*` settings) and the keymap plan, [keymap/legends.json](keymap/legends.json).

| File | Part |
| --- | --- |
| `stl/keycap_1u.stl` | 1u cap, 18 × 18 mm, 4.7 mm tall (print 46) |
| `stl/keycap_1_5u.stl` | 1.5u cap for the inner thumb key (print 2) |
| `stl/keycap_1u_side.stl`, `stl/keycap_1_5u_side.stl` | the same caps with a dished top and chamfered corners, printed on their side |
| `stl/keycap_1u_side_homing.stl` | the 1u side cap with a homing bar, for F and J (print 2) |
| `stl/keycap_fit_test.stl` | four stem posts, socket clearance 0.05 to 0.2 mm (1 to 4 notches) |
| `stl/keycap_holder.stl` | holds one half's 24 caps, top up, on the E1's bed |

The caps come out top down, so the flat top prints on the bed and comes out smooth.

The `_side` caps are the dished alternative. Their top has a cylindrical dish, `cap_dish`
(0.6 mm) deep in the middle, curving front to back. They come out lying on their left side,
flat on the bed. Each print layer then cuts through the whole curve, so it prints as smooth
perimeters rather than steps, and the stem is printed along its arms, which makes it
stronger. They're 0.6 mm taller at the edges than the flat caps, so the top keeps its full
thickness in the middle. Their corners are chamfered at 45° rather than rounded. They fit the
same holder.

`keycap_1u_side_homing.stl` adds a homing bar for F and J: a rounded bar 5 mm long, standing
0.4 mm proud of the dish, 2.5 mm in from the front edge (the `cap_homing_*` settings). In print
orientation it runs straight up the cap's face, so it needs no support. The skirt ends
level with the bottom of the stem post, which rides on the switch's slider, so the cap can't
reach the plate at bottom-out.

**Fit:** print the fit test first, and push each post onto a switch. Set `cap_stem_tol` to the
clearance that grips without forcing (1 notch = 0.05 mm, 2 = 0.1, 3 = 0.15, 4 = 0.2), then
export again.

### Planning the legends

Run `npm run view` and open http://localhost:4600/keymap (or **Keymap ↗** in the viewer):
- **Keys:** both halves are shown as they're laid out. Click a key and type its legends: the
  base legend sits in the middle, and each layer's legend sits in its own place (Lower in the
  bottom-left corner, Raise in the top-right), smaller and in the layer's colour. A shift
  legend, if a key has one, sits centred along the top, and the base legend moves down to make
  room. Legends slide clear of each other, and shrink only when there isn't room. Tab, Shift+Tab and Enter move
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
