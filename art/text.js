// "moose", hand-lettered on the top of the switch plate, in the band of plate below the thumb
// cluster where it shows with the keys in place. Bouncy single-line lowercase: every letter
// tips a little one way or the other and sits a little high or low.
//
// Glyphs are drawn with their baseline on y = 0 and an x-height of 6 (mm), stroke centre lines
// only; the stroke width is added round them. The word is centred on (0, 3) and then turned
// by `angle` (degrees) and moved to `centre`. Seen from the top, so it reads the same way on
// both halves: the right half gets the mirrored centre and angle, not mirrored letters.

const G = require('../wiring/geom')

const W = 1.2   // stroke width: 3 extrusion widths at 0.4 mm

// each: { x: left offset, shapes } in glyph coordinates
const GLYPHS = {
  m: [
    { stroke: [[0, 0], [0, 6]] },
    { stroke: [[0, 4.3], [0.6, 5.5], [1.6, 6], [2.7, 5.6], [3.2, 4.4], [3.2, 0]] },
    { stroke: [[3.2, 4.3], [3.8, 5.5], [4.8, 6], [5.9, 5.6], [6.4, 4.4], [6.4, 0]] },
  ],
  o: [{ ring: [2.4, 3, 2.4, 2.9] }],
  s: [{ stroke: [[3.1, 5.0], [2.2, 5.9], [1.0, 5.8], [0.3, 4.8], [0.8, 3.6], [2.2, 2.7], [3.0, 1.4], [2.5, 0.3], [1.2, 0.05], [0.1, 0.8]] }],
  e: [{ stroke: [[0.3, 3.1], [4.6, 3.1], [4.4, 4.6], [3.3, 5.8], [1.8, 5.9], [0.6, 5.0], [0.05, 3.2], [0.4, 1.3], [1.7, 0.1], [3.3, 0.05], [4.4, 0.9]] }],
}
const WIDTH = { m: 6.4, o: 4.8, s: 3.1, e: 4.6 }
const GAP = 2.2   // between letters, centre line to centre line past the stroke

// bounce: [tilt in degrees, lift in mm] per letter
const BOUNCE = [[6, 0.3], [-5, -0.3], [4, 0.4], [-6, -0.2], [5, 0.3]]

module.exports = ({ word = 'moose', centre, angle, w = W }) => {
  const total = [...word].reduce((s, c) => s + WIDTH[c], 0) + GAP * (word.length - 1)
  const out = []
  let x = -total / 2
  ;[...word].forEach((c, i) => {
    const [tilt, lift] = BOUNCE[i % BOUNCE.length]
    const mid = [WIDTH[c] / 2, 3]
    // glyph point -> word point (tilted about the letter's middle) -> board point
    const place = p => {
      const q = G.add(G.rot(G.sub(p, mid), tilt), [x + mid[0], mid[1] + lift - 3])
      return G.add(centre, G.rot(q, angle))
    }
    for (const s of GLYPHS[c]) {
      if (s.stroke) out.push({ stroke: s.stroke.map(place), w })
      else if (s.ring) {
        const [cx, cy, rx, ry] = s.ring
        out.push({ ring: [...place([cx, cy]), rx, ry, tilt + angle], w })
      }
    }
    x += WIDTH[c] + GAP
  })
  return out
}
