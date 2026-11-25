// Keycaps, the keymap and the UV print files for their legends:
//   output/keymap/layout.json          every key on both halves, for the keymap planner
//   output/cases/keycap_cs_*.jscad     the Chicago-style caps, printed on their left face
//   output/cases/keycap_holder.jscad   holds one half's caps, top up, on the eufyMake E1's bed
//   output/keymap/print_left.svg       the legends for one half, true size, laid out on the
//   output/keymap/print_right.svg        holder: the drawing's edges are the holder's edges
//   output/keymap/preview_*.svg        the same on the holder, with each slot's key named
// The plan is keymap/legends.json (edited in the planner, at /keymap in the viewer).

const fs = require('fs')
const path = require('path')
const T = require('./ttf')
const Legends = require('./legends')

const ROOT = path.resolve(__dirname, '..')
const r3 = v => Math.round(v * 1000) / 1000

// the keyboard's rows, in the order the slots are filled
const ORDER = ['matrix_outer_top', 'matrix_pinky_top', 'matrix_ring_top', 'matrix_middle_top', 'matrix_index_top', 'matrix_inner_top',
  'matrix_outer_home', 'matrix_pinky_home', 'matrix_ring_home', 'matrix_middle_home', 'matrix_index_home', 'matrix_inner_home',
  'matrix_outer_bottom', 'matrix_pinky_bottom', 'matrix_ring_bottom', 'matrix_middle_bottom', 'matrix_index_bottom', 'matrix_inner_bottom',
  'mod_outer_thumb', 'mod_pinky_thumb', 'mod_ring_thumb', 'thumbfan_outer_thumb', 'thumbfan_fn_thumb', 'thumbfan_home_thumb']

const capOf = (U, units) => {
  const w = units * U.cap_pitch - U.cap_gap, d = U.cap_pitch - U.cap_gap
  return { units, w, d, top: { w: w - 2 * U.cap_draft, h: d - 2 * U.cap_draft } }
}

// ---------- JSCAD ----------
// A rounded rectangle's outline, n points per corner, counter-clockwise, as JS source
const rrect = (w, h, r, n = 8) => {
  r = Math.max(0.05, Math.min(r, w / 2 - 0.01, h / 2 - 0.01))
  const pts = []
  for (const [cx, cy, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]]) {
    for (let k = 0; k <= n; k++) { const a = (a0 + 90 * k / n) * Math.PI / 180; pts.push([r3(cx + r * Math.cos(a)), r3(cy + r * Math.sin(a))]) }
  }
  return pts
}

const LIB = `
// a solid between two outlines with the same number of points (counter-clockwise), the first
// at height za and the second at zb
function loft(a, za, b, zb) {
  const V = (p, z) => new CSG.Vertex(new CSG.Vector3D(p[0], p[1], z));
  const polys = [
    new CSG.Polygon(a.slice().reverse().map(p => V(p, za))),
    new CSG.Polygon(b.map(p => V(p, zb))),
  ];
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    // two triangles, not a quad: the quad isn't flat where the outlines' corners differ, and
    // CSG cuts go wrong on polygons that aren't flat
    polys.push(new CSG.Polygon([V(a[i], za), V(a[j], za), V(b[j], zb)]));
    polys.push(new CSG.Polygon([V(a[i], za), V(b[j], zb), V(b[i], zb)]));
  }
  return CSG.fromPolygons(polys);
}
`

// ---------- Chicago-style caps ----------
// The side profiles (art/cs_profiles.json): points (y, z) front to back, y from the front (-)
// to the back (+), z up from the bottom of the skirt.
const csProfiles = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'cs_profiles.json'), 'utf8'))
const zOfProfile = pts => y => {
  if (y <= pts[0][0] || y >= pts[pts.length - 1][0]) return 0
  for (let k = 1; k < pts.length; k++) if (pts[k][0] >= y) { const t = (y - pts[k - 1][0]) / ((pts[k][0] - pts[k - 1][0]) || 1); return pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1]) }
  return 0
}

// A polygon for a mesh, without repeated corners; null if there's nothing left of it
const meshPoly = pts => {
  const out = []
  for (const p of pts) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1], p[2] - out[out.length - 1][2]) > 1e-6) out.push(p)
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1], out[0][2] - out[out.length - 1][2]) <= 1e-6) out.pop()
  if (out.length < 3) return null
  const r = out.map(p => p.map(r3))
  const a = r[0], b = r[1], c = r[2]
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]
  return Math.hypot(...n) < 1e-7 ? null : r
}

