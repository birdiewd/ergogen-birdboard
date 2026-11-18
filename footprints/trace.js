// Free-form copper: a polyline of track segments plus optional vias, all on one net.
// Points are in the placement point's own KiCad coordinates (y points down), so a
// route moves with the key it is anchored to. Emits board items only, no footprint.
//
// Params:
//   net: net of the tracks and vias
//   points: [[x, y], ...] polyline vertices (default none)
//   layer: 'F' or 'B' (default 'F')
//   width: track width (default 0.25)
//   vias: [[x, y], ...] through vias, F.Cu to B.Cu (default none)
//   via_size: via pad diameter (default 0.6)
//   via_drill: via drill (default 0.3)

module.exports = {
  params: {
    designator: 'T',
    net: undefined,
    points: [],
    layer: 'F',
    width: 0.25,
    vias: [],
    via_size: 0.6,
    via_drill: 0.3,
  },
  body: p => {
    const out = []
    for (let i = 0; i < p.points.length - 1; i++) {
      out.push(`(segment (start ${p.eaxy(...p.points[i])}) (end ${p.eaxy(...p.points[i + 1])}) (width ${p.width}) (layer "${p.layer}.Cu") (net ${p.net.index}))`)
    }
    for (const v of p.vias) {
      out.push(`(via (at ${p.eaxy(...v)}) (size ${p.via_size}) (drill ${p.via_drill}) (layers "F.Cu" "B.Cu") (net ${p.net.index}))`)
    }
    return '\n  ' + out.join('\n  ') + '\n'
  },
}
