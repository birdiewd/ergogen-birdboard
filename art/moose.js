// Moose head for the underside of the case, in one colour. Seen from below, the case reads as
// a cartoon moose head in three-quarter view: its outline is the head (a line just inside the
// case edge, around the key area), the thumb cluster the muzzle, and the two pods sticking
// out at the top corners are small blocky antlers with three prongs each.
//
// Coordinates are the LEFT half's, as seen from the top (Ergogen's frame, y up, mm). Shapes
// placed by hand are given as if matrix_outer_top sat at (100, -62); `at` moves them to
// wherever it really is. `head` is the head outline (closed, from the build). Seen from
// below everything is mirrored, which is how the art is meant to be read; the build mirrors
// the whole drawing for the right half.
//
// Shapes:
//   { fill: [points], round }    closed polygon, filled; every corner rounded to radius round
//   { ellipse: [cx, cy, rx, ry, rotDeg] }   filled ellipse
//   { ring: [cx, cy, rx, ry, rotDeg], w }    ellipse outline, line width w
//   { stroke: [points], w }      open line, smoothed, round ends
//   { loop: [points], w }        closed line through the points as given (not smoothed)

const W = 1.6   // line width: 4 extrusion widths at 0.4 mm
const R = 0.8   // corner radius of the antlers (inner and outer corners)

module.exports = ({ at, head }) => {
  const P = pts => pts.map(([x, y]) => at(x, y))
  const E = (cx, cy, rx, ry, r = 0) => [...at(cx, cy), rx, ry, r]
  // the point of the head line nearest p, or (corner) its sharpest bend within 4 mm of p, so
  // a line drawn from there joins the head line as one
  const near = p => head.reduce((b, q) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(b[0] - p[0], b[1] - p[1]) ? q : b))
  const corner = p => {
    let best = null, bend = -1
    head.forEach((q, i) => {
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 4) return
      const a = head[(i - 3 + head.length) % head.length], c = head[(i + 3) % head.length]
      const u = [a[0] - q[0], a[1] - q[1]], v = [c[0] - q[0], c[1] - q[1]]
      const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))
      if (1 + cos > bend) { bend = 1 + cos; best = q }   // the smaller the angle, the sharper
    })
    return best || near(p)
  }
  return [
    // the head: follows the case outline around the key area
    { loop: head, w: W },

    // antlers: a beam out of the head's top corner with three square prongs pointing up
    // outer side (the MCU's pod); the prongs rise towards the tip
    { fill: P([[87.5, -70], [68.5, -70], [68.5, -53], [72, -53], [72, -65], [75, -65], [75, -56], [78.5, -56],
      [78.5, -65], [81.5, -65], [81.5, -59], [85, -59], [85, -65], [87.5, -65]]), round: R },
    // inner side (the breakout's pod)
    { fill: P([[206.5, -61], [221.5, -61], [221.5, -48], [218.5, -48], [218.5, -56], [216.5, -56], [216.5, -50], [213.5, -50],
      [213.5, -56], [211.5, -56], [211.5, -52], [208.5, -52], [208.5, -56], [206.5, -56]]), round: R },
    // muzzle: the whole thumb cluster. The line leaves the head line right at the corner below
    // the inner column (so the inner edge runs on into it), runs above the three thumb keys
    // and down onto the bottom edge between them and the thumb row's mod keys.
    { stroke: [corner(at(207, -100)), ...P([[196, -103.5], [183, -105], [170, -105.5], [160, -109], [154.5, -118], [153.5, -127]]), near(at(154, -134.2))], w: W },
    // eyes: an outline with a pupil looking towards the muzzle
    { ring: E(174, -89.5, 5.4, 6.2), w: 1.2 },
    { ellipse: E(175.8, -90.5, 2.7, 3.2) },
    { ring: E(199.5, -85, 3.8, 4.5), w: 1.0 },
    { ellipse: E(200.7, -85.8, 1.9, 2.3) },
    // brows
    { stroke: P([[166, -79.5], [173, -77.7], [181, -79.5]]), w: W },
    { stroke: P([[194, -77.8], [199, -76.7], [203, -78.8]]), w: 1.3 },    // nostrils, clear of the insert hole by the thumb key
    { ellipse: E(210.5, -131, 2.8, 1.9, -45) },
    { ellipse: E(219, -124.5, 2.1, 1.5, -55) },
    // mouth: a smile along the bottom of the muzzle
    { stroke: P([[176, -128], [183, -133], [192, -135.5]]), w: 1.4 },
  ]
}