// The scaffold for a cap printed on its left face (the *_supported files). Everything here is
// in the printing frame (the left face on the bed, z = 0), found by taking points from the cap's
// own frame through the same turn csSource's cap gets. The scaffold is a separate solid that
// touches the cap nowhere:
//   - a thin baseplate on the bed, beside the cap's open end (the skirt's bottom),
//   - from it a column up and a sloping arm into the open end,
//   - the arm splits into a fan of tines that reach into the hollow and stop sup_gap short of
//       (1) the stem post's underside, at the middle of its length, and
//       (2) the hollow's ceiling (the right wall's inside, flat on top when printed), at the
//           middle of its height, high above the post, so the tines pass over it.
// Every sample along every part is checked against the cap, and the build stops if a part
// comes closer than sup_gap, so a support can never be fused to the cap.
const scaffoldSource = (U, cap, { xmin, xmax, ceil, yi, a, say }) => {
  const { turn, lift } = csPrint(U, cap)
  const th = turn * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th)
  const P = ([x, y, z]) => [x * c + z * sn, y, -x * sn + z * c + lift]      // cap frame -> printing frame
  const D = ([x, y, z]) => [x * c + z * sn, y, -x * sn + z * c]              // a direction
  const Q = ([x, y, z]) => [(x - 0) * c - (z - lift) * sn, y, x * sn + (z - lift) * c]   // printing -> cap frame
  const R = U.cap_post_d / 2, gap = U.sup_gap, rTip = U.sup_w / 2, rArm = U.sup_arm_w / 2
  const sub = (p, q) => p.map((v, i) => v - q[i]), add = (p, q) => p.map((v, i) => v + q[i]), mul = (p, k) => p.map(v => v * k)
  const len = v => Math.hypot(...v), unit = v => mul(v, 1 / len(v))
  // where the open end (the skirt's bottom, cap z = 0) is at height z' (x' of that plane's line)
  const openEdge = z => c * (z - lift) / -sn
  const norm = [-1, 0, -a].map(v => v / Math.hypot(1, a))          // ceiling's normal, into the hollow
  const postTop = ceil(0)                                          // the post's visible length
  const segs = []        // { p, q, r0, r1 }: a tapered round bar
  const balls = []       // { p, r }
  const tips = []        // the tine ends, to check the gap
  const jointR = rArm
  const bar = (p, q, r0, r1) => segs.push({ p, q, r0, r1 })
  const xc = [openEdge(0) + U.sup_plate_x, openEdge(0) + U.sup_plate_x + U.sup_col_pitch]   // the columns' x': the post's, the ceiling's
  const tineY = Array.from({ length: U.sup_tines }, (_, i) => (i - (U.sup_tines - 1) / 2) * U.sup_tine_pitch)
  const target = (surf, nrm, zFan, col, what) => {
    // surf: the tine ends' points on the cap's surface; nrm: their outward normals (into the free space)
    const ends = surf.map((s, i) => add(P(s), mul(D(nrm[i]), gap + rTip)))
    const zs = ends.reduce((m, e) => m + e[2], 0) / ends.length
    const zJ = zs - zFan
    const J = [openEdge(zJ) + U.sup_clear + rArm, 0, zJ]
    const top = [xc[col], 0, zJ - U.sup_rise]
    bar([xc[col], 0, U.sup_plate_t / 2], top, rArm, rArm)     // column
    balls.push({ p: top, r: rArm })
    bar(top, J, rArm, rArm * 0.55)                              // arm
    balls.push({ p: J, r: rArm * 0.55 })
    ends.forEach(e => { bar(J, e, rArm * 0.45, rTip); tips.push({ e, what }) })
  }
  // (1) the post's underside: on the cylinder at each fan y, the side facing down when printed
  const zm = postTop / 2
  target(tineY.map(y => [-Math.sqrt(R * R - y * y), y, zm]), tineY.map(y => [-Math.sqrt(R * R - y * y) / R, y / R, 0]), U.sup_fan, 0, 'post')
  // (2) the ceiling: x = xmax(z) at the fan's y, the middle of its height
  const zc = ceil(0) / 2
  target(tineY.map(y => [xmax(zc), y, zc]), tineY.map(() => norm), U.sup_fan, 1, 'ceiling')

  // the baseplate: under both columns, clear of the cap
  const x0 = xc[0] - U.sup_plate_pad, x1 = xc[1] + U.sup_plate_pad, yb = U.sup_plate_w / 2
  const plate = { c: [(x0 + x1) / 2, 0, U.sup_plate_t / 2], r: [(x1 - x0) / 2, yb, U.sup_plate_t / 2] }

  // ---- checks: how far a point of the scaffold is from the cap (the nearest of: the hollow's
  // side walls, front and back walls, ceiling and the post; the wall ends for a point outside
  // the open end). The distances are measured along x, y or z, so they can be a little long on
  // the drafted wall (2%), never short.
  const clearance = pt => {
    const [x, y, z] = Q(pt), zz = Math.max(z, 0)
    const lat = Math.min(x - xmin(zz), xmax(zz) - x, yi - Math.abs(y), Math.hypot(x, y) - R)
    if (z < 0) return lat > 0 ? Math.hypot(lat, z) : -z
    return Math.min(lat, ceil(y) - z)
  }
  let worst = 1e9
  const closest = {}
  for (const sg of segs) {
    const L = len(sub(sg.q, sg.p)), n = Math.max(2, Math.ceil(L / 0.05))
    for (let i = 0; i <= n; i++) {
      const t = i / n, pt = add(sg.p, mul(sub(sg.q, sg.p), t)), r = sg.r0 + (sg.r1 - sg.r0) * t
      const d = clearance(pt) - r
      worst = Math.min(worst, d)
    }
  }
  for (const t of tips) {
    const d = clearance(t.e) - rTip
    closest[t.what] = Math.min(closest[t.what] === undefined ? 1e9 : closest[t.what], d)
  }
  const plateGap = x0 - openEdge(0)           // the cap's open end leans away higher up, so this is the nearest
  const problems = []
  if (worst < gap - 0.01) problems.push(`a support comes within ${worst.toFixed(3)} mm of the cap (needs ${gap})`)
  for (const k of ['post', 'ceiling']) if (!(closest[k] < gap + 0.05)) problems.push(`the ${k} tines are ${closest[k] && closest[k].toFixed(2)} mm from it, not ${gap}`)
  if (plateGap < 1) problems.push(`the baseplate is only ${plateGap.toFixed(2)} mm from the cap`)
  if (problems.length) throw new Error(`supports (${cap.w} mm cap): ${problems.join('; ')}`)
  if (say) say(`supports ${cap.w} mm cap: closest approach ${worst.toFixed(3)} mm, post tines ${closest.post.toFixed(3)} mm and ceiling tines ${closest.ceiling.toFixed(3)} mm off, baseplate ${plateGap.toFixed(1)} mm from the cap, columns ${xc.map(v => v.toFixed(1)).join(' and ')} mm out`)

  const V = v => `[${v.map(r3).join(', ')}]`
  const parts = [
    `CSG.cube({ center: ${V(plate.c)}, radius: ${V(plate.r)} })`,
    ...segs.map(g => `CSG.cylinder({ start: ${V(g.p)}, end: ${V(g.q)}, radiusStart: ${r3(g.r0)}, radiusEnd: ${r3(g.r1)}, resolution: 20 })`),
    ...balls.map(b => `CSG.sphere({ center: ${V(b.p)}, radius: ${r3(b.r)}, resolution: 20 })`),
  ]
  return `
function scaffold() {
  return ${parts.map((p, i) => (i ? '    .union(' + p + ')' : p)).join('\n')};
}
`
}

