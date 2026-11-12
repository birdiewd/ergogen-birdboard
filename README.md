# Ergogen keyboards

Personal templates for custom keyboards, built for the
[ceoloide Ergogen web UI](https://ergogen.ceoloide.com) (Ergogen v4.3.0 fork).

Current design: **Corne-style** split, 6 columns x 3 rows (an extra outer column beside
the pinky) plus 3 thumb keys. The left half is defined; flip the same PCB for the right.

## Use it

1. Push this repo to GitHub.
2. In the web UI choose **From Repo** and enter the repo URL.
3. The UI reads `config.yaml` and everything under `footprints/`.

No local tooling or submodule is needed, because the UI bundles the ceoloide footprints.

## What you get from `config.yaml`

| Output | Names |
|---|---|
| PCBs (4) | `corne_{mx,lpmx,choc,choc2}_zero`: switch type (RP2040-Zero, hotswap only) |
| Top plates (STL) | `plate_mx`, `plate_lpmx`, `plate_choc`, `plate_choc2` |
| MCU / USB-C cover (STL) | `cover` |
| Case tray (STL) | `tray` |

Tunable values (spacing, cutouts, plate thickness, wall height) are in the
`units:` block at the top of `config.yaml`.

Outlines: the PCB and tray use `board` (merged shape rounded once with `board_fillet`, 1 mm). The plates use
`board_plate`, the same shape with sharp corners and without the MCU area: the switch plate stops
at the keys, and a separate `cover` (`_cover_area`) spans the MCU and the USB-C module. `board_plate` includes `_thumb_fill`, slightly larger
rectangles under the thumb keys (`thumb_fill` in `units:`) that close small enclosed gaps
between the thumb cluster and the bottom row. `_thumb_gap` fills the gap between the lower row of keys
and the thumb cluster, and `_tall_fill` makes the far thumb key (t_far) a 1.5u portrait key in the
board and plate outline (the switch cutout stays square; the keycap outline on the PCB is still 1u).

Switch types: MX, low-profile MX (Gateron KS-27/KS-33), Choc v1, Choc v2.

## Electronics

- **Diodes:** through-hole 1N4148 (DO-35 axial) via `include_tht: true` on the ceoloide
  `diode_tht_sod123` footprint. That footprint also keeps the SOD-123 SMD pads, so an SMD
  diode would fit too. Wired switch (`colrow`) to row net.
- **Lower-left keys:** three extra keys under the outer, pinky and ring columns, directly below the
  bottom row (far side from the thumb cluster). They use their column's net and the `thumb` row net,
  so no extra MCU pins are needed.
- **LEDs:** WS2812B 5050 on the top side of both halves. Every key has two LED footprints on
  the same nets, `led` on the front layer and `led_back` on the back layer. Left half:
  populate the front set. Right half (the same PCB flipped): populate the back set, which
  is then on top. 24 keys, chained `led_data` -> `led_1` ... `led_24`.
  Chain order: inner column top to bottom, thumbs far to near, index bottom to top,
  middle top to bottom, lower ring key, ring bottom to top, pinky top to bottom, lower pinky key,
  lower outer key, outer bottom to top.
  Each key's `led_in` /
  `led_out` is set per key in `points:`, so reorder the chain there. LEDs are powered from
  the RP2040-Zero's 5V pin. The data line is 3.3V, which is out of spec for a
  5V WS2812B but usually works.
- **MCU area:** a 30.5 x 39.7 mm zone to the right of the inner column, top-aligned with the top key,
  is reserved for the RP2040-Zero (20.5 mm wide, with 5 mm of padding either side, `mcu_pad_x`) and a strip
  under it for the USB-C link module. The Zero sits at the top edge with its USB-C connector hanging
  `usb_overhang` (1 mm) over the board edge; the tray's top wall has a notch for it.
  The top corners of the zone are `ear_h` (2.4 mm) taller than the main top edge, either side of the USB notch,
  to hold the cover's standoff holes clear of the pads.

- **Half-to-half link:** a 4-pin USB-C female breakout module (12 x 13.8 mm, pads V / D- / D+ / G
  at 2.54 mm) in the strip under the MCU, opening toward the middle (its shell tip is flush with the right edge of the board). Solder a straight 1x4 male header into
  the breakout from its underside, then plug it into the four PCB holes so it lies flat. Wiring: V to
  the MCU 5V rail (5V), D+ to GP12 (`link`, single-wire serial, QMK half-duplex), G to GND, D-
  unconnected. Use a plain C-to-C cable. **Do not plug the link port into a PC or charger**: the
  5V rail is shared between the halves. The footprint is `custom/usbc_breakout_4pin`; the front set
  is for the left half, the back set (`link_back`, 2.54 mm further out, reversed pad order) for the
  right half (the flipped PCB). Populate only one. The tray wall has a notch for the plug
  (`link_notch_w`, `link_notch_z`); pad order and size come from the seller's image, check your part.

Pin assignments (rows and columns can be swapped freely in `config.yaml`):

| Net | RP2040-Zero |
|---|---|
| outer / pinky / ring / middle / index / inner | GP0 to GP5 |
| top / home / bottom / thumb | GP6 / GP7 / GP8 / GP9 |
| LED data | GP10 |
| half-to-half link (USB-C D+) | GP12 |

`tools/gen_pcbs.py` regenerates the PCB list from those tables if you change them
(optional; the UI only reads `config.yaml`).

## Mounting (M2 standoffs)

Nine M2 holes sit at the same positions in the plates, the cover, the tray floor and the PCB:
one in each of the outer|pinky, ring|middle and index|inner gaps between the keys (between the top
and home rows), one between the thumb keys (t_mid), one under the bottom row at each of outer|pinky and
ring|middle, and three for the MCU / USB-C cover (two in small raised "ears", equally far either side of the MCU centre, at the top corners of the MCU zone, above the Zero's pad rows, one left of
the USB-C module). The key holes are placed in the 5 mm corridors between switch cutouts, clear of the
sockets, diodes and LEDs. The positions are in `_mount_holes` (outlines) and the `hole_N`
footprints (generated by `tools/gen_pcbs.py`); both must stay in sync.

Stack, bottom to top: tray floor, standoffs, PCB, standoffs, plate. Hole sizes are
`hole_print` (2.4 mm, plate and tray floor) and `hole_pcb` (2.2 mm, PCB drill) in `units:`.
Standoff heights depend on your switch: the plate-to-PCB gap must match the switch's
plate-to-PCB distance, and `tray_h` must be tall enough for the lot.

Not done: counterbore for the screw heads in the tray floor (2 mm floor is thin).

## Status

| Item | Status |
|---|---|
| Layout, outlines, plates, tray | written, **not yet loaded in the UI** |
| Switch and diode footprints | use ceoloide footprints |
| WS2812B 5050 | converted (`footprints/custom/led_ws2812b_5050.js`); wired, one front and one back LED per key |
| USB-C link | `footprints/custom/usbc_breakout_4pin.js`, hand-written from the listing image; not yet loaded in the UI |
| RP2040-Zero | converted (`custom/mcu_rp2040_zero`); pinout checked against a published diagram; wired; SMD castellation pads only, front `mcu` + mirrored back `mcu_back` (populate one per half) (no through holes, `mount: smd`; `th`/`both` still available) |
| Fabrication guide | `docs/fabrication.md` |

Things to check in the UI after the first load:
- stagger and thumb splay look right (they are approximations of the Corne)
- plate cutout sizes for low-profile MX and Choc v2 against your switch datasheets
- `hotswap` on the Gateron low-profile footprint is accepted
- the tray wall height fits your switch, plate and PCB stack
- LED and diode placement (`led_*_y`, `diode_*_y` in `units:`): MX and low-profile MX put the
  LED north of the switch; Choc puts it south and moves the diode to the lower edge. Not
  verified visually
- the MCU sits inside the board outline for all three MCUs (`mcu_*_y` in `units:`)
- the two LED sets (front and back) sit exactly on top of each other; check they do not
  clash with the hotswap sockets (sockets are on the opposite layer from the switch)
- the 9 mounting holes clear the switches, sockets and diodes on the PCB, and the thumb hole
  (my reconstruction of the thumb layout is approximate)
- the tray notches for the two USB-C ports (`usb_notch_*` at the top for the Zero, `link_notch_*` on the right for the link port): width and height above the floor

## Layout

```
config.yaml                 board definition
footprints/custom/          custom footprints (MCUs, LED)
tools/gen_pcbs.py           optional: regenerates the PCB list in config.yaml
docs/fabrication.md         KiCad export and JLCPCB / PCBWay ordering
docs/footprint-sources.md   where each footprint comes from
```
