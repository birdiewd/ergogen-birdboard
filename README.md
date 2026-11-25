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
| `keyboard_case.stl`, `keyboard_case_right.stl` | cases, with the module seats and standoffs, and a 0.8 mm chamfer round the bottom edge. A lip runs round the inside of the wall for the plate's edge to rest on: its top is level with the plate's underside, `lip_w` (1.2 mm) wide, with a 45° underside so it prints without supports, and it stops either side of each USB opening, with no lip across it. Each standoff is 5 mm across under the plate and flares out at 10° a side to 6.9 mm on the floor (`standoff_*`), trimmed where it would reach into a module's pocket. Its M2 heat-set insert hole is 3.2 mm across at the top and narrows at 10° a side to 2.2 mm, then runs straight down to the floor (`insert_*` in config.yaml) |
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
169.8 × 105.9 mm, the plate 165.7 × 101.8 mm). The art is filled shapes in a cream colour,
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
post joined under it, 4.5 mm tall in all. The face's edge is chamfered 0.8 mm at 45°
(`cap_face_chamfer`). They print top down, so the face comes out bed-smooth. The post's end is
level with the bottom of the skirt. The post rides on the switch's slider, so the skirt can't
reach the plate at bottom-out.

The homing cap has a rounded groove cut into its face, 5 mm long, `cap_homing_depth` (0.4 mm)
deep and 2.5 mm from the front edge (the `cap_homing_*` settings). Face down, it's a void in
the first layers with a short bridge over it.

### Chicago-style caps, printed on their side

There's also a set in a Chicago Steno style: the same footprint and stem, with two side
profiles traced from a picture and running the full width of the cap.

| File | Part |
| --- | --- |
| `stl/keycap_cs_top_1u.stl` | top row: 8.55 mm at its peak, 7.6 mm near the back, 4.3 mm near the front. Turned round, tall side to the front, it's the bottom row's cap too (print 24) |
| `stl/keycap_cs_home_1u.stl` | home row: 4.74 mm in the middle, 3.5 mm near the front and back, the same both ways. Also the 1u thumb keys (print 20) |
| `stl/keycap_cs_home_1u_homing.stl` | home row with a homing bump, for F and J: a rounded bar 5 mm long standing `cap_cs_homing_bump` (0.4 mm) proud of the face, 2.5 mm from the front edge (print 2) |
| `stl/keycap_cs_thumb_1_5u.stl` | 1.5u inner thumb key, in the home row's profile (print 2) |

**The profiles:** the side views are in [art/cs_profiles.png](art/cs_profiles.png), with
[art/cs_profiles_zoom.png](art/cs_profiles_zoom.png), a sharper screenshot of their tops.
`node art/trace-profile.js` traces them into `art/cs_profiles.json` and draws
[art/cs_profiles.svg](art/cs_profiles.svg) to check them by:
- **Scale:** each shape's width at its base is the cap's 18 mm depth, and its base is the
  bottom of the skirt.
- **Smoothing:** the two pictures' traces are averaged and smoothed. The result stays
  within 0.1 mm of the traces, and its control points are crowded into the corners.
- **Home row:** its profile is averaged with its own mirror image, so it's the same front
  and back.

**The cap:** the left and right faces have the same draft as the flat caps, and the top's
left and right edges are chamfered `cap_cs_edge` (0.6 mm). Inside, a hollow keeps
`cap_top_t` (1.2 mm) under the curved top and is no higher than the 3.3 mm skirt, so it's
lower near a rounded edge. The top over the stem is 1.24 mm thick on the home cap.

**Printing:** the caps print lying on their left face, and the STLs are already turned that
way. So every layer is the profile, and the curve comes out smooth whatever its shape.
Lying like that, the hollow's right side would be a ceiling, so it slopes at 45° instead.
The stem post runs sideways, 3.6 mm out from the top with nothing under it. Its round
underside is an overhang, so if it sags on your printer, add a support under the post in the
slicer.

They fit the legend holder like the flat caps. Put each bottom-row cap in the holder turned
round, tall side to the front, as it sits on the keyboard, so its legend prints the right way
up.

**Fit:** the cross socket's clearance is `cap_stem_tol`. It's 0.2 mm, the best fit from an
earlier fit test of 0.05 to 0.2 mm. If the stems grip too tightly or too loosely on another
printer, change it and export again.

### Planning the legends

Run `npm run view` and open http://localhost:4600/keymap (or **Keymap ↗** in the viewer):
- **Keys:** both halves are shown as they're laid out. Click a key and type its legends. Each
  legend goes in its own corner, reading clockwise from the top left:
  - **Base:** top left.
  - **Shift:** top right, in the shift colour.
  - **Raise:** bottom right, in its colour.
  - **Lower:** bottom left, in its colour.

  A key with only a base legend (space, enter, the media keys) has it in the middle instead.
  Two legends in the same row shrink together if they'd run into each other.
- **Colours:** the menu beside the base legend can draw it in the shift colour or a layer's
  colour instead, e.g. for the key that switches to that layer (the middle thumb keys are Lower
  and Raise). The **Top** menu fills the key's whole top with the shift colour or a layer's
  colour, printed under its legends.
- **Moving between keys:** Tab, Shift+Tab and Enter.
- **Faces:** the **Flat caps / Chicago caps** switch at the top picks which caps the keys are
  drawn as. With Chicago caps, each key shows the face of the cap it takes, seen from above
  (the bottom row's turned round). The face is outlined, and darker wherever it's steeper than
  `cap_cs_print_slope` (30°), because a UV-printed legend lands stretched there. Keep legends
  on the lighter part. The legends are still laid out on the flat caps' top, so this is a
  check, not a change to where they print.
- **Icons:** the icon panel searches Font Awesome Free's 1,895 icons by name and search terms.
  Click one to put it in the legend you're editing. In a legend, an icon is written as its
  name between colons, `:volume-high:`. Solid style is the default; `:regular/keyboard:` and
  `:brands/apple:` pick the others. Unicode symbols (⌘ ⌥ ⏎ and the like) still work too.
- **Layers and style:** each layer's name, colour and place on the cap (either side, or any
  corner), the cap colour, legend sizes, and the legends' padding from the edges of the cap's
  top: **Padding** sets the left-and-right (`style.side.padX`) and the top-and-bottom
  (`style.side.padY`) separately. The base and shift legends have a place menu too:
  either side, any corner, or their old spots (the middle for base, centred along the top for
  shift). The buttons at the top show one layer at a time.
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
- `npm run view`: starts the local viewer at http://localhost:4600. It rebuilds on every edit and shows the outlines and the 3D cases. In the 3D tab, **Assembled** puts the plates on their standoffs, the right half beside the left, and a Chicago-style keycap on every key (the bottom row's turned round). The flat caps aren't shown there. The caps sit `cap_seat` (3 mm, an estimate) above the plate.