// A Chicago-style cap: its side profile (points, as above) the same all the way across, the
// left and right faces drafted like the flat cap's (cap_draft over its height, per mm), and
// the top's left and right edges chamfered cap_cs_edge. Inside, a hollow cap_top_t under the
// top (the profile eroded by that much), no higher than cap_skirt, cap_wall in from the sides.
// It prints on its left face, so each layer is the profile. Printed that way, the stem post
// runs sideways and the hollow's right side is a ceiling (a flat overhang: both side walls
// are cap_wall thick, drafted the same). The post sticks out sideways with nothing under it.
// The outside and the hollow are built as meshes of strips across the width (each a flat
// four-sided face between two profile points), which keeps the CSG steps that follow sound.
const csSource = (U, cap, tol, points, { homing = false, supports = false, say = null } = {}) => {
  const a = U.cap_draft / (U.cap_top_t + U.cap_skirt), z1 = U.cap_skirt, c = U.cap_cs_edge
  const S = zOfProfile(points)
  const X = z => cap.w / 2 - a * z                     // the outside's half width at height z
  // (as triangles: rounded to 0.001 mm, a four-sided face is no longer exactly flat, and the
  // CSG steps go wrong on faces that aren't)
  const tris = q => q.slice(1, -1).map((_, i) => meshPoly([q[0], q[i + 1], q[i + 2]])).filter(Boolean)
  const mesh = []
  const push = (...ps) => { for (const p of ps) { const q = meshPoly(p); if (q) mesh.push(...tris(q)) } }
  // the outside: for each profile point, the top's edge (I), the chamfer's foot on the side
  // face (O) and the bottom (B), right (+x) and left. The profile's ends, where it's lower than
  // twice the chamfer (it drops nearly straight down there), are left off: the ends are
  // straight walls up to it instead, and the chamfer is the same all the way along
  const first = points.findIndex(p => p[1] >= 2 * c), last = points.length - 1 - points.slice().reverse().findIndex(p => p[1] >= 2 * c)
  const ring = points.slice(first, last + 1).map(([y, z]) => {
    const ck = c
    return { IR: [X(z) - ck, y, z], IL: [-(X(z) - ck), y, z], OR: [X(z - ck), y, z - ck], OL: [-X(z - ck), y, z - ck], BR: [X(0), y, 0], BL: [-X(0), y, 0] }
  })
  for (let k = 0; k + 1 < ring.length; k++) {
    const p = ring[k], q = ring[k + 1]
    push([p.IL, p.IR, q.IR, q.IL],                                   // top
      [p.OR, q.OR, q.IR], [p.OR, q.IR, p.IR],                        // right chamfer
      [p.BR, q.BR, q.OR, p.OR],                                      // right face
      [q.IL, q.OL, p.OL], [p.IL, q.IL, p.OL],                        // left chamfer
      [p.OL, q.OL, q.BL, p.BL],                                      // left face
      [p.BL, q.BL, q.BR, p.BR])                                      // bottom
  }
  for (const [r, back] of [[ring[0], false], [ring[ring.length - 1], true]]) {   // the ends, if they stand up
    const wall = [r.BL, r.BR, r.OR, r.IR, r.IL, r.OL]
    push(back ? wall.slice().reverse() : wall)
  }
  // the hollow: its ceiling C(y) = min(skirt, the profile eroded by cap_top_t), from the
  // bottom (and 0.5 below it) up; both sides drafted
  const T = U.cap_top_t, yi = cap.d / 2 - U.cap_wall
  const ceil = y => {
    if (Math.abs(y) > yi) return 0
    let m = z1
    for (let u = -T; u <= T + 1e-9; u += 0.05) m = Math.min(m, S(y + u) - Math.sqrt(Math.max(0, T * T - u * u)))
    return Math.max(0, m)
  }
  const xi0 = cap.w / 2 - U.cap_wall
  const xmin = z => -(xi0 - a * z), xmax = z => xi0 - a * z      // both sides drafted, cap_wall thick
  let ys = []
  for (let y = -yi; y <= yi + 1e-9; y += 0.2) ys.push(y)
  // only the stretch round the middle where there's room, closed at C = 0 at its ends
  let lo = ys.findIndex(y => ceil(y) > 0.02), hi = ys.length - 1 - ys.slice().reverse().findIndex(y => ceil(y) > 0.02)
  ys = ys.slice(Math.max(0, lo - 1), hi + 2)
  const hol = ys.map((y, k) => {
    const C = k === 0 || k === ys.length - 1 ? 0 : ceil(y)
    return { TL: [xmin(C), y, C], TR: [xmax(C), y, C], BL: [xmin(-0.5), y, -0.5], BR: [xmax(-0.5), y, -0.5] }
  })
  const cav = []
  const pushC = (...ps) => { for (const p of ps) { const q = meshPoly(p); if (q) cav.push(...tris(q)) } }
  for (let k = 0; k + 1 < hol.length; k++) {
    const p = hol[k], q = hol[k + 1]
    pushC([p.TL, p.TR, q.TR, q.TL], [p.BR, q.BR, q.TR, p.TR], [p.TL, q.TL, q.BL, p.BL], [p.BL, q.BL, q.BR, p.BR])
  }
  pushC([hol[0].BL, hol[0].BR, hol[0].TR, hol[0].TL], [hol[hol.length - 1].TL, hol[hol.length - 1].TR, hol[hol.length - 1].BR, hol[hol.length - 1].BL])
  // Built-in supports (the *_supported files): a scaffold beside the cap, a separate solid that
  // touches the cap nowhere (see scaffoldSource).
  const scaffold = supports ? scaffoldSource(U, cap, { xmin, xmax, ceil, yi, a, say }) : ''
  const cl = U.cap_cross + tol, cw = U.cap_cross_w + tol
  // homing: a rounded bar across the face, standing cap_cs_homing_bump proud of it
  const hr = U.cap_homing_r, hy = -cap.d / 2 + U.cap_draft + U.cap_homing_in, hz = S(hy) + U.cap_cs_homing_bump - hr
  const { turn, lift } = csPrint(U, cap)
  const solid = polys => `CSG.fromPolygons(${JSON.stringify(polys)}.map(p => new CSG.Polygon(p.map(v => new CSG.Vertex(new CSG.Vector3D(v[0], v[1], v[2]))))))`
  return `
function cap() {
  const body = ${solid(mesh)};
  const hollow = ${solid(cav)};
  const post = CSG.cylinder({ start: [0, 0, 0], end: [0, 0, ${r3(z1 + 0.3)}], radius: ${U.cap_post_d / 2}, resolution: 48 });
  const socket = CSG.cube({ center: [0, 0, ${r3((U.cap_socket - 0.5) / 2)}], radius: [${r3(cl / 2)}, ${r3(cw / 2)}, ${r3((U.cap_socket + 0.5) / 2)}] })
    .union(CSG.cube({ center: [0, 0, ${r3((U.cap_socket - 0.5) / 2)}], radius: [${r3(cw / 2)}, ${r3(cl / 2)}, ${r3((U.cap_socket + 0.5) / 2)}] }));
  // everything taken out of the outside, as one cut: the hollow (less the post, which stays)
  // and the socket. (Cut one at a time, the CSG steps leave holes.)
  const cut = hollow.subtract(post).union(socket);
  let cap = ${homing ? `body.union(CSG.roundedCylinder({ start: [${r3(-U.cap_homing_len / 2 + hr)}, ${r3(hy)}, ${r3(hz)}], end: [${r3(U.cap_homing_len / 2 - hr)}, ${r3(hy)}, ${r3(hz)}], radius: ${hr}, resolution: 32 }))` : 'body'}.subtract(cut);
  // laid on its left face for printing
  return cap.rotateY(${turn}).translate([0, 0, ${lift}]).fixTJunctions()${scaffold ? '.union(scaffold())' : ''};
}
${scaffold}
`
}

