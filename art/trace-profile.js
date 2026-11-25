// Traces keycap side profiles from a picture (art/cs_profiles.png: light grey shapes on a dark
// background, side by side) into art/cs_profiles.json. Each shape's outline is the top edge
// of the light area in every pixel column, found to a fraction of a pixel where the edge's
// grey crosses half way between the background and the shape.
//
// CLI: node art/trace-profile.js [--stats]

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ---------- PNG (8-bit greyscale, RGB or RGBA, not interlaced) ----------
const readPng = file => {
  const b = fs.readFileSync(file)
  let p = 8, w, h, type, idat = []
  while (p < b.length) {
    const len = b.readUInt32BE(p), kind = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNGs')
    } else if (kind === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const ch = { 0: 1, 2: 3, 6: 4 }[type]
  if (!ch) throw new Error(`PNG colour type ${type} isn't handled`)
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const A = x >= ch ? px[y * stride + x - ch] : 0, B = y ? px[(y - 1) * stride + x] : 0, C = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0
      const pa = Math.abs(B - C), pb = Math.abs(A - C), pc = Math.abs(A + B - 2 * C)
      const pred = [0, A, B, (A + B) >> 1, pa <= pb && pa <= pc ? A : pb <= pc ? B : C][f]
      px[y * stride + x] = (row[x] + pred) & 255
    }
  }
  // brightness (the mean of the colour channels), 0-255
  return { w, h, at: (x, y) => { const o = y * stride + x * ch; return ch === 1 ? px[o] : (px[o] + px[o + 1] + px[o + 2]) / 3 } }
}

const ROOT = path.resolve(__dirname, '..')
const img = readPng(path.join(ROOT, 'art', 'cs_profiles.png'))
const bg = img.at(2, 2)

// the shape's grey: the most common bright value
const hist = new Array(256).fill(0)
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) hist[Math.round(img.at(x, y))]++
let fill = 0
for (let v = Math.round(bg) + 40; v < 256; v++) if (hist[v] > hist[fill]) fill = v
const mid = (bg + fill) / 2

// each column's top edge (sub-pixel), or null where the column has no shape
const tops = []
for (let x = 0; x < img.w; x++) {
  let top = null
  for (let y = 1; y < img.h; y++) {
    if (img.at(x, y) >= mid) { const a = img.at(x, y - 1), b = img.at(x, y); top = y - 1 + (mid - a) / (b - a); break }
  }
  tops.push(top)
}

if (process.argv.includes('--stats')) {
  console.log(`${img.w} x ${img.h}, background ${bg.toFixed(0)}, shape ${fill}`)
  const runs = []
  for (let x = 0; x < img.w; x++) if (tops[x] !== null && (x === 0 || tops[x - 1] === null)) runs.push([x])
    else if (tops[x] === null && x && tops[x - 1] !== null) runs[runs.length - 1].push(x - 1)
  for (const [a, b] of runs) {
    let lo = Infinity
    for (let x = a; x <= b; x++) lo = Math.min(lo, tops[x])
    console.log(`shape: columns ${a}-${b}, top at row ${lo.toFixed(1)}`)
  }
  for (const y of [img.h - 1, img.h - 3, img.h - 6, img.h - 12]) {
    const row = []
    for (let x = 0; x < img.w; x += 1) row.push(img.at(x, y) >= mid ? '#' : '.')
    console.log(`row ${y}: ${row.join('').replace(/(.)\1*/g, m => m[0] + m.length + ' ')}`)
  }
  process.exit(0)
}

// ---------- profiles, in mm ----------
// Each shape's base (the bottom of its last row) is the bottom of the cap's skirt, z = 0, and
// its width there is the cap's depth front to back, cap_pitch - cap_gap. The picture has the
// back on the left, so y (front -, back +) runs right to left. Points run front to back.
const BASE = 297.5            // the shapes' bottom edge (rows are counted at pixel centres)
const DEPTH = 18              // cap_pitch 19 - cap_gap 1
const shapes = []
for (let x = 0; x < img.w; x++) if (tops[x] !== null && (x === 0 || tops[x - 1] === null)) shapes.push({ a: x })
  else if (tops[x] === null && x && tops[x - 1] !== null) shapes[shapes.length - 1].b = x - 1
