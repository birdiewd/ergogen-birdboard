// Gateron low-profile (KS-27 / KS-33) MX hotswap switch footprint, hotswap pads only.
//
// Copy of ceoloide/switch_gateron_ks27_ks33 (hotswap: true, reversible: false) with the unused
// 1.25 mm solder holes removed. Those holes were the same pin pattern rotated 180 degrees, only
// useful for soldering a switch in the opposite orientation, never with a hotswap socket.
//
// Per switch (all positions relative to the key centre, rotated with the key):
//   centre hole   5.6 mm pad, 5.1 mm drill, no net
//   pin 1 hole    3.5 mm pad, 3.0 mm drill at (-4.4, 4.7), B.Cu socket pad 4 x 2.5 at (-7.35, 4.7)
//   pin 2 hole    3.5 mm pad, 3.0 mm drill at ( 2.6, 5.75), B.Cu socket pad 4 x 2.5 at ( 5.55, 5.75)
//   B.Paste/B.Mask openings for the sockets at x = -8.05 and 6.25
//
// Usage in config.yaml:
//   switch:
//     what: custom/switch_gateron_hotswap
//     params:
//       from: "{{column_net}}"
//       to: "{{name}}"

module.exports = {
  params: {
    designator: 'S',
    side: 'B',
    from: { type: 'net', value: 'from' },
    to: { type: 'net', value: 'to' },
  },
  body: p => `
  (footprint "custom:switch_gateron_hotswap" (layer "${p.side}.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}"
      (at 0 8.8 ${p.r})
      (layer "${p.side}.SilkS")
      hide
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (attr exclude_from_pos_files exclude_from_bom allow_soldermask_bridges)

    (pad "" thru_hole circle (at 0 0 ${p.r}) (size 5.6 5.6) (drill 5.1) (layers "*.Cu" "*.Mask"))

    (pad "1" thru_hole circle (at -4.4 4.7 ${p.r}) (size 3.5 3.5) (drill 3) (layers "*.Cu" "*.Mask") ${p.from.str})
    (pad "2" thru_hole circle (at 2.6 5.75 ${p.r}) (size 3.5 3.5) (drill 3) (layers "*.Cu" "*.Mask") ${p.to.str})

    (pad "1" smd roundrect (at -7.35 4.7 ${p.r}) (size 4 2.5) (layers "B.Cu") (roundrect_rratio 0.1) ${p.from.str})
    (pad "" smd roundrect (at -8.05 4.7 ${p.r}) (size 2.6 2.5) (layers "B.Paste" "B.Mask") (roundrect_rratio 0.1))

    (pad "2" smd roundrect (at 5.55 5.75 ${p.r}) (size 4 2.5) (layers "B.Cu") (roundrect_rratio 0.1) ${p.to.str})
    (pad "" smd roundrect (at 6.25 5.75 ${p.r}) (size 2.6 2.5) (layers "B.Paste" "B.Mask") (roundrect_rratio 0.1))
  )
`,
};
