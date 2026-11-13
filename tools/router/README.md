# tools/router

Autorouter for the exported `birdboard.kicad_pcb` (Ergogen does not draw tracks).

```
python3 tools/router/route_board.py birdboard.kicad_pcb birdboard_routed.kicad_pcb preview.png
```

Needs numpy, scipy and Pillow; about two minutes. Both halves are routed separately on F.Cu/B.Cu:
0.25 mm signal tracks, 0.5 mm 5V, 0.2 mm clearance, 0.6/0.3 mm vias, 0.5 mm copper-to-edge. GND is a pour on both
layers (one zone per half) plus stitching vias; the zones are written unfilled, so press B in KiCad before DRC or plotting.

Re-run it after every layout change: the tracks are written into a copy of the exported PCB, not into the Ergogen config.
`pcbparse.py` (in `tools/`) reads the exported file.