const scale = shapes.reduce((s, sh) => s + (sh.b - sh.a + 1), 0) / shapes.length / DEPTH   // px per mm
const r3 = v => Math.round(v * 1000) / 1000
// The home row's profile (the second shape) is made the same front and back: its trace is
// averaged with its own mirror image before it's smoothed.
const SYMMETRIC = [false, true]
const raws = shapes.map(({ a, b }) => {
  const cx = (a + b) / 2
  const raw = [[(cx - (b + 0.5)) / scale, 0]]
  for (let x = b; x >= a; x--) raw.push([(cx - x) / scale, Math.max(0, (BASE - tops[x]) / scale)])
  raw.push([(cx - (a - 0.5)) / scale, 0])
  return raw
})
const zoom = traceZoom(raws)
const profiles = shapes.map(({ a, b }, i) => {
  const cx = (a + b) / 2
  const raw = raws[i]
  // where the zoomed screenshot covers it too, the two traces averaged
  const z2 = zoom && zoom.z[i]
  const merged = raw.map(([y, z]) => { const w = z2 && z2(y); return w === null || w === undefined ? [y, z] : [y, (z + w) / 2] })
  const fit = smoothest(SYMMETRIC[i] ? symmetric(merged) : merged)
  let points = fit.points
  if (SYMMETRIC[i]) {   // exactly: the front half, and its mirror image for the back
    const front = points.filter(([y]) => y < -1e-9)
    points = [...front, [0, r3(fit.at0)], ...front.slice().reverse().map(([y, z]) => [r3(-y), z])]
  }
  return { cx, px: [a, b], raw, zoomRaw: zoom ? zoom.raw[i] : null, points, lambda: fit.lambda, ctrl: fit.n, err: fit.err, symmetric: SYMMETRIC[i] }
})

// art/cs_profiles_zoom.png, if it's there: a sharper screenshot of the shapes' tops (cut off at
// the sides and bottom, at about a quarter of the first picture's scale). Its trace is lined up
// with the first picture's by least squares: one scale and base line for both shapes, and each
// shape its own left-right position. Returns, for each shape, z(y) (null where it has none).
function traceZoom(raws) {
  const file = path.join(ROOT, 'art', 'cs_profiles_zoom.png')
  if (!fs.existsSync(file)) return null
  const im = readPng(file)
  const half = (im.at(2, 2) + fill) / 2
  const zt = []
  for (let x = 0; x < im.w; x++) {
    let top = null
    for (let y = 1; y < im.h; y++) if (im.at(x, y) >= half) { const a = im.at(x, y - 1), b = im.at(x, y); top = y - 1 + (half - a) / (b - a); break }
    zt.push(top !== null && top < im.h - 4 ? top : null)   // not where it runs off the bottom
  }
  const runs = []
  for (let x = 0; x < im.w; x++) if (zt[x] !== null && (x === 0 || zt[x - 1] === null)) runs.push({ a: x })
    else if (zt[x] === null && x && zt[x - 1] !== null) runs[runs.length - 1].b = x - 1
  if (runs.length && runs[runs.length - 1].b === undefined) runs[runs.length - 1].b = im.w - 1
  if (runs.length < 2) return null
  const zOf = raw => y => {
    if (y < raw[0][0] || y > raw[raw.length - 1][0]) return 0
    for (let k = 1; k < raw.length; k++) if (raw[k][0] >= y) { const t = (y - raw[k - 1][0]) / ((raw[k][0] - raw[k - 1][0]) || 1); return raw[k - 1][1] + t * (raw[k][1] - raw[k - 1][1]) }
    return 0
  }
  const ref = raws.map(zOf)
  const samples = ([s, B, c0, c1], i) => {
    const out = []
    for (let x = runs[i].b; x >= runs[i].a; x--) out.push([((i ? c1 : c0) - x) / s, (B - zt[x]) / s])
    return out
  }
  const cost = q => {
    let e = 0, n = 0
    for (const i of [0, 1]) for (const [y, z] of samples(q, i)) if (Math.abs(y) < DEPTH / 2 - 0.3) { e += (z - ref[i](y)) ** 2; n++ }
    return n ? e / n : Infinity
  }
  // starting guess: the scale from the two shapes' peaks, which are the same in both pictures
  const peak = i => Math.min(...zt.slice(runs[i].a, runs[i].b + 1))
  const ratio = (Math.max(...raws[0].map(p => p[1])) - Math.max(...raws[1].map(p => p[1]))) / (peak(1) - peak(0))
  const s0 = 1 / ratio
  const q = nelderMead(cost, [s0, peak(0) + Math.max(...raws[0].map(p => p[1])) * s0, (runs[0].a + runs[0].b) / 2, (runs[1].a + runs[1].b) / 2], [0.2, 1, 1, 1])
  const raw = [0, 1].map(i => samples(q, i))
  console.log(`zoom: lined up at ${q[0].toFixed(2)} px/mm, ${Math.sqrt(cost(q)).toFixed(3)} mm rms from the first picture`)
  return {
    raw,
    z: raw.map(pts => y => {
      if (y < pts[0][0] || y > pts[pts.length - 1][0] || Math.abs(y) >= DEPTH / 2 - 0.3) return null
      for (let k = 1; k < pts.length; k++) if (pts[k][0] >= y) { const t = (y - pts[k - 1][0]) / ((pts[k][0] - pts[k - 1][0]) || 1); return pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1]) }
      return null
    }),
  }
}

