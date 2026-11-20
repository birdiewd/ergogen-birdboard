// Turns the underside art (art/moose.js) into a two-colour inlay for the case:
//   - the case gets the art cut into its bottom face, `depth` deep
//   - the art becomes its own body (keyboard_case_art) filling that cut exactly, so a
//     multi-colour printer prints it flush in the first layers
// Import the case and its art body together as one multi-part object (they share
// coordinates) and give each part its filament.

const G = require('../wiring/geom')

const r4 = v => Math.round(v * 1e4) / 1e4
const ccw = pts => {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1])
  return a > 0 ? pts : pts.slice().reverse()
}

// Catmull-Rom through the points (open), `n` samples per span
const spline = (pts, n = 6) => {
  const out = [], m = pts.length
  const get = i => pts[Math.max(0, Math.min(m - 1, i))]
  for (let i = 0; i < m - 1; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)]
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)))
    }
  }
  out.push(pts[m - 1])
  return out
}
const ellipse = ([cx, cy, rx, ry, rot = 0], n = 48) => Array.from({ length: n }, (_, i) => {
  const a = 2 * Math.PI * i / n
  return G.add([cx, cy], G.rot([rx * Math.cos(a), ry * Math.sin(a)], rot))
})

// Rounds every corner of a closed polygon, convex and concave, with radius r (less where an
// edge is too short for it): each corner becomes an arc tangent to both its edges.
const fillet = (pts, r, n = 6) => {
  const out = []
  const m = pts.length
  for (let i = 0; i < m; i++) {
    const A = pts[(i - 1 + m) % m], B = pts[i], C = pts[(i + 1) % m]
    const ab = G.dist(A, B), bc = G.dist(B, C)
    if (ab < 1e-6 || bc < 1e-6) continue
    const u = G.mul(G.sub(A, B), 1 / ab), v = G.mul(G.sub(C, B), 1 / bc)
    const theta = Math.acos(Math.max(-1, Math.min(1, G.dot(u, v))))
    if (theta > Math.PI - 1e-3) { out.push(B); continue }   // straight through
    const t = Math.min(r / Math.tan(theta / 2), ab / 2, bc / 2)
    const rr = t * Math.tan(theta / 2)
    const bis = G.add(u, v), bl = G.len(bis)
    const centre = G.add(B, G.mul(bis, rr / Math.sin(theta / 2) / bl))
    const T1 = G.add(B, G.mul(u, t)), T2 = G.add(B, G.mul(v, t))
    let a1 = Math.atan2(T1[1] - centre[1], T1[0] - centre[0]), a2 = Math.atan2(T2[1] - centre[1], T2[0] - centre[0])
    let d = a2 - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    for (let k = 0; k <= n; k++) out.push(G.add(centre, [rr * Math.cos(a1 + d * k / n), rr * Math.sin(a1 + d * k / n)]))
  }
  return out
}

// shapes -> { polys: [filled outlines], lines: [{ pts, w }] } (lines are polylines; a closed
// one repeats its first point at the end)
const flatten = shapes => {
  const polys = [], lines = []
  for (const s of shapes) {
    if (s.fill) polys.push(s.round ? fillet(s.fill, s.round) : s.fill)
    else if (s.ellipse) polys.push(ellipse(s.ellipse))
    else if (s.ring) { const e = ellipse(s.ring, 64); lines.push({ pts: [...e, e[0]], w: s.w }) }
    else if (s.stroke) lines.push({ pts: spline(s.stroke), w: s.w })
    else if (s.loop) lines.push({ pts: [...s.loop, s.loop[0]], w: s.w })
  }
  return { polys, lines }
}

// JSCAD (v1) CAG expression for the flattened art
const cagOf = ({ polys, lines }) => {
  const parts = polys.map(p => `CAG.fromPoints(${JSON.stringify(ccw(p).map(q => q.map(r4)))})`)
  for (const { pts, w } of lines) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = G.sub(b, a), l = G.len(d)
      if (l < 1e-6) continue
      const n = [-d[1] / l * w / 2, d[0] / l * w / 2]
      parts.push(`CAG.fromPoints(${JSON.stringify(ccw([G.add(a, n), G.add(b, n), G.sub(b, n), G.sub(a, n)]).map(q => q.map(r4)))})`)
    }
    for (const p of pts) parts.push(`CAG.circle({ center: [${r4(p[0])}, ${r4(p[1])}], radius: ${w / 2}, resolution: 12 })`)
  }
  return `unionAll([${parts.join(',\n    ')}])`
}

