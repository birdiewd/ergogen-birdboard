// Closes the cracks the CSG steps leave in a keycap's mesh, on the STL OpenJSCAD writes. The
// cuts split faces one at a time, so a point where two faces meet can come out a little
// different on each (up to about 0.001 mm), and a face can keep an edge that a neighbour has
// split (a T-junction). A slicer sees both as open edges. Here:
//   1. points within TOL of each other become one (the first of them: nothing moves further),
//   2. triangles left with a repeated corner go, and so do slivers (a corner within TOL of the
//      opposite, longest edge: the neighbour on that edge is split at that corner in step 3,
//      so nothing opens),
//   3. a triangle with another point on one of its edges (within TOL) is split there, in a fan
//      from its middle (a fan from a corner would make flat triangles where a point sits on an
//      edge next to that corner),
//   4. triangles with no area go,
//   5. faces doubled back on themselves (a sheet of no thickness inside a wall) go in pairs,
//   6. any hole left (a ring of open edges) is filled.
// The keycaps come out with every edge shared by exactly two triangles. (The cases and plates
// aren't run through it: see isKeycap.) Reads ASCII or binary STL; writes binary.
const fs = require('fs')

const TOL = 0.001

const readStl = buf => {
  const tris = []
  if (buf.toString('utf8', 0, 5) === 'solid' && buf.toString('utf8', 0, Math.min(buf.length, 2000)).includes('facet')) {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g
    const s = buf.toString()
    let m, v = []
    while ((m = re.exec(s))) { v.push([+m[1], +m[2], +m[3]]); if (v.length === 3) { tris.push(v); v = [] } }
  } else {
    const n = buf.readUInt32LE(80)
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; tris.push([0, 1, 2].map(k => [0, 1, 2].map(j => buf.readFloatLE(o + k * 12 + j * 4)))) }
  }
  return tris
}

const writeStl = (tris, pts) => {
  const buf = Buffer.alloc(84 + tris.length * 50)
  buf.write('repaired by viewer/stl-repair.js', 0)
  buf.writeUInt32LE(tris.length, 80)
  tris.forEach((t, i) => {
    const [a, b, c] = t.map(k => pts[k])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1
    const o = 84 + i * 50
    n.forEach((x, j) => buf.writeFloatLE(x / l, o + j * 4))
    ;[a, b, c].forEach((p, k) => p.forEach((x, j) => buf.writeFloatLE(x, o + 12 + k * 12 + j * 4)))
  })
  return buf
}