function nelderMead(f, x0, step) {
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[j] : 0)))].map(x => [x, f(x)])
  for (let it = 0; it < 4000; it++) {
    S.sort((a, b) => a[1] - b[1])
    const c = S[0][0].map((_, j) => S.slice(0, -1).reduce((s, p) => s + p[0][j], 0) / (S.length - 1))
    const w = S[S.length - 1][0], r = c.map((v, j) => v + (v - w[j])), fr = f(r)
    if (fr < S[0][1]) { const e = c.map((v, j) => v + 2 * (v - w[j])), fe = f(e); S[S.length - 1] = fe < fr ? [e, fe] : [r, fr] }
    else if (fr < S[S.length - 2][1]) S[S.length - 1] = [r, fr]
    else {
      const k = c.map((v, j) => v + 0.5 * (w[j] - v)), fk = f(k)
      if (fk < S[S.length - 1][1]) S[S.length - 1] = [k, fk]
      else S = S.map((p, i) => (i ? p[0].map((v, j) => S[0][0][j] + 0.5 * (v - S[0][0][j])) : p[0])).map(x => [x, f(x)])
    }
  }
  S.sort((a, b) => a[1] - b[1])
  return S[0][0]
}

// An outline (front to back) averaged with its mirror image (y -> -y), point for point at
// the same fraction of the way along each, so it comes out the same front and back.
function symmetric(raw) {
  const at = pts => {
    const len = [0]
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return f => {
      const L = f * len[len.length - 1]
      let k = 1
      while (k < pts.length - 1 && len[k] < L) k++
      const t = (L - len[k - 1]) / ((len[k] - len[k - 1]) || 1)
      return [0, 1].map(d => pts[k - 1][d] + t * (pts[k][d] - pts[k - 1][d]))
    }
  }
  const A = at(raw), B = at(raw.slice().reverse().map(([y, z]) => [-y, z]))
  const N = raw.length
  return Array.from({ length: N }, (_, k) => { const p = A(k / (N - 1)), q = B(k / (N - 1)); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] })
}