// How a Chicago-style cap is laid for printing: turned about y until its left face (the
// plane x = -(w/2 - a z), a its draft per mm) is flat, then lifted so that face is on the bed.
// That face is w/2 / sqrt(1 + a^2) from the origin, which the turn puts straight below it.
const csPrint = (U, cap) => {
  const a = U.cap_draft / (U.cap_top_t + U.cap_skirt)
  return { turn: Math.atan(1 / a) * 180 / Math.PI - 180, lift: cap.w / 2 / Math.sqrt(1 + a * a) }
}

// Which Chicago-style cap a key takes: the top row's cap on the top and bottom rows (turned
// round on the bottom row), the 1.5u thumb cap on a 1.5u key, the home cap everywhere else;
// F and J (the index fingers' home keys) have the homing bump.
const csKind = (id, units) => ({
  cap: id.endsWith('_top') || id.endsWith('_bottom') ? 'top' : units === 1.5 ? 'thumb' : 'home',
  turned: id.endsWith('_bottom'),
  homing: id === 'matrix_index_home',
})

// A Chicago-style cap's face seen from above, for the keymap planner (mm, x across, y from the
// front, -, to the back, +): its outline (the top between the left and right chamfers, as far
// down the profile as the cap is built), and the parts of it no steeper than
// cap_cs_print_slope, where a UV-printed legend lands true. Steeper, the print is stretched.
const csFace = (U, cap, points) => {
  const a = U.cap_draft / (U.cap_top_t + U.cap_skirt), c = U.cap_cs_edge
  const ring = points.filter(p => p[1] >= 2 * c)
  const side = pts => [...pts.map(([y, z]) => [cap.w / 2 - a * z - c, y]), ...pts.slice().reverse().map(([y, z]) => [-(cap.w / 2 - a * z - c), y])].map(p => p.map(r3))
  const limit = Math.tan(U.cap_cs_print_slope * Math.PI / 180)
  const flat = []
  let run = []
  ring.forEach((p, i) => {
    const q = ring[Math.max(0, i - 1)], s = ring[Math.min(ring.length - 1, i + 1)]
    const slope = Math.abs((s[1] - q[1]) / ((s[0] - q[0]) || 1e-9))
    if (slope <= limit) run.push(p)
    else { if (run.length > 1) flat.push(side(run)); run = [] }
  })
  if (run.length > 1) flat.push(side(run))
  return { outline: side(ring), flat }
}

