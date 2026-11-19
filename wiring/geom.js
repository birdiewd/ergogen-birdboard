// Small 2D geometry helpers for the wire router and its checks. Points are [x, y].

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const len = a => Math.hypot(a[0], a[1])
const dist = (a, b) => len(sub(a, b))

// rotate a point by `deg` degrees counter-clockwise around the origin
const rot = ([x, y], deg) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  return [x * c - y * s, x * s + y * c]
}

// distance from point p to segment ab
const pointSeg = (p, a, b) => {
  const ab = sub(b, a), l2 = dot(ab, ab)
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0
  return dist(p, add(a, mul(ab, t)))
}

// proper intersection point of segments ab and cd (null if they do not cross)
const segInter = (a, b, c, d) => {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s)
  if (Math.abs(den) < 1e-12) return null
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den
  const e = 1e-9
  if (t < e || t > 1 - e || u < e || u > 1 - e) return null
  return add(a, mul(r, t))
}

// shortest distance between segments ab and cd (0 if they cross)
const segSeg = (a, b, c, d) => {
  if (segInter(a, b, c, d)) return 0
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b))
}

// distance from point p to a closed polygon's boundary, and whether p is inside
const pointPoly = (p, poly) => {
  let d = Infinity, inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i]
    d = Math.min(d, pointSeg(p, a, b))
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return { d, inside }
}

// shortest distance from segment ab to a closed polygon (0 if it enters it)
const segPoly = (a, b, poly) => {
  if (pointPoly(a, poly).inside || pointPoly(b, poly).inside) return 0
  let d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segSeg(a, b, poly[j], poly[i]))
  return d
}

// corners of a w x h rectangle centred at local (cx, cy), placed by `place` (local -> board)
const rectPoly = (cx, cy, w, h, place) =>
  [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => place([cx + x, cy + y]))

const polyLength = pts => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0)

module.exports = { sub, add, mul, dot, cross, len, dist, rot, pointSeg, segInter, segSeg, pointPoly, segPoly, rectPoly, polyLength }