// The smoothest curve that still follows the trace: a cubic B-spline through both ends, fitted
// by least squares with as few control points as keep it within TOL of every traced point,
// then sampled every ~0.2 mm along its length.
function smoothest(raw, TOL = 0.1, N = 30) {
  const len = [0]
  for (let i = 1; i < raw.length; i++) len.push(len[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]))
  const ts = len.map(l => l / len[len.length - 1])
  // the strongest smoothing (lambda, a cost on the curve's bend changing) that keeps it within
  // TOL of every traced point
  // The control points are spaced by how sharply a first, rough fit bends: crowded into the
  // corners, few along the flat stretches, so smoothing can iron the flats without cutting the
  // corners.
  const rough = bspline(raw, ts, N, 0.05)
  const dens = [], M = 400
  for (let k = 0; k <= M; k++) {
    const [a, b, c] = [rough(Math.max(0, k - 1) / M), rough(k / M), rough(Math.min(M, k + 1) / M)]
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1])
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    const kappa = ab && bc && ac ? 2 * area2 / (ab * bc * ac) : 0      // 1 / radius
    dens.push(Math.sqrt(kappa + 0.15))
  }
  const cum = [0]
  for (let k = 1; k <= M; k++) cum.push(cum[k - 1] + (dens[k - 1] + dens[k]) / 2)
  const knotAt = f => { const L = f * cum[M]; let k = 1; while (k < M && cum[k] < L) k++; return ((k - 1) + (L - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1)) / M }
  const inner = Array.from({ length: N - 2 }, (_, i) => (i === 0 ? 0 : i === N - 3 ? 1 : knotAt(i / (N - 3))))
  const lambdas = Array.from({ length: 41 }, (_, k) => 10 ** (4 - k * 0.2))
  for (const [li, lambda] of lambdas.entries()) {
    const n = N
    const curve = bspline(raw, ts, n, lambda, inner)
    const dense = []
    for (let k = 0; k <= 2000; k++) dense.push(curve(k / 2000))
    let err = 0
    for (const p of raw) {
      let d = Infinity
      for (const q of dense) d = Math.min(d, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)
      err = Math.max(err, Math.sqrt(d))
    }
    if (err <= TOL || li === lambdas.length - 1) {
      const out = [dense[0]]
      let run = 0
      for (let k = 1; k < dense.length; k++) {
        run += Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1])
        if (run >= 0.2 || k === dense.length - 1) { out.push(dense[k]); run = 0 }
      }
      // (at0: the height where it crosses y = 0)
      let at0 = 0
      for (let k = 1; k < dense.length; k++) if ((dense[k - 1][0] - 0) * (dense[k][0] - 0) <= 0) { const t = -dense[k - 1][0] / ((dense[k][0] - dense[k - 1][0]) || 1); at0 = dense[k - 1][1] + t * (dense[k][1] - dense[k - 1][1]); break }
      return { n, lambda, err, at0, points: out.map(([y, z]) => [r3(y), r3(Math.max(0, z))]) }
    }
  }
}

// least-squares clamped uniform cubic B-spline with n control points, its ends on the first and
// last points, plus lambda times the sum of the control points' squared third differences (a
// cost on the curve's bend changing); returns t (0-1) -> [y, z]
function bspline(pts, ts, n, lambda = 0, inner = null) {
  const knots = [0, 0, 0, ...(inner || Array.from({ length: n - 2 }, (_, i) => i / (n - 3))), 1, 1, 1]
  const basis = t => {
    t = Math.min(t, 1 - 1e-12)
    let N = knots.slice(0, -1).map((k, i) => (t >= k && t < knots[i + 1] ? 1 : 0))
    for (let p = 1; p <= 3; p++) {
      N = N.slice(0, -1).map((_, i) => {
        const a = knots[i + p] - knots[i], b = knots[i + p + 1] - knots[i + 1]
        return (a ? (t - knots[i]) / a * N[i] : 0) + (b ? (knots[i + p + 1] - t) / b * N[i + 1] : 0)
      })
    }
    return N   // n values
  }
  const P0 = pts[0], Pn = pts[pts.length - 1], m = n - 2
  const A = Array.from({ length: m }, () => new Array(m).fill(0)), R = [0, 1].map(() => new Array(m).fill(0))
  pts.forEach((p, k) => {
    const N = basis(ts[k])
    const rhs = [0, 1].map(d => p[d] - N[0] * P0[d] - N[n - 1] * Pn[d])
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) A[i][j] += N[i + 1] * N[j + 1]
      for (const d of [0, 1]) R[d][i] += N[i + 1] * rhs[d]
    }
  })
  // third differences over the full control polygon (ends fixed), scaled to the point count
  const w = lambda * pts.length / n
  for (let r = 0; r + 3 < n; r++) {
    const D = { [r]: -1, [r + 1]: 3, [r + 2]: -3, [r + 3]: 1 }
    const fixed = [0, 1].map(d => (D[0] || 0) * P0[d] + (D[n - 1] || 0) * Pn[d])
    for (let i = 0; i < m; i++) {
      const di = D[i + 1] || 0
      if (!di) continue
      for (let j = 0; j < m; j++) A[i][j] += w * di * (D[j + 1] || 0)
      for (const d of [0, 1]) R[d][i] -= w * di * fixed[d]
    }
  }
  const solve = (M, v) => {   // Gaussian elimination with partial pivoting
    M = M.map((r, i) => [...r, v[i]])
    for (let c = 0; c < m; c++) {
      let piv = c
      for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
      ;[M[c], M[piv]] = [M[piv], M[c]]
      for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k] }
    }
    return M.map((r, i) => r[m] / r[i])
  }
  const cy = solve(A, R[0]), cz = solve(A, R[1])
  const C = [P0, ...cy.map((y, i) => [y, cz[i]]), Pn]
  return t => { const N = basis(t); return [0, 1].map(d => N.reduce((s, w, i) => s + w * C[i][d], 0)) }
}

