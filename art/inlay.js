// Art for a part's face (the moose under the case, the word on the plate):
//   - print: a true-size print file for the UV printer, the art alone (what the build uses)
//   - preview: a picture of the art on its part
//   - build: the checks (the art stays inside the face and clear of holes), and a two-colour
//     inlay: the art cut into the face `depth` deep (caseWith) and the art as its own body
//     filling that cut (art), for a multi-colour 3D printer. caseWith also rebuilds the
//     case's chamfered bottom, with cut: false without the art.

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

// ---- stroke outlines ----
// Each line becomes one clean outline polygon (a ring for a closed line), not a pile of
// segment rectangles and joint circles: JSCAD's booleans go wrong on hundreds of overlapping
// slivers with nearly coinciding corners, and then the case and the art overlap.

// points every `step` mm along a polyline (closed when its last point repeats its first)
const resample = (pts, step) => {
  const out = [pts[0]]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = G.dist(a, b)
    let t = step - carry
    while (t <= l) { out.push(G.add(a, G.mul(G.sub(b, a), t / l))); t += step }
    carry = l - (t - step)
  }
  const last = pts[pts.length - 1]
  if (G.dist(out[out.length - 1], last) > step * 0.3) out.push(last)
  else out[out.length - 1] = last
  return out
}

// the polyline moved sideways by d (to its left when d > 0), along each point's normal
const side = (pts, d, closed) => {
  const n = pts.length
  return pts.map((p, i) => {
    const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)]
    const b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)]
    const t = G.sub(b, a), l = G.len(t) || 1
    return G.add(p, G.mul([-t[1] / l, t[0] / l], d))
  })
}

// cuts out the small loops an offset line makes where it folds inside a tight bend
const unloop = (pts, closed, window = 60) => {
  let out = pts.slice()
  for (let i = 0; i < out.length; i++) {
    const n = out.length
    const lastJ = closed ? Math.min(n - 1, i + window) : Math.min(n - 2, i + window)
    for (let j = i + 2; j <= lastJ; j++) {
      if (closed && (j + 1) % n === i) continue
      const X = G.segInter(out[i], out[(i + 1) % n], out[j], out[(j + 1) % n])
      if (X) { out = [...out.slice(0, i + 1), X, ...out.slice(j + 1)]; break }
    }
  }
  return out
}

const area = pts => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); return a / 2 }