// ---------- 4 x 4 transforms (for the assembled view) ----------
// Row-major, acting on column vectors; angles in degrees, right-handed.
const M4 = {
  mul: (...ms) => ms.reduce((A, B) => A.map((row, i) => row.map((_, j) => row.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)))),
  T: (x, y, z) => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]],
  R: (axis, deg) => {
    const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t)
    return { x: [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]], y: [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]], z: [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] }[axis]
  },
  // column-major, rounded, as three.js's Matrix4.fromArray wants it
  out: M => [0, 1, 2, 3].flatMap(j => [0, 1, 2, 3].map(i => Math.round(M[i][j] * 1e5) / 1e5)),
}

// Each cap file's copies on the keys of both halves, for the viewer's assembled view: for
// each STL, the transforms that take it from where it prints to where it sits on a key. A
// cap stands on its switch with the bottom of its skirt cap_seat above the plate's top. The
// Chicago caps print on their left face (csPrint). F and J (the index fingers' home
// keys) take the homing cap; the bottom row takes the top row's cap turned round.
const assembledCaps = (U, P, dx) => {
  const seat = U.plate_z + U.frame_t + U.plate_t + U.cap_seat
  const csUp = units => { const { turn, lift } = csPrint(U, capOf(U, units)); return M4.mul(M4.R('y', -turn), M4.T(0, 0, -lift)) }
  const out = {}
  const add = (file, M) => (out[`cases/${file}.stl`] = out[`cases/${file}.stl`] || []).push(M4.out(M))
  for (const half of ['left', 'right']) for (const id of ORDER) {
    const p = P[id]
    if (!p) continue
    const units = Math.round(p.meta.width / U.kx * 4) / 4
    const K = M4.mul(M4.T(half === 'left' ? p.x : dx - p.x, p.y, seat), M4.R('z', half === 'left' ? p.r : -p.r))
    const kind = csKind(id, units)
    const cs = kind.cap === 'top' ? 'keycap_cs_top_1u' : kind.homing ? 'keycap_cs_home_1u_homing' : kind.cap === 'thumb' ? 'keycap_cs_thumb_1_5u' : 'keycap_cs_home_1u'
    add(cs, M4.mul(K, kind.turned ? M4.R('z', 180) : M4.T(0, 0, 0), csUp(units)))
  }
  const placed = Object.fromEntries(Object.entries(out).map(([f, ms]) => [f, { instances: ms }]))
  for (const f of Object.keys(out)) placed[f.replace(/\.stl$/, '_supported.stl')] = { hidden: true }   // the print-only copies with supports
  return placed
}