// Every point the art reaches (for the checks)
const extentPoints = ({ polys, lines }) => [
  ...polys.flat(),
  ...lines.flatMap(({ pts, w }) => pts.flatMap(p => [0, 1, 2, 3, 4, 5, 6, 7].map(k => G.add(p, G.rot([w / 2, 0], k * 45))))),
]

const mirrorShape = s => {
  const fx = p => [-p[0], p[1]]
  for (const k of ['fill', 'stroke', 'loop']) if (s[k]) return { ...s, [k]: s[k].map(fx) }
  for (const k of ['ellipse', 'ring']) if (s[k]) return { ...s, [k]: [-s[k][0], s[k][1], s[k][2], s[k][3], -(s[k][4] || 0)] }
  return s
}

// art: shapes; holes: insert hole centres; outline: the case's outer edge; mirror: right half
const build = ({ art, holes, holeR, depth, outline, edge = 0.5, mirror = false }) => {
  const fx = p => (mirror ? [-p[0], p[1]] : p)
  const flat = flatten(mirror ? art.map(mirrorShape) : art)

  // checks: the art stays `edge` inside the floor and clear of the insert holes
  const warnings = []
  const outlineP = outline.map(fx), holesP = holes.map(fx)
  const pts = extentPoints(flat)
  for (const p of pts) {
    const { d, inside } = G.pointPoly(p, outlineP)
    if (!inside || d < edge) { warnings.push(`art within ${inside ? d.toFixed(1) : 'outside'} mm of the case edge at (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`); break }
  }
  for (const h of holesP) {
    const p = pts.find(q => G.dist(q, h) < holeR)
    if (p) warnings.push(`art cut by the insert hole at (${h[0].toFixed(1)}, ${h[1].toFixed(1)}), near (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`)
  }
  const holeCuts = `unionAll([${holesP.map(h => `CAG.circle({ center: [${r4(h[0])}, ${r4(h[1])}], radius: ${holeR}, resolution: 24 })`).join(', ')}])`

  const lib = `
function unionAll(parts) {
  while (parts.length > 1) {
    const next = [];
    for (let i = 0; i < parts.length; i += 2) next.push(i + 1 < parts.length ? parts[i].union(parts[i + 1]) : parts[i]);
    parts = next;
  }
  return parts[0];
}
function art2d() { return ${cagOf(flat)}.subtract(${holeCuts}); }
`
  const extrude = (z0, z1) => `art2d().extrude({ offset: [0, 0, ${r4(z1 - z0)}] }).translate([0, 0, ${r4(z0)}])`
  return {
    warnings,
    // the case, with the art cut into its bottom face
    caseWith: base => base.replace(/function main\(\)\s*\{\s*return (\w+)\(\);\s*\}/, 'function case_base() { return $1(); }') + lib + `
function main() {
  return case_base().subtract(${extrude(-1, depth)});
}
`,
    art: lib + `\nfunction main() { return ${extrude(0, depth)}; }\n`,
    flat,
  }
}

// Preview of the underside, seen from below (mirrored)
const preview = ({ polys, lines }, outline, holes, colours = { case: '#7a5536', art: '#f2ead8' }) => {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1])
  const pad = 6
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const P = p => `${r4(maxX - p[0])},${r4(maxY - p[1])}`
  const s = [`<polygon points="${outline.map(P).join(' ')}" fill="${colours.case}"/>`]
  for (const p of polys) s.push(`<polygon points="${p.map(P).join(' ')}" fill="${colours.art}"/>`)
  for (const { pts, w } of lines) s.push(`<polyline points="${pts.map(P).join(' ')}" fill="none" stroke="${colours.art}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`)
  for (const h of holes) s.push(`<circle cx="${r4(maxX - h[0])}" cy="${r4(maxY - h[1])}" r="1.6" fill="#fff"/>`)
  const W = maxX - minX, H = maxY - minY
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r4(W)} ${r4(H)}" width="${r4(W * 5)}" height="${r4(H * 5)}"><rect width="100%" height="100%" fill="#fff"/>\n${s.join('\n')}\n</svg>`
}

// A closed line's points, every step mm, with any that come within r of a hole pushed out
// to r, so the line bends round the hole
const skirt = (pts, holes, r, step = 0.5) => {
  const dense = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(G.dist(a, b) / step))
    for (let k = 0; k < n; k++) dense.push(G.add(a, G.mul(G.sub(b, a), k / n)))
  }
  return dense.map(p => {
    for (const h of holes) {
      const d = G.dist(p, h)
      if (d < r) return G.add(h, G.mul(G.sub(p, h), r / Math.max(d, 1e-6)))
    }
    return p
  })
}

module.exports = { build, preview, skirt }