const repair = raw => {
  // 1. weld, with a hash grid of TOL cells
  const pts = [], grid = new Map(), cell = x => Math.floor(x / TOL)
  const idOf = p => {
    const [cx, cy, cz] = p.map(cell)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
      if (list) for (const k of list) { const q = pts[k]; if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= TOL) return k }
    }
    const k = pts.push(p) - 1, key = `${cx},${cy},${cz}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(k)
    return k
  }
  // 2. no repeated corners, and no slivers: a triangle whose corner opposite its longest edge
  // is within TOL of that edge has no real width (its neighbour on that edge gets split at
  // that corner in step 3, which closes it up)
  const sliver = t => {
    const P = t.map(k => pts[k]), len = i => Math.hypot(...[0, 1, 2].map(j => P[(i + 1) % 3][j] - P[i][j]))
    const L = [0, 1, 2].map(len), i = L.indexOf(Math.max(...L)), A = P[i], B = P[(i + 1) % 3], C0 = P[(i + 2) % 3]
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C0[0] - A[0], C0[1] - A[1], C0[2] - A[2]]
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / L[i] <= TOL
  }
  let tris = raw.map(t => t.map(idOf)).filter(([a, b, c]) => a !== b && b !== c && c !== a).filter(t => !sliver(t))
  const slivers = raw.length - tris.length

  // 3. split at points lying on an edge: points bucketed in coarse cells, each edge checked
  // against the points in the cells its box covers
  const C = 0.5, buckets = new Map(), ck = (x, y, z) => `${x},${y},${z}`
  pts.forEach((p, k) => { const key = ck(...p.map(v => Math.floor(v / C))); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(k) })
  const onEdge = (a, b) => {
    const A = pts[a], B = pts[b], d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2
    const lo = [0, 1, 2].map(i => Math.floor((Math.min(A[i], B[i]) - TOL) / C)), hi = [0, 1, 2].map(i => Math.floor((Math.max(A[i], B[i]) + TOL) / C))
    const found = []
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const list = buckets.get(ck(x, y, z))
      if (list) for (const k of list) {
        if (k === a || k === b) continue
        const P = pts[k], w = [P[0] - A[0], P[1] - A[1], P[2] - A[2]]
        const t = (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / L2
        if (t <= 0 || t >= 1) continue
        const e = [w[0] - t * d[0], w[1] - t * d[1], w[2] - t * d[2]]
        if (Math.hypot(...e) <= TOL) found.push([t, k])
      }
    }
    return found.sort((p, q) => p[0] - q[0]).map(f => f[1])
  }
  const edgeCache = new Map()
  const edgePts = (a, b) => {
    const key = a < b ? a + '_' + b : b + '_' + a
    if (!edgeCache.has(key)) edgeCache.set(key, onEdge(Math.min(a, b), Math.max(a, b)))
    const r = edgeCache.get(key)
    return a < b ? r : r.slice().reverse()
  }
  let split = 0
  const out = []
  for (const [a, b, c] of tris) {
    const ring = [a, ...edgePts(a, b), b, ...edgePts(b, c), c, ...edgePts(c, a)]
    if (ring.length === 3) { out.push([a, b, c]); continue }
    split++
    const P = [a, b, c].map(k => pts[k]), m = pts.push([0, 1, 2].map(i => (P[0][i] + P[1][i] + P[2][i]) / 3)) - 1
    for (let i = 0; i < ring.length; i++) out.push([m, ring[i], ring[(i + 1) % ring.length]])
  }

  // 4. no area
  const area2 = ([a, b, c]) => {
    const A = pts[a], B = pts[b], Cc = pts[c], u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]]
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
  }
  const kept = out.filter(t => area2(t) > 1e-10)
  // 5. faces doubled back on themselves (the same corners, wound both ways: a sheet of no
  // thickness the cuts can leave inside a wall) go in pairs; a face repeated the same way is
  // kept once
  const seen = new Map()
  kept.forEach((t, i) => {
    const s = t.slice().sort((p, q) => p - q).join('_')
    const r = Math.min(...t), j = t.indexOf(r), w = [t[j], t[(j + 1) % 3], t[(j + 2) % 3]].join('_')
    if (!seen.has(s)) seen.set(s, [])
    seen.get(s).push({ i, w })
  })
  const drop = new Set()
  for (const list of seen.values()) {
    if (list.length < 2) continue
    const byW = new Map()
    for (const f of list) { if (!byW.has(f.w)) byW.set(f.w, []); byW.get(f.w).push(f.i) }
    const groups = [...byW.values()]
    if (groups.length === 1) groups[0].slice(1).forEach(i => drop.add(i))          // the same way: keep one
    else { const [g0, g1] = groups, n = Math.min(g0.length, g1.length); g0.slice(0, n).concat(g1.slice(0, n)).forEach(i => drop.add(i)); [g0.slice(n), g1.slice(n)].forEach(g => g.slice(1).forEach(i => drop.add(i))) }
  }
  const final = kept.filter((_, i) => !drop.has(i))

  // 6. holes left (the cuts merge a flat face's pieces into one polygon and split it again,
  // sometimes skipping points on its edge, which leaves a thin gap between a chord and the
  // points it skipped): each ring of open edges is filled, by ear clipping in its own plane
  const half = new Map()
  for (const [a, b, c] of final) for (const [p, q] of [[a, b], [b, c], [c, a]]) half.set(p + '_' + q, [p, q])
  const next = new Map()
  for (const [k, [p, q]] of half) if (!half.has(q + '_' + p)) { if (!next.has(p)) next.set(p, []); next.get(p).push(q) }
  let holes = 0
  const fill = ring => {
    // Newell normal, then project to its plane and clip ears
    const n = [0, 0, 0]
    ring.forEach((k, i) => { const p = pts[k], q = pts[ring[(i + 1) % ring.length]]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]) })
    const ax = n.map(Math.abs), drop = ax.indexOf(Math.max(...ax)), [u, v] = [0, 1, 2].filter(i => i !== drop), sgn = Math.sign(n[drop]) || 1
    const P = k => [pts[k][u], pts[k][v]]
    const cross = (o, a, b) => ((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])) * sgn
    const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0
    const r = ring.slice()
    let guard = r.length * r.length
    while (r.length > 3 && guard-- > 0) {
      let cut = false
      for (let i = 0; i < r.length; i++) {
        const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length]
        if (cross(P(a), P(b), P(c)) <= 0) continue
        if (r.some(k => k !== a && k !== b && k !== c && inTri(P(k), P(a), P(b), P(c)))) continue
        final.push([a, b, c]); r.splice(i, 1); cut = true; break
      }
      if (!cut) break
    }
    if (r.length === 3) final.push([r[0], r[1], r[2]])
    else { const m = pts.push([0, 1, 2].map(i => r.reduce((s, k) => s + pts[k][i], 0) / r.length)) - 1; r.forEach((k, i) => final.push([m, k, r[(i + 1) % r.length]])) }
  }
  for (const start of [...next.keys()]) {
    while (next.has(start) && next.get(start).length) {
      // walk the open edges from start until back at it; the hole's ring runs the other way
      const ring = [start]
      let cur = start
      for (let guard = 0; guard < 100000; guard++) {
        const list = next.get(cur)
        if (!list || !list.length) break
        const nx = list.pop(); if (!list.length) next.delete(cur)
        if (nx === start) { holes++; fill(ring.slice().reverse()); break }
        ring.push(nx); cur = nx
      }
      if (cur !== start && !ring.length) break
    }
  }
  return { tris: final, pts, stats: { welded: raw.length * 3 - pts.length, slivers, split, flat: out.length - kept.length, doubled: drop.size, holes } }
}

// open edges (used by exactly one triangle) in the result, as a check
const openEdges = tris => {
  const cnt = new Map()
  for (const t of tris) for (let i = 0; i < 3; i++) {
    const a = t[i], b = t[(i + 1) % 3], e = a < b ? a + '_' + b : b + '_' + a
    cnt.set(e, (cnt.get(e) || 0) + 1)
  }
  let open = 0
  for (const c of cnt.values()) if (c === 1) open++
  return open
}

const repairFile = (src, dst = src) => {
  const raw = readStl(fs.readFileSync(src))
  const { tris, pts, stats } = repair(raw)
  fs.writeFileSync(dst, writeStl(tris, pts))
  return { ...stats, open: openEdges(tris), triangles: tris.length }
}

// the files it's for: the keycaps (the cases and plates are left as OpenJSCAD writes them)
const isKeycap = file => /^keycap_cs_.*\.stl$/i.test(require('path').basename(file))

module.exports = { repairFile, isKeycap }

if (require.main === module) for (const f of process.argv.slice(2)) console.log(f, JSON.stringify(repairFile(f, f.replace(/\.stl$/i, '.repaired.stl'))))
