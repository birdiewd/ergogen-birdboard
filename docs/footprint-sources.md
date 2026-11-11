# Footprint sources

The ceoloide library (bundled in the web UI) supplies the switches and diodes.
The MCUs and the RGB LED are not in that library, so they are converted from the
providers' own KiCad footprints into Ergogen footprints under
`footprints/custom/`.

Download the `.kicad_mod` files below, hand them to the conversion step, and keep
the originals' license/attribution in the converted file header.

| Part | Where to get the KiCad footprint | Notes |
|---|---|---|
| WS2812B 5050 | Official KiCad footprint library, `LED_SMD.pretty`, `LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm` | Pin 3 is marked on the package, not pin 1. Check orientation. |
| RP2040-Zero | Community footprint (for example `dj505/RP2040-Zero-KiCAD`) or `crides/kleeb` | Converted from a community footprint. Its pad numbers do not follow Waveshare numbering, so pins are named by position. Check pad 1 = 5V, on the same side as the USB-C end, against your board. |
| 0xCB Helios | ebastler's `marbastlib`, library `marbastlib-xp-promicroish` (folder `footprints`) | The `xp` prefix means experimental: confirm against a built board before ordering. Converted variant: `Helios_AC` (SMD edge pads, USB pointing away from the PCB). Only the castellated Helios is supported; the older through-hole version is not on sale at the shop used, so no header footprint is provided. The footprint has pad numbers only. GPIO names come from the Helios rev1.0 board (`0xCB-dev/0xCB-Helios`, CERN-OHL-S-2.0), matched pad by pad by position. |

## Switches (already covered by the ceoloide library)

| Switch | Footprint | Notes |
|---|---|---|
| MX | `ceoloide/switch_mx` | `hotswap` true |
| Low-profile MX (Gateron KS-27/KS-33) | `ceoloide/switch_gateron_ks27_ks33` | `hotswap` param name not confirmed |
| Choc v1 | `ceoloide/switch_choc_v1_v2` | `choc_v2_support: false` |
| Choc v2 | `ceoloide/switch_choc_v1_v2` | `choc_v2_support: true` |

## Conversion checklist (per footprint)

1. Pad numbers and names match the source exactly.
2. Pad positions, sizes and drill sizes match the source (compare in KiCad).
3. Pin 1 / reference marks are present on silkscreen.
4. Keepout and board-edge clearances survive the conversion.
5. Net parameters (`from`, `to`, or per-pin) are exposed so `config.yaml` can wire them.
6. Open the Ergogen PCB output in KiCad and run DRC before ordering.
