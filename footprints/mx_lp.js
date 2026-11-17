// Cherry MX Low Profile switch footprint (through-hole, solder-in) for Ergogen v4.
// Uses KiCad 8 syntax, so the PCB must set `template: kicad8`.
//
// Geometry matches siderakb's SW_MX_LowProfile_THT
// (https://github.com/siderakb/key-switches.pretty), whose hole positions agree
// with Keebio's Cherry-MX-Low-Profile.kicad_mod (linked from ergogen issue #91).
// Cherry's own footprint drawing hasn't been checked.
//
// The centre hole and the 2.3 mm hole overlap on purpose: together they form one
// keyhole-shaped cutout (round for three arms of the stem's cross, plus a hole for
// the longer fourth arm). KiCad's design check reports this as hole-to-hole.
//
// Params:
//   designator: reference prefix (default 'S')
//   side: 'F' or 'B', the side the silkscreen and outline go on (default 'F')
//   reverse: if true, draw the silkscreen and outline on both sides (default false)
//   keycaps: if true, draw an 18 x 17 mm keycap outline on Dwgs.User (default false)
//   from: net for pin 1
//   to: net for pin 2

module.exports = {
  params: {
    designator: 'S',
    side: 'F',
    reverse: false,
    keycaps: false,
    from: undefined,
    to: undefined,
  },
  body: p => {
    const line = (x1, y1, x2, y2, layer, width = 0.12) =>
      `(fp_line (start ${x1} ${y1}) (end ${x2} ${y2}) (stroke (width ${width}) (type solid)) (layer "${layer}"))`

    const rect = (w, h, layer, width) => {
      const x = w / 2
      const y = h / 2
      return [
        line(-x, -y, x, -y, layer, width),
        line(x, -y, x, y, layer, width),
        line(x, y, -x, y, layer, width),
        line(-x, y, -x, -y, layer, width),
      ].join('\n    ')
    }

    // Corner marks around the 13.9 x 13.9 mm switch body
    const corners = layer => {
      const s = 6.95
      const l = 2
      return [
        line(-s, -s, -s + l, -s, layer), line(-s, -s, -s, -s + l, layer),
        line(s, -s, s - l, -s, layer), line(s, -s, s, -s + l, layer),
        line(s, s, s - l, s, layer), line(s, s, s, s - l, layer),
        line(-s, s, -s + l, s, layer), line(-s, s, -s, s - l, layer),
      ].join('\n    ')
    }

    const sides = p.reverse ? ['F', 'B'] : [p.side]
    const art = sides
      .map(s => [corners(`${s}.SilkS`), rect(13.9, 13.9, `${s}.Fab`, 0.1)].join('\n    '))
      .join('\n    ')

    const keycap = p.keycaps ? rect(18, 17, 'Dwgs.User', 0.15) : ''

    return `
  (footprint "mx_lp"
    (layer "${p.side}.Cu")
    ${p.at}
    (property "Reference" "${p.ref}" (at 0 -8 ${p.r}) (layer "${p.side}.SilkS") ${p.ref_hide}
      (effects (font (size 1 1) (thickness 0.15))${p.side === 'B' ? ' (justify mirror)' : ''}))
    (attr through_hole)
    ${art}
    ${keycap}
    ${rect(15, 15, 'Eco2.User', 0.15)}
    (pad "" np_thru_hole circle (at 0 0 ${p.r}) (size 6.25 6.25) (drill 6.25) (layers "*.Cu" "*.Mask"))
    (pad "" np_thru_hole circle (at 0 3.7 ${p.r}) (size 2.3 2.3) (drill 2.3) (layers "*.Cu" "*.Mask"))
    (pad "1" thru_hole circle (at 0 6.05 ${p.r}) (size 2 2) (drill 1.2) (layers "*.Cu" "*.Mask") ${p.from.str})
    (pad "2" thru_hole circle (at 4.13 3.3 ${p.r}) (size 2 2) (drill 1.2) (layers "*.Cu" "*.Mask") ${p.to.str})
  )
  `
  }
}