if (require.main === module) {
  const [top, home] = profiles
  const doc = {
    source: 'art/cs_profiles.png, traced by art/trace-profile.js',
    note: 'y: front (-) to back (+), z: up from the bottom of the skirt, mm',
    scale_px_per_mm: r3(scale),
    top: top.points,
    home: home.points,
  }
  fs.writeFileSync(path.join(ROOT, 'art', 'cs_profiles.json'), JSON.stringify(doc, null, 1))
  for (const [name, p] of [['top', top], ['home', home]]) {
    const zs = p.points.map(q => q[1]), mid = p.points.reduce((m, q) => Math.abs(q[0]) < Math.abs(m[0]) ? q : m)
    console.log(`${name}: smoothing ${p.lambda.toExponential(1)}, within ${p.err.toFixed(3)} mm of the trace, ${p.points.length} points, ${r3(p.points[p.points.length - 1][0] - p.points[0][0])} mm deep, peak ${Math.max(...zs).toFixed(2)} mm, ${mid[1].toFixed(2)} mm in the middle`)
  }
  fs.writeFileSync(path.join(ROOT, 'art', 'cs_profiles.svg'), reviewSvg([['Top row (and bottom row, turned round)', top], ['Home row, thumbs and the 1.5u', home]]))
}

// ---------- review drawing ----------
// Each profile over the picture it was traced from, and the cap's section through the stem as
// it would be built: the hollow (the profile eroded by the top's thickness, no higher than the
// skirt, inside the walls), the stem post and its cross socket. Front on the right, as drawn.
function reviewSvg(panels) {
  const T = 1.2, Z1 = 3.3, WALL = 1.6, POST = 5.4, SOCKET = 3.0
  const W = 24, H = 15, PAD = 2, s = 32          // panel size (mm) and px per mm on screen
  const png = fs.readFileSync(path.join(ROOT, 'art', 'cs_profiles.png')).toString('base64')
  const X = p => r3(-p[0]), Y = p => r3(-p[1])  // front on the right, z up
  const body = panels.map(([title, p], i) => {
    const ox = PAD + i * (W + PAD) + W / 2, oy = PAD + H - 2
    const S = y => {   // the profile's height at y (0 outside it)
      const q = p.points
      if (y <= q[0][0] || y >= q[q.length - 1][0]) return 0
      for (let k = 1; k < q.length; k++) if (q[k][0] >= y) { const t = (y - q[k - 1][0]) / ((q[k][0] - q[k - 1][0]) || 1); return q[k - 1][1] + t * (q[k][1] - q[k - 1][1]) }
      return 0
    }
    // the hollow's ceiling: the highest point whose disc of radius T stays under the profile
    const cav = []
    for (let y = -DEPTH / 2 + WALL; y <= DEPTH / 2 - WALL + 1e-9; y += 0.1) {
      let c = Z1
      for (let u = -T; u <= T; u += 0.05) c = Math.min(c, S(y + u) - Math.sqrt(Math.max(0, T * T - u * u)))
      cav.push([y, Math.max(0, c)])
    }
    const peak = p.points.reduce((m, q) => q[1] > m[1] ? q : m), front = p.points.find(q => q[0] >= -DEPTH / 2 + 2), back = p.points.slice().reverse().find(q => q[0] <= DEPTH / 2 - 2)
    const thin = cav.filter(q => Math.abs(q[0]) <= POST / 2 + 0.5).reduce((m, q) => Math.min(m, S(q[0]) - Z1), Infinity)
    const path = 'M' + p.points.map(q => `${X(q)},${Y(q)}`).join(' L') + ' Z'
    const hollow = 'M' + [[-DEPTH / 2 + WALL, 0], ...cav, [DEPTH / 2 - WALL, 0]].map(q => `${X(q)},${Y(q)}`).join(' L') + ' Z'
    const label = (q, text, dx = 0.4) => `<text x="${r3(X(q) + dx)}" y="${r3(Y(q) - 0.4)}" font-size="0.75">${text}</text>`
    return `<g transform="translate(${ox} ${oy})">
  <clipPath id="c${i}"><rect x="-10.5" y="${-H + 2}" width="21" height="${H}"/></clipPath>
  <text x="${-W / 2}" y="${-H + 3.2}" font-size="1" font-weight="bold">${title}</text>
  <g stroke="#3a3a3a" stroke-width="0.03">${Array.from({ length: 21 }, (_, k) => `<line x1="${k - 10}" y1="${-H + 4}" x2="${k - 10}" y2="1"/>`).join('')}${Array.from({ length: 11 }, (_, k) => `<line x1="-10" y1="${-k}" x2="10" y2="${-k}"/>`).join('')}</g>
  <image href="data:image/png;base64,${png}" x="${r3(-p.cx / scale)}" y="${r3(-BASE / scale)}" width="${r3(img.w / scale)}" height="${r3(img.h / scale)}" opacity="0.35" clip-path="url(#c${i})"/>
  <path d="${path}" fill="#4f8fd6" fill-opacity="0.55" stroke="#9fd0ff" stroke-width="0.08"/>
  <polyline points="${p.raw.map(q => `${X(q)},${Y(q)}`).join(' ')}" fill="none" stroke="#ff6060" stroke-width="0.04"/>
  ${p.zoomRaw ? `<polyline points="${p.zoomRaw.map(q => `${X(q)},${Y(q)}`).join(' ')}" fill="none" stroke="#ffd040" stroke-width="0.04"/>` : ''}
  <path d="${hollow}" fill="#1b1b1b" stroke="#777" stroke-width="0.05"/>
  <rect x="${-POST / 2}" y="${-(Z1 + 0.05)}" width="${POST}" height="${Z1 + 0.05}" fill="#4f8fd6" fill-opacity="0.8"/>
  <rect x="${-0.65}" y="${-SOCKET}" width="1.3" height="${SOCKET}" fill="#1b1b1b"/>
  <line x1="-11" y1="0" x2="11" y2="0" stroke="#ccc" stroke-width="0.06"/>
  <line x1="-11" y1="${-(Z1 + T)}" x2="11" y2="${-(Z1 + T)}" stroke="#e0a030" stroke-width="0.04" stroke-dasharray="0.3 0.2"/>
  <text x="-10.8" y="${-(Z1 + T) - 0.2}" font-size="0.5" fill="#e0a030">4.5 mm: skirt 3.3 + top 1.2</text>
  ${label(peak, `peak ${peak[1].toFixed(2)}`)}
  ${label(front, `${front[1].toFixed(2)}`, -1.6)}
  ${label(back, `${back[1].toFixed(2)}`, 0.2)}
  <text x="0" y="1.3" font-size="0.7" text-anchor="middle">back ← 18 mm → front · top over the stem at least ${thin.toFixed(2)} mm thick</text>
  <text x="${-W / 2}" y="${-H + 4.1}" font-size="0.55" fill="#aaa">smoothed to within ${p.err.toFixed(2)} mm of the two pictures' traces averaged${p.symmetric ? ', then made the same front and back' : ''}</text>
  <text x="${-W / 2}" y="${-H + 4.8}" font-size="0.55" fill="#aaa">red: first picture · yellow: zoomed screenshot</text>
</g>`
  }).join('\n')
  const VW = PAD + panels.length * (W + PAD), VH = H + PAD + 1
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${VW * s}" height="${VH * s}" viewBox="0 0 ${VW} ${VH}" font-family="Segoe UI, sans-serif" fill="#ddd">
<rect width="100%" height="100%" fill="#202020"/>
${body}
</svg>
`
}

module.exports = { tops, img, mid, profiles, scale, BASE, readPng, smoothest, symmetric }
