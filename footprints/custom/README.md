# Custom footprints

Ergogen's "From Repo" import loads every `*.js` file under `footprints/`
(recursively) that sits next to `config.yaml`. A file at
`footprints/custom/mcu_rp2040_zero.js` is referenced from `config.yaml` as
`custom/mcu_rp2040_zero`.

Planned files (converted from the providers' KiCad footprints, see
`docs/footprint-sources.md`):

| File | Part | Status |
|---|---|---|
| `mcu_rp2040_zero.js` | Waveshare RP2040-Zero | converted from the supplied `RP2040 Zero.kicad_mod`; pin names assigned by position (USB up: left 5V GND 3V3 GP29..GP26 GP15 GP14, bottom GP13..GP9, right GP0..GP8), `5V` param is `V5`. Source Edge.Cuts notch not carried over |
| `led_ws2812b_5050.js` | WS2812B 5050 (PLCC4, 5.0x5.0mm) | converted; pad data matches the KiCad source, not yet loaded in the UI |
| `usbc_breakout_4pin.js` | generic 4-pin USB-C female breakout module (V, D-, D+, G, 2.54 mm) | hand-written from the product image, F/B variants, not yet loaded in the UI |
| `vscore_line.js` | V-score marker (drawing-layer line + note along the seam, no copper) | hand-written, not yet loaded in the UI |

Git does not track empty folders, so this README keeps `footprints/custom/` in
the repo.