// ---------- holder ----------
// Slots for one half's caps, filled in keyboard order, holder_cols 1u slots to a row (a 1.5u
// cap takes 1.5 slots). Holder coordinates: mm, origin at its top-left corner, y down.
const holderLayout = (U, keys) => {
  const p = U.holder_pitch, rowW = U.holder_cols * p
  const slots = []
  let x = 0, row = 0
  for (const k of keys) {
    const w = k.units * p
    if (x + w > rowW + 1e-6) { row++; x = 0 }
    slots.push({ ...k, cx: U.holder_margin + x + w / 2, cy: U.holder_margin + row * p + p / 2 })
    x += w
  }
  return { slots, W: 2 * U.holder_margin + rowW, H: 2 * U.holder_margin + (row + 1) * p }
}

const holderSource = (U, layout) => {
  const t = U.holder_floor + U.holder_pocket, c = U.holder_clear
  const pockets = layout.slots.map(s => {
    const cap = capOf(U, s.units)
    return `loft(${JSON.stringify(rrect(cap.w + 2 * c, cap.d + 2 * c, U.cap_r_bottom + c))}, ${U.holder_floor}, ${JSON.stringify(rrect(cap.w + 2 * c, cap.d + 2 * c, U.cap_r_bottom + c))}, ${t + 1}).translate([${r3(s.cx)}, ${r3(-s.cy)}, 0])`
  })
  // the top-left corner is cut off, so the holder (and the print file, whose top-left it
  // is) can only go one way round
  return `function main() {
  const plate = CSG.cube({ corner1: [0, ${-layout.H}, 0], corner2: [${layout.W}, 0, ${t}] });
  const corner = CSG.cube({ center: [0, 0, ${t / 2}], radius: [5, 5, ${t}] }).rotateZ(45);
  return plate.subtract(corner).subtract([
    ${pockets.join(',\n    ')}
  ]);
}
`
}

// ---------- legends ----------
// symbols (from the symbol font) are drawn larger and bolder than the font has them:
// style.symbol.scale times the size, fattened by style.symbol.weight mm all round, and any in
// style.symbol.stretch widened by that factor (e.g. { "⌃": 1.5 })
const symbolStyle = style => ({ scale: 1.4, weight: 0.07, stretch: {}, ...(style.symbol || {}) })

// Font Awesome Free (keymap/fonts/fontawesome/: the fonts, the icon list and the licence).
// style.icons.scale: an icon's em square in cap heights.
const FA = path.join(ROOT, 'keymap', 'fonts', 'fontawesome')
let iconSet = null
const iconsOf = style => {
  if (!iconSet) {
    const list = path.join(FA, 'icons.yml')
    if (!fs.existsSync(list)) iconSet = { codes: {}, list: [] }
    else {
      const EG = fs.realpathSync(path.join(ROOT, 'node_modules', 'ergogen', 'src'))
      const yaml = require('module').createRequire(path.join(EG, 'cli.js'))('js-yaml')
      const raw = yaml.load(fs.readFileSync(list, 'utf8'))
      const codes = {}, out = []
      for (const [name, v] of Object.entries(raw)) {
        if (!v || !v.unicode || !v.styles) continue
        codes[name] = { unicode: v.unicode, styles: v.styles }
        out.push({ n: name, u: v.unicode, s: v.styles, l: v.label || name, t: ((v.search && v.search.terms) || []).join(' ') })
      }
      iconSet = { codes, list: out }
    }
  }
  const fonts = {}
  for (const [s, f] of [['solid', 'fa-solid-900.ttf'], ['regular', 'fa-regular-400.ttf'], ['brands', 'fa-brands-400.ttf']]) if (fs.existsSync(path.join(FA, f))) fonts[s] = path.join(FA, f)
  return { fonts, codes: iconSet.codes, scale: (style.icons && style.icons.scale) || 1.3, list: iconSet.list }
}

