// Combo diode footprint (SOD-123 SMD pads on both sides + through-hole), KiCad 8 syntax.
// Same geometry and pins as Ergogen's built-in `diode`, rewritten so KiCanvas and
// other KiCad 8 tools can read it. The PCB must set `template: kicad8`.
//
// Params:
//   designator: reference prefix (default 'D')
//   from: net for the anode (pin 2)
//   to: net for the cathode (pin 1, square pad, the end with the bar)
//   include_pad_links: if true, joins each SMD pad to its plated hole with a short
//     trace on both layers, so an SMD diode fitted on either side reaches traces
//     that end at the holes (default false)
//   pad_link_width: width of those traces (default 0.25)

module.exports = {
  params: {
    designator: 'D',
    from: undefined,
    to: undefined,
    include_pad_links: false,
    pad_link_width: 0.25,
  },
  body: p => {
    const line = (x1, y1, x2, y2, layer) =>
      `(fp_line (start ${x1} ${y1}) (end ${x2} ${y2}) (stroke (width 0.1) (type solid)) (layer "${layer}"))`

    // Diode symbol: triangle pointing at the cathode bar on the left.
    const symbol = layer => [
      line(0.25, 0, 0.75, 0, layer),
      line(0.25, 0.4, -0.35, 0, layer),
      line(0.25, -0.4, 0.25, 0.4, layer),
      line(-0.35, 0, 0.25, -0.4, layer),
      line(-0.35, 0, -0.35, 0.55, layer),
      line(-0.35, 0, -0.35, -0.55, layer),
      line(-0.75, 0, -0.35, 0, layer),
    ].join('\n    ')

    const smd = (num, x, side, net) =>
      `(pad "${num}" smd rect (at ${x} 0 ${p.r}) (size 0.9 1.2) (layers "${side}.Cu" "${side}.Paste" "${side}.Mask") ${net})`

    const link = (x1, x2, side, net) =>
      `(segment (start ${p.eaxy(x1, 0)}) (end ${p.eaxy(x2, 0)}) (width ${p.pad_link_width}) (layer "${side}.Cu") (net ${net.index}))`
    const links = !p.include_pad_links ? '' : ['F', 'B'].map(side => `
  ${link(-1.65, -3.81, side, p.to)}
  ${link(1.65, 3.81, side, p.from)}`).join('') + '\n'

    return links + `
  (footprint "diode_k8"
    (layer "F.Cu")
    ${p.at}
    (property "Reference" "${p.ref}" (at 0 0 ${p.r}) (layer "F.SilkS") ${p.ref_hide}
      (effects (font (size 1.27 1.27) (thickness 0.15))))
    (attr through_hole)
    ${symbol('F.SilkS')}
    ${symbol('B.SilkS')}
    ${smd(1, -1.65, 'F', p.to.str)}
    ${smd(2, 1.65, 'F', p.from.str)}
    ${smd(1, -1.65, 'B', p.to.str)}
    ${smd(2, 1.65, 'B', p.from.str)}
    (pad "1" thru_hole rect (at -3.81 0 ${p.r}) (size 1.778 1.778) (drill 0.9906) (layers "*.Cu" "*.Mask") ${p.to.str})
    (pad "2" thru_hole circle (at 3.81 0 ${p.r}) (size 1.905 1.905) (drill 0.9906) (layers "*.Cu" "*.Mask") ${p.from.str})
  )
  `
  }
}
