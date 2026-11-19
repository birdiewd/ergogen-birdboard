// Through-hole diode (1N4148, DO-35) lying on the FRONT of the printed wiring board, KiCad 8
// syntax. The footprint origin is the key centre, so the pads sit at fixed offsets from the
// switch: the legs drop through the board next to the hot-swap socket (anode, bent onto the
// socket's solder tab) and onto the row wire (cathode). Used as a map of the build: there is
// no copper board in v4.
//
// Params (offsets in this footprint's KiCad coordinates, y points down):
//   from: net of the anode (the switch side)
//   to: net of the cathode (the row)
//   anode: [x, y] anode leg hole (default [7.2, 5.75], beside the socket's right tab)
//   cathode: [x, y] cathode leg hole (default [7.2, -4.41], 10.16 mm pitch)
//   drill: leg hole diameter (default 1.0)
//   body: [length, diameter] of the glass body (default [4, 2])

module.exports = {
  params: {
    designator: 'D',
    from: undefined,
    to: undefined,
    anode: [7.2, 5.75],
    cathode: [7.2, -4.41],
    drill: 1.0,
    body: [4, 2],
  },
  body: p => {
    const [ax, ay] = p.anode
    const [kx, ky] = p.cathode
    const cx = (ax + kx) / 2, cy = (ay + ky) / 2
    const [len, dia] = p.body
    // body along the leg axis (vertical here), cathode band at the cathode end
    const dirY = Math.sign(ky - ay) || -1
    const y0 = cy - len / 2, y1 = cy + len / 2
    const x0 = cx - dia / 2, x1 = cx + dia / 2
    const bandY = cy + dirY * (len / 2 - 0.5)
    const line = (xa, ya, xb, yb, layer, w = 0.12) =>
      `(fp_line (start ${xa} ${ya}) (end ${xb} ${yb}) (stroke (width ${w}) (type solid)) (layer "${layer}"))`
    const outline = layer => [
      `(fp_rect (start ${x0} ${y0}) (end ${x1} ${y1}) (stroke (width 0.12) (type solid)) (fill none) (layer "${layer}"))`,
      line(x0, bandY, x1, bandY, layer, 0.3),
      line(ax, ay, cx, dirY > 0 ? y0 : y1, layer),
      line(kx, ky, cx, dirY > 0 ? y1 : y0, layer),
    ].join('\n    ')
    return `
  (footprint "diode_do35"
    (layer "F.Cu")
    ${p.at}
    (property "Reference" "${p.ref}" (at ${cx + 1.8} ${cy} ${p.r + 90}) (layer "F.SilkS") ${p.ref_hide}
      (effects (font (size 0.8 0.8) (thickness 0.12))))
    (attr through_hole)
    ${outline('F.SilkS')}
    ${outline('F.Fab')}
    (pad "1" thru_hole rect (at ${kx} ${ky} ${p.r}) (size 1.4 1.4) (drill ${p.drill}) (layers "*.Cu" "*.Mask") ${p.to.str})
    (pad "2" thru_hole circle (at ${ax} ${ay} ${p.r}) (size 1.4 1.4) (drill ${p.drill}) (layers "*.Cu" "*.Mask") ${p.from.str})
  )
  `
  },
}