// whether a closed polygon crosses itself (for the checks)
const selfCrossing = pts => {
  const n = pts.length
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if ((j + 1) % n === i) continue
    if (G.segInter(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return pts[i]
  }
  return null
}

// a line of width w -> { outer, hole } outlines
const strokeOutline = (pts, w) => {
  const r = w / 2
  const closed = pts.length > 2 && G.dist(pts[0], pts[pts.length - 1]) < 1e-6
  let P = resample(pts, 0.2)
  if (closed) {
    P = P.slice(0, -1)
    const a = unloop(side(P, r, true), true), b = unloop(side(P, -r, true), true)
    return Math.abs(area(a)) > Math.abs(area(b)) ? { outer: a, hole: b } : { outer: b, hole: a }
  }
  const L = unloop(side(P, r, false), false), R = unloop(side(P, -r, false), false)
  const cap = (c, from) => Array.from({ length: 9 }, (_, k) => G.add(c, G.rot([r, 0], from - 180 * (k + 1) / 10)))
  const ang = v => Math.atan2(v[1], v[0]) * 180 / Math.PI
  const n = P.length
  const nEnd = G.sub(L[L.length - 1], P[n - 1]), nStart = G.sub(R[0], P[0])
  const outer = [...L, ...cap(P[n - 1], ang(nEnd)), ...R.slice().reverse(), ...cap(P[0], ang(nStart))]
  return { outer: unloop(outer, true) }
}

// Douglas-Peucker on a closed outline, then no two points closer than `gap`: straight runs
// keep only their ends, curves keep what they need to stay within tol
const simplify = (pts, tol = 0.01, gap = 0.03) => {
  // open run q[a..b]: the points to keep, without q[b]
  const dp = (q, a, b) => {
    let k = -1, dmax = tol
    for (let i = a + 1; i < b; i++) { const d = G.pointSeg(q[i], q[a], q[b]); if (d > dmax) { dmax = d; k = i } }
    return k < 0 ? [q[a]] : [...dp(q, a, k), ...dp(q, k, b)]
  }
  // split the loop at the point farthest from the first, so both halves are open runs
  let far = 0
  pts.forEach((p, i) => { if (G.dist(p, pts[0]) > G.dist(pts[far], pts[0])) far = i })
  const first = pts.slice(0, far + 1), second = [...pts.slice(far), pts[0]]
  const out = [...dp(first, 0, first.length - 1), ...dp(second, 0, second.length - 1)]
  return out.filter((p, i) => i === 0 || G.dist(p, out[i - 1]) >= gap)
}

// splits an open line wherever it has turned more than maxTurn degrees since the last split,
// so no piece can come round onto itself (the pieces overlap at the split points)
const splitTurns = (pts, maxTurn = 150) => {
  const P = resample(pts, 0.2), pieces = []
  let start = 0, turn = 0
  for (let i = 1; i < P.length - 1; i++) {
    const a = G.sub(P[i], P[i - 1]), b = G.sub(P[i + 1], P[i])
    turn += Math.abs(Math.atan2(G.cross(a, b), G.dot(a, b))) * 180 / Math.PI
    if (turn > maxTurn) { pieces.push(P.slice(start, i + 1)); start = i; turn = 0 }
  }
  pieces.push(P.slice(start))
  return pieces.filter(p => p.length > 1)
}

// JSCAD (v1) CAG expression for the flattened art, and any outline that crosses itself
const cagOf = ({ polys, lines }) => {
  const poly = p => `CAG.fromPoints(${JSON.stringify(ccw(simplify(p)).map(q => q.map(r4)))})`
  const parts = polys.map(poly)
  const crossings = []
  for (const { pts, w } of lines) {
    const closed = pts.length > 2 && G.dist(pts[0], pts[pts.length - 1]) < 1e-6
    for (const piece of closed ? [pts] : splitTurns(pts)) {
      const { outer, hole } = strokeOutline(piece, w)
      for (const o of [outer, hole]) { const x = o && selfCrossing(simplify(o)); if (x) crossings.push(x) }
      parts.push(hole ? `${poly(outer)}.subtract(${poly(hole)})` : poly(outer))
    }
  }
  return { expr: `unionAll([${parts.join(',\n    ')}])`, crossings }
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

// art: shapes; holes: centres of holes through the face, which the art keeps clear of (by\n// holeR); outline: the part's outer edge; mirror: right half.
// The art goes into the part's bottom face, or with `top` (that face's height) into its top.
const build = ({ art, holes, holeR, depth, outline, edge = 0.5, mirror = false, top = null }) => {
  const fx = p => (mirror ? [-p[0], p[1]] : p)
  const flat = flatten(mirror ? art.map(mirrorShape) : art)

  // checks: the art stays `edge` inside the face and clear of the holes
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
  const holeCuts = holesP.length ? `.subtract(unionAll([${holesP.map(h => `CAG.circle({ center: [${r4(h[0])}, ${r4(h[1])}], radius: ${holeR}, resolution: 24 })`).join(', ')}]))` : ''
  const cag = cagOf(flat)
  for (const x of cag.crossings) warnings.push(`a line's outline crosses itself near (${x[0].toFixed(1)}, ${x[1].toFixed(1)})`)

  const lib = `
function unionAll(parts) {
  while (parts.length > 1) {
    const next = [];
    for (let i = 0; i < parts.length; i += 2) next.push(i + 1 < parts.length ? parts[i].union(parts[i + 1]) : parts[i]);
    parts = next;
  }
  return parts[0];
}
function art2d() { return ${cag.expr}${holeCuts}; }
`
  const extrude = (z0, z1) => `art2d().extrude({ offset: [0, 0, ${r4(z1 - z0)}] }).translate([0, 0, ${r4(z0)}])`
  const [z0, z1] = top === null ? [0, depth] : [top - depth, top]
  return {
    warnings,
    // The part with the art cut into its face. Subtracting the art in 3D leaves stray faces
    // and uncut patches (the art is hundreds of small overlapping pieces), so the layers the
    // art sits in are rebuilt from 2D instead: the part's outline there minus the art, extruded.
    // Only one flat slice through the part stays a 3D operation.
    //   slices: [{ z0, z1, footprint }] bottom up (or top down) covering the art's depth and
    //           anything else that has to be rebuilt (the chamfer); footprint is a JSCAD
    //           expression for the part's 2D outline in that slice; the art is taken out of
    //           every slice inside the art's depth
    //   cut: false rebuilds the slices without taking the art out (for the chamfer alone)
    caseWith: (base, slices, { cut = true } = {}) => {
      const lo = Math.min(...slices.map(s => s.z0)), hi = Math.max(...slices.map(s => s.z1))
      const keep = top === null
        ? `whole().intersect(CSG.cube({ corner1: [-1000, -1000, ${r4(hi)}], corner2: [1000, 1000, 1000] }))`
        : `whole().intersect(CSG.cube({ corner1: [-1000, -1000, -1000], corner2: [1000, 1000, ${r4(lo)}] }))`
      // Slices that only touch leave both faces of the join behind inside the solid (which
      // slicers read as overlapping shells), so each slice reaches EPS into the solid next to
      // it, where it lies wholly inside: on the bottom face upwards (the slice above is never
      // narrower), on the top face downwards (the plate below has no art taken out).
      const EPS = 0.02
      const layers = slices.map(s => {
        const inArt = cut && s.z0 >= z0 - 1e-6 && s.z1 <= z1 + 1e-6
        const [a, b] = top === null ? [s.z0, s.z1 + EPS] : [s.z0 - EPS, s.z1]
        return `(${s.footprint})${inArt ? '.subtract(art2d())' : ''}.extrude({ offset: [0, 0, ${r4(b - a)}] }).translate([0, 0, ${r4(a)}])`
      })
      return base.replace(/function main\(\)\s*\{\s*return (\w+)\(\);\s*\}/, 'function whole() { return $1(); }') + lib + `
function main() {
  return unionAll([
    ${[keep, ...layers].join(',\n    ')}
  ]).fixTJunctions();
}
`
    },
    art: lib + `\nfunction main() { return ${extrude(z0, z1)}.fixTJunctions(); }\n`,
    flat,
  }
}

// Preview of the art on its part: seen from below (mirrored), or from the top with fromTop.
// extra: more outlines to draw over the part (e.g. the keycaps), in a darker shade.
const preview = ({ polys, lines }, outline, holes, colours = { case: '#7a5536', art: '#f2ead8' }, { fromTop = false, extra = [] } = {}) => {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1])
  const pad = 6
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const X = x => (fromTop ? x - minX : maxX - x)
  const P = p => `${r4(X(p[0]))},${r4(maxY - p[1])}`
  const s = [`<polygon points="${outline.map(P).join(' ')}" fill="${colours.case}"/>`]
  for (const p of polys) s.push(`<polygon points="${p.map(P).join(' ')}" fill="${colours.art}"/>`)
  for (const { pts, w } of lines) s.push(`<polyline points="${pts.map(P).join(' ')}" fill="none" stroke="${colours.art}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`)
  for (const h of holes) s.push(`<circle cx="${r4(X(h[0]))}" cy="${r4(maxY - h[1])}" r="1.6" fill="#fff"/>`)
  for (const e of extra) s.push(`<polygon points="${e.map(P).join(' ')}" fill="#000" fill-opacity="0.45"/>`)
  const W = maxX - minX, H = maxY - minY
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r4(W)} ${r4(H)}" width="${r4(W * 5)}" height="${r4(H * 5)}"><rect width="100%" height="100%" fill="#fff"/>\n${s.join('\n')}\n</svg>`
}