const runOf = (style, text, size) => T.run(text, { font: style.font, fallback: style.symbolFont, size, symScale: symbolStyle(style).scale, stretch: symbolStyle(style).stretch, icons: iconsOf(style) })
const measureWith = style => (text, size) => runOf(style, text, size).width

// SVG for one cap's legends, centred on (cx, cy). A symbol is made bolder by drawing it again
// shifted a little each way: plain filled shapes, which any printer software renders the
// same (a stroke might not survive).
const legendSvg = (km, legends, top, cx, cy, rot = 0) => {
  const measure = measureWith(km.style)
  const wt = symbolStyle(km.style).weight
  const shifts = wt > 0 ? [[0, 0], ...Array.from({ length: 8 }, (_, i) => [wt * Math.cos(i * Math.PI / 4), wt * Math.sin(i * Math.PI / 4)])] : [[0, 0]]
  return Legends.place(legends, top, km.style, km.layers, measure).map(l => {
    const r = runOf(km.style, l.text, l.size)
    const dx = l.anchor === 'start' ? 0 : l.anchor === 'middle' ? -r.width / 2 : -r.width
    const at = `translate(${r3(cx)} ${r3(cy)}) rotate(${r3(rot)}) translate(${r3(l.x + dx)} ${r3(l.y)})`
    const parts = []
    if (r.d) parts.push(`<path transform="${at}" d="${r.d}" fill="${l.color}"/>`)
    if (r.dSym) parts.push(`<g transform="${at}" fill="${l.color}">${shifts.map(([sx, sy]) => `<path transform="translate(${r3(sx)} ${r3(sy)})" d="${r.dSym}"/>`).join('')}</g>`)
    return parts.join('\n')
  }).join('\n')
}