// A print file for the UV printer: the art alone, true size (mm), seen from below (mirrored)
// or from the top with fromTop. The drawing is exactly the part outline's bounding box, so
// lining its edges up with the part's lines the art up. Lines are drawn as filled outlines,
// not strokes, which any printer software renders the same.
const print = ({ polys, lines }, outline, colour, { fromTop = false } = {}) => {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const X = x => (fromTop ? x - minX : maxX - x)
  const d = pts => 'M' + pts.map(p => `${r4(X(p[0]))} ${r4(maxY - p[1])}`).join('L') + 'Z'
  const s = polys.map(p => `<path d="${d(p)}"/>`)
  for (const { pts, w } of lines) {
    const closed = pts.length > 2 && G.dist(pts[0], pts[pts.length - 1]) < 1e-6
    for (const piece of closed ? [pts] : splitTurns(pts)) {
      const { outer, hole } = strokeOutline(piece, w)
      s.push(`<path fill-rule="evenodd" d="${d(outer)}${hole ? d(hole) : ''}"/>`)
    }
  }
  const W = maxX - minX, H = maxY - minY
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${r4(W)}mm" height="${r4(H)}mm" viewBox="0 0 ${r4(W)} ${r4(H)}">
<g fill="${colour}">
${s.join('\n')}
</g>
</svg>
`
}

// Ergogen's case JSCAD has a function per outline that returns it extruded. This adds a 2D
// twin, `<name>_2d()`, to the source: the same body without the final extrude.
const with2d = (src, name) => {
  const m = src.match(new RegExp(`function ${name}_extrude_\\w+_outline_fn\\(\\)\\s*\\{([\\s\\S]*?)\\.extrude\\(\\{ offset: \\[0, 0, [\\d.]+\\] \\}\\);\\s*\\}`))
  if (!m) throw new Error(`no ${name} outline in the case source`)
  return src + `\nfunction ${name}_2d() {${m[1]};\n}\n`
}

// JSCAD expression for a closed outline (points) as a 2D shape
const polyExpr = pts => `CAG.fromPoints(${JSON.stringify(ccw(pts).map(q => q.map(r4)))})`

// A closed outline moved inwards by d: each corner along its bisector, mitred (fine for
// small d on an outline with no part narrower than 2d)
const inset = (pts, d) => {
  const P = ccw(pts).filter((p, i, a) => G.dist(p, a[(i + 1) % a.length]) > 1e-6), m = P.length
  return P.map((B, i) => {
    const A = P[(i - 1 + m) % m], C = P[(i + 1) % m]
    const e1 = G.sub(B, A), e2 = G.sub(C, B)
    const n1 = G.mul([-e1[1], e1[0]], 1 / G.len(e1)), n2 = G.mul([-e2[1], e2[0]], 1 / G.len(e2))   // inward (left) normals
    const bis = G.add(n1, n2), c = G.dot(bis, n1)
    return c < 1e-6 ? G.add(B, G.mul(n1, d)) : G.add(B, G.mul(bis, d / c))
  })
}

module.exports = { build, preview, print, polyExpr, inset, with2d }