const svgDoc = (W, H, body, bg) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}mm" height="${r3(H)}mm" viewBox="0 0 ${r3(W)} ${r3(H)}">
${bg ? `<rect width="100%" height="100%" fill="${bg}"/>\n` : ''}${body}
</svg>
`

// ---------- main ----------
const build = ({ results, right, U, put, say, dx }) => {
  const P = results.points
  const kmFile = path.join(ROOT, 'keymap', 'legends.json')
  const km = JSON.parse(fs.readFileSync(kmFile, 'utf8'))
  // Fonts the machine doesn't have (the plan names Windows fonts; a Linux build server has none)
  // are swapped for the open DejaVu fonts kept in the repo, so the build still runs there.
  const FALLBACK = path.join(ROOT, 'keymap', 'fonts', 'fallback')
  for (const [key, alt] of [['font', 'DejaVuSans-Bold.ttf'], ['symbolFont', 'DejaVuSans.ttf']]) {
    if (!fs.existsSync(km.style[key])) {
      say(`keymap warning: font not found: ${km.style[key]}, using ${alt}`)
      km.style[key] = path.join(FALLBACK, alt)
    }
  }

  // every key on both halves, for the planner: the right half mirrored and moved across, as
  // in the assembled view
  const keys = []
  for (const half of ['left', 'right']) {
    for (const id of ORDER) {
      const p = P[id]
      if (!p) { say(`keymap warning: no key ${id}`); continue }
      const units = Math.round(p.meta.width / U.kx * 4) / 4
      const kind = csKind(id, units)
      keys.push({ half, id, units, x: half === 'left' ? p.x : dx - p.x, y: p.y, r: half === 'left' ? p.r : -p.r, cs: kind.cap, turned: kind.turned })
    }
    for (const id of Object.keys(P)) if (!ORDER.includes(id)) say(`keymap warning: key ${id} isn't in the keymap order`)
  }
  put('keymap/layout.json', JSON.stringify({
    // which characters the text font has: the planner draws the rest as symbols, like the print
    textFont: fs.existsSync(km.style.font) ? T.open(km.style.font).ranges() : [],
    symbolBlocks: T.SYMBOL_BLOCKS,
    cap: { pitch: U.cap_pitch, gap: U.cap_gap, draft: U.cap_draft },
    caps: Object.fromEntries([1, 1.5].map(u => [u, capOf(U, u)])),
    // the Chicago-style caps' faces from above (csFace), and the slope past which they're shaded
    cs: (() => { const pr = csProfiles(); return { slope: U.cap_cs_print_slope, top: csFace(U, capOf(U, 1), pr.top), home: csFace(U, capOf(U, 1), pr.home), thumb: csFace(U, capOf(U, 1.5), pr.home) } })(),
    keys,
  }, null, 2))
  for (const half of ['left', 'right']) for (const id of ORDER) if (!km.keys[half] || !km.keys[half][id]) say(`keymap warning: no legends for ${half} ${id}`)

  // the icons, for the planner's search; and any icon names in the plan the list doesn't have
  const icons = iconsOf(km.style)
  put('keymap/icons.json', JSON.stringify({ scale: icons.scale, styles: Object.keys(icons.fonts), icons: icons.list }))
  for (const half of ['left', 'right']) for (const [id, v] of Object.entries(km.keys[half] || {})) {
    for (const [layer, text] of Object.entries(v)) {
      for (const p of Legends.pieces(text)) if (p.icon && !icons.codes[p.icon]) say(`keymap warning: no icon "${p.icon}" (${half} ${id} ${layer})`)
    }
  }

  // keycaps
  // Chicago-style caps: the top row's (turned round, also the bottom row's), the home row's
  // (also the 1u thumb keys'), the home row's with a homing groove, and the 1.5u thumb key in
  // the home row's profile
  const prof = csProfiles()
  const capCs = (name, units, points, opts) => {
    put(`cases/keycap_cs_${name}.jscad`, LIB + csSource(U, capOf(U, units), U.cap_stem_tol, points, opts) + 'function main() { return cap(); }\n')
    // the same with built-in supports, for printing: its own file, the plain cap left as it is
    put(`cases/keycap_cs_${name}_supported.jscad`, LIB + csSource(U, capOf(U, units), U.cap_stem_tol, points, { ...opts, supports: true, say: l => say(`${name}: ${l}`) }) + 'function main() { return cap(); }\n')
  }
  capCs('top_1u', 1, prof.top)
  capCs('home_1u', 1, prof.home)
  capCs('home_1u_homing', 1, prof.home, { homing: true })
  capCs('thumb_1_5u', 1.5, prof.home)

  // holder: the same for both halves (each has 23 1u caps and one 1.5u)
  const perHalf = half => keys.filter(k => k.half === half)
  const holder = holderLayout(U, perHalf('left'))
  put('cases/keycap_holder.jscad', LIB + holderSource(U, holder))

  // print files, one per half, true size: the drawing is exactly the holder
  for (const half of ['left', 'right']) {
    const { slots, W, H } = holderLayout(U, perHalf(half))
    // a key whose top is a layer's colour gets the whole top filled with it, under its legends
    const fillOf = (s, top) => {
      const f = Legends.capFill(km.keys[half][s.id], km.style, km.layers)
      return `<rect x="${r3(s.cx - top.w / 2)}" y="${r3(s.cy - top.h / 2)}" width="${r3(top.w)}" height="${r3(top.h)}" rx="${U.cap_r_top}" fill="${f.color}"/>`
    }
    const body = slots.map(s => {
      const top = capOf(U, s.units).top
      return (Legends.capFill(km.keys[half][s.id], km.style, km.layers).tinted ? fillOf(s, top) + '\n' : '') + legendSvg(km, km.keys[half][s.id], top, s.cx, s.cy)
    }).join('\n')
    put(`keymap/print_${half}.svg`, svgDoc(W, H, body))
    // preview: the holder, the caps' tops and which key each slot is
    const c = U.holder_clear
    const prev = [`<path d="M7.07 0H${W}V${H}H0V7.07Z" fill="#d9d4c7" stroke="#999" stroke-width="0.3"/>`]
    for (const s of slots) {
      const cap = capOf(U, s.units)
      prev.push(`<rect x="${r3(s.cx - cap.w / 2 - c)}" y="${r3(s.cy - cap.d / 2 - c)}" width="${r3(cap.w + 2 * c)}" height="${r3(cap.d + 2 * c)}" rx="${U.cap_r_bottom + c}" fill="#bdb6a6"/>`)
      prev.push(fillOf(s, cap.top))
      prev.push(legendSvg(km, km.keys[half][s.id], cap.top, s.cx, s.cy))
      prev.push(`<text x="${r3(s.cx)}" y="${r3(s.cy + cap.d / 2 + 1.7)}" font-size="1.3" font-family="sans-serif" text-anchor="middle" fill="#555">${s.id.replace(/^matrix_|_thumb$/g, '')}</text>`)
    }
    put(`keymap/preview_${half}.svg`, svgDoc(W, H, prev.join('\n')))
  }
  say(`keymap: ${keys.length} keys, holder ${r3(holder.W)} x ${r3(holder.H)} mm`)
  return { holder, assembled: assembledCaps(U, P, dx) }
}

module.exports = { build, capOf, ORDER }
