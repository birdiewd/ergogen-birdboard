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
// The 1.5u thumb cap's top across its width (art/cs_thumb_curve.json): its height as a share
// of the side profile's, from the round end (t = 0) to the plain end (t = 1)
const csThumbCurve = () => monotoneCurve(JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'cs_thumb_curve.json'), 'utf8')).points)
// A smooth curve through points [t, f] (t increasing) that never overshoots between them: a
// monotone cubic (Fritsch-Carlson)
const monotoneCurve = pts => {
  const n = pts.length, h = [], d = []
  for (let i = 0; i + 1 < n; i++) { h[i] = pts[i + 1][0] - pts[i][0]; d[i] = (pts[i + 1][1] - pts[i][1]) / h[i] }
  const m = pts.map((_, i) => i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  for (let i = 0; i + 1 < n; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue }
    const p = m[i] / d[i], q = m[i + 1] / d[i], s = p * p + q * q
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * p * d[i]; m[i + 1] = k * q * d[i] }
  }
  return t => {
    if (t <= pts[0][0]) return pts[0][1]
    if (t >= pts[n - 1][0]) return pts[n - 1][1]
    let i = 0
    while (t > pts[i + 1][0]) i++
    const s = (t - pts[i][0]) / h[i], s2 = s * s, s3 = s2 * s
    return (2 * s3 - 3 * s2 + 1) * pts[i][1] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * pts[i + 1][1] + (s3 - s2) * h[i] * m[i + 1]
  }
}
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
//   - from it a straight strut for each fan, leaning in over the cap (sup_lean from the vertical),
//   - the arm splits into a fan of tines, in a vertical plane (standing up from the baseplate), that reach into the hollow and stop sup_gap short of
//       (1) the stem post's underside, at the middle of its length and each side of it, and
//       (2) the hollow's ceiling (the right wall's inside, flat on top when printed), at the
//           middle of its height, high above the post, so the tines pass over it.
// Every sample along every part is checked against the cap, and the build stops if a part
// comes closer than sup_gap, so a support can never be fused to the cap.
// With ceilXY (a cap whose top sweeps down across it, csSource's across), the ceiling varies
// across as well: the ceiling tines go to its sloping part on the right (xRight: the hollow's
// furthest point right at a height), with the slope's normal, and the checks measure to it.
const scaffoldSource = (U, cap, { xmin, xmax, ceil, yi, a, say, ceilXY = null, xRight = null }) => {
  const { turn, lift } = csPrint(U, cap)
  const th = turn * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th)
  const P = ([x, y, z]) => [x * c + z * sn, y, -x * sn + z * c + lift]      // cap frame -> printing frame
  const D = ([x, y, z]) => [x * c + z * sn, y, -x * sn + z * c]              // a direction
  const Q = ([x, y, z]) => [(x - 0) * c - (z - lift) * sn, y, x * sn + (z - lift) * c]   // printing -> cap frame
  const R = U.cap_post_d / 2, gap = U.sup_gap, rTip = U.sup_w / 2, rArm = U.sup_arm_w / 2
  const rFoot = U.sup_foot_w / 2, rRoot = Math.min(U.sup_tine_root_w || U.sup_w, U.sup_arm_w) / 2
  const sub = (p, q) => p.map((v, i) => v - q[i]), add = (p, q) => p.map((v, i) => v + q[i]), mul = (p, k) => p.map(v => v * k)
  const len = v => Math.hypot(...v), unit = v => mul(v, 1 / len(v))
  // where the open end (the skirt's bottom, cap z = 0) is at height z' (x' of that plane's line)
  const openEdge = z => c * (z - lift) / -sn
  const norm = [-1, 0, -a].map(v => v / Math.hypot(1, a))          // ceiling's normal, into the hollow
  const postTop = ceilXY ? ceilXY(-R, 0) : ceil(0)                 // the post's visible length
  const segs = []        // { p, q, r0, r1 }: a tapered round bar
  const balls = []       // { p, r }
  const tips = []        // the tine ends, to check the gap
  const jointR = rArm
  const bar = (p, q, r0, r1) => segs.push({ p, q, r0, r1 })
  const lean = Math.tan(U.sup_lean * Math.PI / 180)      // a strut's lean from the vertical
  const feet = []                                          // where each strut meets the bed (x') and how far its footprint reaches along x
  // the tines' offsets along the cap's height (cap z, which is along the post and across the ceiling's depth): a fan in a vertical plane
  // (closer together than sup_tine_pitch if the hollow is too short for it, as under a dished
  // top: the post's outer tines must stay sup_gap clear of the ceiling and of the open end)
  const half = (U.sup_tines - 1) / 2
  const pitch = half > 0 ? Math.min(U.sup_tine_pitch, (postTop / 2 - rTip - gap - 0.15) / half) : 0
  const tineZ = Array.from({ length: U.sup_tines }, (_, i) => (i - half) * pitch)
  const target = (surf, nrm, zFan, what) => {
    // surf: the tine ends' points on the cap's surface; nrm: their outward normals (into the free space)
    const ends = surf.map((s, i) => add(P(s), mul(D(nrm[i]), gap + rTip)))
    const zs = ends.reduce((m, e) => m + e[2], 0) / ends.length
    const zJ = zs - zFan
    const J = [openEdge(zJ) + U.sup_clear + rArm, 0, zJ]
    // one straight strut from the bed up to the fan's root, leaning in over the cap (no elbow),
    // sup_foot_w wide at the bed and tapering evenly to sup_arm_w at the top. It starts a little
    // below the bed (its end disc is square to it, so it dips by rFoot * sin(lean)) and the
    // whole scaffold is cut flat at the bed, so the foot stands on a round footprint
    const fz = -(rFoot * Math.sin(U.sup_lean * Math.PI / 180) + 0.1)
    const foot = [J[0] + (J[2] - fz) * lean, 0, fz]
    const rAtBed = rFoot + (rArm - rFoot) * (-fz / (J[2] - fz))
    feet.push({ x: J[0] + J[2] * lean, reach: rAtBed / Math.cos(U.sup_lean * Math.PI / 180) })
    bar(foot, J, rFoot, rArm)
    balls.push({ p: J, r: rArm })
    // the tines: sup_tine_root_w where they split off, tapering evenly to sup_w at their ends
    ends.forEach(e => { bar(J, e, rRoot, rTip); tips.push({ e, what }) })
  }
  // (1) the post's underside (cap x = -R, the side facing down when printed), at its length's middle and each side of it
  const zm = postTop / 2
  target(tineZ.map(dz => [-R, 0, zm + dz]), tineZ.map(() => [-1, 0, 0]), U.sup_fan, 'post')
  // (2) the ceiling: x = xmax(z), at the middle of its height and each side of it
  //     (with ceilXY: where the sloping ceiling is at those heights, square to it)
  const zc = ceil(0) / 2
  const onCeil = z => {
    if (!ceilXY) return { s: [xmax(z), 0, z], n: norm }
    const x = xRight(0, z)
    if (x >= xmax(z) - 0.01) return { s: [xmax(z), 0, z], n: norm }
    const sl = (ceilXY(x + 0.05, 0) - ceilXY(x - 0.05, 0)) / 0.1
    return { s: [x, 0, z], n: [sl, 0, -1].map(v => v / Math.hypot(sl, 1)) }
  }
  // A sloping ceiling only overhangs past 45 degrees (printed, the cap's +x is up) where it's
  // steeper than 1 in 1 across; if that's under sup_overhang_ok long, it needs no tines
  let overhang = null
  if (ceilXY) {
    overhang = 0
    for (let x = xmin(0); x < xmax(0); x += 0.05) {
      const sl = (ceilXY(x + 0.025, 0) - ceilXY(x - 0.025, 0)) / 0.05
      if (sl < -1 && ceilXY(x, 0) > 0.05 && ceilXY(x, 0) < U.cap_skirt - 0.01) overhang += 0.05 * Math.hypot(1, sl)
    }
  }
  const ceilingTines = overhang === null || overhang > U.sup_overhang_ok
  if (ceilingTines) {
    const cs = tineZ.map(dz => onCeil(zc + dz))
    target(cs.map(o => o.s), cs.map(o => o.n), U.sup_fan, 'ceiling')
  }

  // the baseplate: under both feet, with round ends (sup_plate_w across), clear of the cap
  const pad = f => Math.max(U.sup_plate_pad, f.reach)
  const x0 = Math.max(Math.min(...feet.map(f => f.x - pad(f))), openEdge(0) + 1.5), x1 = Math.max(...feet.map(f => f.x + pad(f))), yb = U.sup_plate_w / 2
  const plate = { x0, x1, yb, t: U.sup_plate_t }

  // ---- checks: how far a point of the scaffold is from the cap (the nearest of: the hollow's
  // side walls, front and back walls, ceiling and the post; the wall ends for a point outside
  // the open end). The distances are measured along x, y or z, so they can be a little long on
  // the drafted wall (2%), never short.
  const clearance = pt => {
    const [x, y, z] = Q(pt), zz = Math.max(z, 0)
    const lat = Math.min(x - xmin(zz), xmax(zz) - x, yi - Math.abs(y), Math.hypot(x, y) - R)
    if (z < 0) return lat > 0 ? Math.hypot(lat, z) : -z
    if (!ceilXY) return Math.min(lat, ceil(y) - z)
    // the sloping ceiling: up to it (v) and right to it (h); the line between those two points
    // of it is nearer than it anywhere (the hollow is convex there), so measure to that line
    const v = ceilXY(x, y) - z, h = xRight(y, z) - x
    return Math.min(lat, v, h, v > 0 && h > 0 ? v * h / Math.hypot(v, h) : Math.min(v, h))
  }
  let worst = 1e9, worstAt = null
  const closest = {}
  for (const sg of segs) {
    const L = len(sub(sg.q, sg.p)), n = Math.max(2, Math.ceil(L / 0.05))
    for (let i = 0; i <= n; i++) {
      const t = i / n, pt = add(sg.p, mul(sub(sg.q, sg.p), t)), r = sg.r0 + (sg.r1 - sg.r0) * t
      if (pt[2] < 0) continue                  // below the bed: cut off
      const d = clearance(pt) - r
      if (d < worst) { worst = d; worstAt = Q(pt).map(v => v.toFixed(2)).join(', ') }
    }
  }
  for (const t of tips) {
    const d = clearance(t.e) - rTip
    closest[t.what] = Math.min(closest[t.what] === undefined ? 1e9 : closest[t.what], d)
  }
  const plateGap = x0 - openEdge(0)           // the cap's open end leans away higher up, so this is the nearest
  const problems = []
  if (worst < gap - 0.01) problems.push(`a support comes within ${worst.toFixed(3)} mm of the cap (needs ${gap}), at (${worstAt}) in the cap's own frame`)
  for (const k of ceilingTines ? ['post', 'ceiling'] : ['post']) if (!(closest[k] < gap + 0.05)) problems.push(`the ${k} tines are ${closest[k] && closest[k].toFixed(2)} mm from it, not ${gap}`)
  if (plateGap < 1) problems.push(`the baseplate is only ${plateGap.toFixed(2)} mm from the cap`)
  if (problems.length) throw new Error(`supports (${cap.w} mm cap): ${problems.join('; ')}`)
  if (say) say(`supports ${cap.w} mm cap: closest approach ${worst.toFixed(3)} mm, post tines ${closest.post.toFixed(3)} mm${ceilingTines ? ` and ceiling tines ${closest.ceiling.toFixed(3)} mm` : ''} off${overhang === null ? '' : `, ceiling overhangs past 45 degrees for ${overhang.toFixed(1)} mm${ceilingTines ? '' : ' (no tines needed)'}`}, baseplate ${plateGap.toFixed(1)} mm from the cap, struts stand ${feet.map(f => f.x.toFixed(1)).join(' and ')} mm out, leaning ${U.sup_lean} degrees, ${U.sup_foot_w} mm wide at the bed`)

  const V = v => `[${v.map(r3).join(', ')}]`
  // the baseplate: a slot shape (two round ends joined), or one disc if it's no longer than wide
  const { x0: px0, x1: px1, yb: pr, t: pt } = plate
  const plateParts = px1 - px0 > 2 * pr
    ? [`CSG.cube({ center: ${V([(px0 + px1) / 2, 0, pt / 2])}, radius: ${V([(px1 - px0) / 2 - pr, pr, pt / 2])} })`,
      `CSG.cylinder({ start: ${V([px0 + pr, 0, 0])}, end: ${V([px0 + pr, 0, pt])}, radius: ${r3(pr)}, resolution: 48 })`,
      `CSG.cylinder({ start: ${V([px1 - pr, 0, 0])}, end: ${V([px1 - pr, 0, pt])}, radius: ${r3(pr)}, resolution: 48 })`]
    : [`CSG.cylinder({ start: ${V([(px0 + px1) / 2, 0, 0])}, end: ${V([(px0 + px1) / 2, 0, pt])}, radius: ${r3(pr)}, resolution: 48 })`]
  const parts = [
    ...plateParts,
    ...segs.map(g => `CSG.cylinder({ start: ${V(g.p)}, end: ${V(g.q)}, radiusStart: ${r3(g.r0)}, radiusEnd: ${r3(g.r1)}, resolution: 32 })`),
    ...balls.map(b => `CSG.sphere({ center: ${V(b.p)}, radius: ${r3(b.r)}, resolution: 20 })`),
  ]
  // everything is cut flat at the bed (the struts' feet start a little below it)
  return `
function scaffold() {
  return ${parts.map((p, i) => (i ? '    .union(' + p + ')' : p)).join('\n')}
    .intersect(CSG.cube({ corner1: [-500, -500, 0], corner2: [500, 500, 500] }));
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
// With across (a function of t, 0 at the right edge to 1 at the left), the top isn't the same
// all the way across: its height is the profile's times across(t), so it sweeps down to the
// bottom at the right end (no right chamfer or right face there), and there's no dish. The
// hollow's ceiling then follows it too (the top eroded by cap_top_t across as well as along).
// With corner (mm), the right end's two corners are rounded that radius seen from above: each
// cut away outside a quarter circle, along with the hollow and the socket (in the same cut).
const csSource = (U, cap, tol, points, { homing = false, supports = false, say = null, across = null, corner = 0 } = {}) => {
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
  // the dish: a shallow dip cap_cs_dish deep at the middle of the top, easing to nothing at the
  // left and right edges (where the chamfers start) and at the front and back ends of the top,
  // (1 - u^2)(1 - v^2) with u across the width and v front to back, both -1 to 1
  const D = across ? 0 : U.cap_cs_dish || 0, N = across ? 40 : D > 0 ? Math.max(2, U.cap_cs_dish_cols || 16) : 1
  const yA = points[first][0], yB = points[last][0], yc = (yA + yB) / 2, yh = (yB - yA) / 2
  const dishY = y => D * Math.max(0, 1 - ((y - yc) / yh) ** 2)          // the dip along the middle
  // across: t at x (0 at the right end's foot, x = w/2, to 1 at the left chamfer), and the
  // columns' t, closer together towards the right end, where the top drops steeply
  const tOf = x => Math.min(1, Math.max(0, (cap.w / 2 - x) / (cap.w - c)))
  const colT = k => (k / N) ** 1.8                                     // k = 0 at the right end
  const ring = points.slice(first, last + 1).map(([y, z]) => {
    const ck = c, xl = X(z) - ck, xr = X(z) - ck
    // the top across the width, left (IL) to right (IR): dipped in the middle, or across's sweep
    const cols = across
      ? Array.from({ length: N + 1 }, (_, j) => {
        if (j === N) return [X(0), y, 0]                               // the right end's foot
        const t = colT(N - j), x = j === 0 ? -xl : cap.w / 2 - t * (cap.w - c)
        return [x, y, z * across(j === 0 ? 1 : t)]
      })
      : Array.from({ length: N + 1 }, (_, j) => { const u = -1 + 2 * j / N; return [u * xl, y, z - dishY(y) * (1 - u * u)] })
    // the right edge, top (IR) to side (OR): the chamfer (none with across: the top meets the
    // bottom there)
    const right = across ? [cols[N]] : [cols[N], [X(z - ck), y, z - ck]]
    return { cols, right, IR: cols[N], IL: cols[0], OR: right[right.length - 1], OL: [-X(z - ck), y, z - ck], BR: [X(0), y, 0], BL: [-X(0), y, 0] }
  })
  // the first and last rows of the top have no dip, so they're kept as just their two edge
  // points (no points in a line along the ends), and the strips next to them fan out to the
  // next row's points
  const L = ring.length - 1
  for (let k = 0; k + 1 < ring.length; k++) {
    const p = ring[k], q = ring[k + 1]
    if (N === 1) push([p.IL, p.IR, q.IR, q.IL])                       // top (flat)
    else if (across) for (let j = 0; j < N; j++) push([p.cols[j], p.cols[j + 1], q.cols[j + 1], q.cols[j]])
    else if (k === 0) for (let j = 0; j < N; j++) mesh.push(...[[p.IL, q.cols[j + 1], q.cols[j]], ...(j === N - 1 ? [[p.IL, p.IR, q.IR]] : [])].map(meshPoly).filter(Boolean))
    else if (k + 1 === L) for (let j = 0; j < N; j++) mesh.push(...[[p.cols[j], p.cols[j + 1], q.IL], ...(j === N - 1 ? [[p.IR, q.IR, q.IL]] : [])].map(meshPoly).filter(Boolean))
    else for (let j = 0; j < N; j++) push([p.cols[j], p.cols[j + 1], q.cols[j + 1], q.cols[j]])   // top
    for (let i = 0; i + 1 < p.right.length; i++)                       // right chamfer / round
      push([p.right[i + 1], q.right[i + 1], q.right[i]], [p.right[i + 1], q.right[i], p.right[i]])
    push([p.BR, q.BR, q.OR, p.OR],                                     // right face
      [q.IL, q.OL, p.OL], [p.IL, q.IL, p.OL],                        // left chamfer
      [p.OL, q.OL, q.BL, p.BL])                                      // left face
    // bottom (with across, the end walls are cut into strips standing on points along the
    // bottom's edge, so the bottom's first and last strips have those points too)
    const bot = r => r.cols.slice(0, -1).map(c => [c[0], c[1], 0])
    // (each started from a corner off the edge with the points in a line: a fan from one of
    // those would be flat triangles, dropped, leaving the edge open)
    if (across && k === 0) push([q.BL, q.BR, p.BR, ...bot(p).reverse(), p.BL])
    else if (across && k + 1 === L) push([p.BR, p.BL, q.BL, ...bot(q), q.BR])
    else push([p.BL, q.BL, q.BR, p.BR])
  }
  for (const [r, back] of [[ring[0], false], [ring[ring.length - 1], true]]) {   // the ends, if they stand up
    // with across, in strips (one under each column of the top, down to the bottom): one fan
    // over the whole long, low wall is all slivers, which leave cracks along its top in the cut
    const walls = across
      ? [[r.BL, [r.cols[0][0], r.cols[0][1], 0], r.cols[0], r.OL],
        ...r.cols.slice(0, -1).map((c, j) => [[c[0], c[1], 0], j + 1 === r.cols.length - 1 ? r.BR : [r.cols[j + 1][0], c[1], 0], r.cols[j + 1], c])]
      : [[r.BL, r.BR, ...r.right.slice().reverse(), r.IL, r.OL]]
    for (const wall of walls) push(back ? wall.slice().reverse() : wall)
  }
  // the hollow: its ceiling C(y) = min(skirt, the profile eroded by cap_top_t), from the
  // bottom (and 0.5 below it) up; both sides drafted. The profile here is the dished top's
  // middle (its lowest line), so the top is never thinner than cap_top_t
  const T = U.cap_top_t, yi = cap.d / 2 - U.cap_wall
  let ceil = y => {
    if (Math.abs(y) > yi) return 0
    let m = z1
    for (let u = -T; u <= T + 1e-9; u += 0.05) m = Math.min(m, S(y + u) - dishY(y + u) - Math.sqrt(Math.max(0, T * T - u * u)))
    return Math.max(0, m)
  }
  const xi0 = cap.w / 2 - U.cap_wall
  const xmin = z => -(xi0 - a * z), xmax = z => xi0 - a * z      // both sides drafted, cap_wall thick
  let ys = []
  for (let y = -yi; y <= yi + 1e-9; y += 0.2) ys.push(y)
  const cav = []
  const pushC = (...ps) => { for (const p of ps) { const q = meshPoly(p); if (q) cav.push(...tris(q)) } }
  let ceilXY = null, xRight = null, yHol = yi     // yHol: how far front and back the hollow reaches
  if (!across) {
    // only the stretch round the middle where there's room, closed at C = 0 at its ends
    let lo = ys.findIndex(y => ceil(y) > 0.02), hi = ys.length - 1 - ys.slice().reverse().findIndex(y => ceil(y) > 0.02)
    ys = ys.slice(Math.max(0, lo - 1), hi + 2)
    const hol = ys.map((y, k) => {
      const C = k === 0 || k === ys.length - 1 ? 0 : ceil(y)
      return { TL: [xmin(C), y, C], TR: [xmax(C), y, C], BL: [xmin(-0.5), y, -0.5], BR: [xmax(-0.5), y, -0.5] }
    })
    for (let k = 0; k + 1 < hol.length; k++) {
      const p = hol[k], q = hol[k + 1]
      pushC([p.TL, p.TR, q.TR, q.TL], [p.BR, q.BR, q.TR, p.TR], [p.TL, q.TL, q.BL, p.BL], [p.BL, q.BL, q.BR, p.BR])
    }
    pushC([hol[0].BL, hol[0].BR, hol[0].TR, hol[0].TL], [hol[hol.length - 1].TL, hol[hol.length - 1].TR, hol[hol.length - 1].BR, hol[hol.length - 1].BL])
  } else {
    // with across, the ceiling C(x, y) varies across too: the top (the profile times across)
    // eroded by a ball of radius cap_top_t, on a 0.1 mm grid, no higher than the skirt
    const St = [], Ft = []
    for (let i = 0; i <= 2000; i++) St.push(S(-10 + i * 0.01))
    for (let i = 0; i <= 1000; i++) Ft.push(across(i / 1000))
    const lerpT = (tb, v0, dv, v) => { const f = Math.min(tb.length - 1.001, Math.max(0, (v - v0) / dv)), i = Math.floor(f); return tb[i] + (tb[i + 1] - tb[i]) * (f - i) }
    const top = (x, y) => lerpT(St, -10, 0.01, y) * lerpT(Ft, 0, 0.001, tOf(x))
    const ball = []
    for (let u = -T; u <= T + 1e-9; u += 0.2) for (let v = -T; v <= T + 1e-9; v += 0.2) if (u * u + v * v <= T * T + 1e-9) ball.push([u, v, Math.sqrt(Math.max(0, T * T - u * u - v * v))])
    const g = 0.1, gx0 = -cap.w / 2, nx = Math.round(cap.w / g) + 1, gy0 = -yi, ny = Math.round(2 * yi / g) + 1
    const grid = new Float64Array(nx * ny)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = gx0 + i * g, y = gy0 + j * g
      let m = z1
      for (const [u, v, h] of ball) m = Math.min(m, top(x + u, y + v) - h)
      grid[j * nx + i] = m
    }
    ceilXY = (x, y) => {
      if (Math.abs(y) > yi) return -1
      const fx = Math.min(nx - 1.001, Math.max(0, (x - gx0) / g)), fy = Math.min(ny - 1.001, Math.max(0, (y - gy0) / g))
      const i = Math.floor(fx), j = Math.floor(fy), s = fx - i, t = fy - j, G = (ii, jj) => grid[jj * nx + ii]
      return (G(i, j) * (1 - s) + G(i + 1, j) * s) * (1 - t) + (G(i, j + 1) * (1 - s) + G(i + 1, j + 1) * s) * t
    }
    // the hollow's furthest point right at height z (x on the ceiling there, or the right wall)
    xRight = (y, z) => { let x = xmax(z); while (x > xmin(z) && ceilXY(x, y) < z) x -= 0.02; return x }
    ceil = y => ceilXY(0, y)
    // each row across: up the left wall, along the ceiling, down the right wall, the ceiling kept
    // inside both drafted walls. Where the ceiling gets down to cMin, the hollow stops with a
    // straight drop to below the bottom (fading out instead, it would meet the bottom face at a
    // glancing angle, which leaves slivers in the cut); columns closer together towards there
    const M = 48, cMin = 0.4
    const rowMax = y => { let m = -1; for (let x = xmin(0); x <= xmax(0); x += 0.2) m = Math.max(m, ceilXY(x, y)); return m }
    let lo = ys.findIndex(y => rowMax(y) > cMin), hi = ys.length - 1 - ys.slice().reverse().findIndex(y => rowMax(y) > cMin)
    ys = ys.slice(lo, hi + 1)
    yHol = Math.min(-ys[0], ys[ys.length - 1])
    const hol = ys.map(y => {
      const Cw = x => Math.min(ceilXY(x, y), z1, (xi0 - x) / a, (xi0 + x) / a)   // the ceiling, inside the walls
      let CL = Math.min(z1, ceilXY(xmin(0), y)); CL = Math.min(z1, ceilXY(xmin(CL), y))
      const xL = xmin(CL)
      // the ceiling's right end: the right wall, or where it first gets down to cMin
      let xb = xL, drop = false
      if (CL > cMin) { while (xb < xmax(0) && Cw(xb + 0.02) > cMin) xb += 0.02; drop = Cw(xb + 0.02) <= cMin }
      const cols = Array.from({ length: M + 1 }, (_, i) => {
        if (CL <= cMin) return [xL + (xmax(-0.25) - xL) * i / M, y, -0.25]
        if (!drop) { const x = i === M ? xmax(Cw(xb)) : xL + (xb - xL) * (1 - (1 - i / M) ** 1.6); return [x, y, i === 0 ? CL : Cw(x)] }
        if (i === M) return [xb, y, -0.25]
        const x = xL + (xb - xL) * (1 - (1 - i / (M - 1)) ** 1.6)
        return [x, y, i === 0 ? CL : Cw(x)]
      })
      return { cols, BL: [xmin(-0.5), y, -0.5], BR: [xmax(-0.5), y, -0.5] }
    })
    const foot = c => [c[0], c[1], -0.5]
    for (let k = 0; k + 1 < hol.length; k++) {
      const p = hol[k], q = hol[k + 1]
      for (let i = 0; i < M; i++) pushC([p.cols[i], p.cols[i + 1], q.cols[i + 1], q.cols[i]])
      pushC([p.BR, q.BR, q.cols[M], p.cols[M]], [p.cols[0], q.cols[0], q.BL, p.BL])
      // the floor; its first and last strips have the end walls' feet along their edges (and
      // start from a corner off that edge, so the fan has no flat triangles)
      const feet = h => h.cols.map(foot)
      if (k === 0 && k + 2 < hol.length) pushC([q.BL, q.BR, p.BR, ...feet(p).reverse(), p.BL])
      else if (k + 2 === hol.length && k > 0) pushC([p.BR, p.BL, q.BL, ...feet(q), q.BR])
      else pushC([p.BL, q.BL, q.BR, p.BR])
    }
    // the front and back: straight walls down from the first and last rows, in strips (one
    // under each column; one fan over the long, low wall would be slivers, which the cut turns
    // into cracks)
    for (const [h, back] of [[hol[0], false], [hol[hol.length - 1], true]]) {
      const cs = h.cols
      const walls = [[h.BL, foot(cs[0]), cs[0]], [foot(cs[M]), h.BR, cs[M]],
        // (the drop's two points share an x: the strip before it takes both on its edge)
        ...cs.slice(0, -1).flatMap((c, i) => cs[i + 1][0] === c[0] ? []
          : [[foot(c), foot(cs[i + 1]), ...(cs[i + 2] && cs[i + 2][0] === cs[i + 1][0] ? [cs[i + 2]] : []), cs[i + 1], c]])]
      for (const w of walls) pushC(back ? w.slice().reverse() : w)
    }
  }
  // Built-in supports (the *_supported files): a scaffold beside the cap, a separate solid that
  // touches the cap nowhere (see scaffoldSource).
  const scaffold = supports ? scaffoldSource(U, cap, { xmin, xmax, ceil, yi: yHol, a, say, ceilXY, xRight }) : ''
  const cl = U.cap_cross + tol, cw = U.cap_cross_w + tol
  // homing: a rounded bar across the face, standing cap_cs_homing_bump proud of it
  const hr = U.cap_homing_r, hy = -cap.d / 2 + U.cap_draft + U.cap_homing_in, hz = S(hy) - dishY(hy) + U.cap_cs_homing_bump - hr
  const { turn, lift } = csPrint(U, cap)
  // the right end's rounded corners: for each, a box over the corner less a cylinder of radius
  // corner, centred corner in from the right end and from the front (or back) face
  const yEdge = Math.max(-points[0][0], points[points.length - 1][0]), cx = cap.w / 2 - corner, cy = yEdge - corner
  const cornerCut = [1, -1].map(s => `.union(CSG.cube({ corner1: [${r3(cx)}, ${r3(s * cy)}, -1], corner2: [${r3(cap.w / 2 + 1)}, ${r3(s * (yEdge + 1))}, ${r3(z1 + 10)}] })` +
    `.subtract(CSG.cylinder({ start: [${r3(cx)}, ${r3(s * cy)}, -1], end: [${r3(cx)}, ${r3(s * cy)}, ${r3(z1 + 10)}], radius: ${r3(corner)}, resolution: 96 })))`).join('')
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
  const cut = hollow.subtract(post).union(socket)${corner > 0 ? cornerCut : ''};
  let cap = ${homing ? `body.union(CSG.roundedCylinder({ start: [${r3(-U.cap_homing_len / 2 + hr)}, ${r3(hy)}, ${r3(hz)}], end: [${r3(U.cap_homing_len / 2 - hr)}, ${r3(hy)}, ${r3(hz)}], radius: ${hr}, resolution: 32 }))` : 'body'}.subtract(cut);
  // laid on its left face for printing
  cap = cap.rotateY(${turn}).translate([0, 0, ${lift}]);
${scaffold ? `  // the scaffold touches the cap nowhere, so the two go in one file as they are: a boolean
  // union of it with the cap's big mesh runs out of memory on the build server. The polygons are
  // joined, then the T-junctions fixed once, on the whole, as for a cap alone (fixing the cap and
  // joining after leaves cracks: the exporter re-merges the joined faces)
  cap = CSG.fromPolygons(cap.toPolygons().concat(scaffold().toPolygons()));` : ''}
  return cap.fixTJunctions();
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
// F and J (the index fingers' home keys) have the homing bump. The 1.5u cap's swept-down end
// (its right end, art/cs_thumb_curve.json) goes at the key's lower end: on the left half that's
// the key's left end, so the cap is turned round there (its profile is the same both ways).
const csKind = (id, units, half) => ({
  cap: id.endsWith('_top') || id.endsWith('_bottom') ? 'top' : units === 1.5 ? 'thumb' : 'home',
  turned: id.endsWith('_bottom') || (units === 1.5 && half === 'left'),
  homing: id === 'matrix_index_home',
})

// A Chicago-style cap's face seen from above, for the keymap planner (mm, x across, y from the
// front, -, to the back, +): its outline (the top between the left and right chamfers, as far
// down the profile as the cap is built), and the parts of it no steeper than
// cap_cs_print_slope, where a UV-printed legend lands true. Steeper, the print is stretched.
const csFace = (U, cap, points, across = false, corner = 0) => {
  const a = U.cap_draft / (U.cap_top_t + U.cap_skirt), c = U.cap_cs_edge
  const ring = points.filter(p => p[1] >= 2 * c)
  // (with across, the top runs right out to the right end's foot; with corner, the right
  // end's corners are rounded, as csSource cuts them)
  const yEdge = Math.max(-points[0][0], points[points.length - 1][0]), cy = yEdge - corner
  const rightX = y => Math.abs(y) <= cy || !corner ? cap.w / 2 : cap.w / 2 - corner + Math.sqrt(Math.max(0, corner ** 2 - (Math.abs(y) - cy) ** 2))
  const side = pts => [...pts.map(([y, z]) => [across ? rightX(y) : cap.w / 2 - a * z - c, y]), ...pts.slice().reverse().map(([y, z]) => [-(cap.w / 2 - a * z - c), y])].map(p => p.map(r3))
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
    const kind = csKind(id, units, half)
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
      const kind = csKind(id, units, half)
      keys.push({ half, id, units, x: half === 'left' ? p.x : dx - p.x, y: p.y, r: half === 'left' ? p.r : -p.r, cs: kind.cap, turned: kind.turned, homing: kind.homing })
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
    cs: (() => { const pr = csProfiles(); return { slope: U.cap_cs_print_slope, top: csFace(U, capOf(U, 1), pr.top), home: csFace(U, capOf(U, 1), pr.home), thumb: csFace(U, capOf(U, 1.5), pr.home, true, U.cap_cs_thumb_corner_r) } })(),
    // the homing bar on F and J (keys with homing: true), from above, in the cap's frame as
    // csSource builds it: len long and 2 r wide, centred across the cap, y from its middle
    homing: { len: U.cap_homing_len, r: U.cap_homing_r, y: r3(-capOf(U, 1).d / 2 + U.cap_draft + U.cap_homing_in), bump: U.cap_cs_homing_bump },
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
  capCs('thumb_1_5u', 1.5, prof.home, { across: csThumbCurve(), corner: U.cap_cs_thumb_corner_r })

  // holder: the same for both halves (each has 23 1u caps and one 1.5u)
  const perHalf = half => keys.filter(k => k.half === half)
  const holder = holderLayout(U, perHalf('left'))
  // it has to fit on the E1's bed (holder_bed_w x holder_bed_d), either way round
  if (U.holder_bed_w && U.holder_bed_d) {
    const [a, b] = [holder.W, holder.H].sort((p, q) => q - p), [bw, bd] = [U.holder_bed_w, U.holder_bed_d].sort((p, q) => q - p)
    if (a > bw || b > bd) throw new Error(`keycap holder: ${r3(holder.W)} x ${r3(holder.H)} mm doesn't fit on the ${U.holder_bed_w} x ${U.holder_bed_d} mm bed (try holder_cols, holder_pitch or holder_margin)`)
    say(`keycap holder fits the ${U.holder_bed_w} x ${U.holder_bed_d} mm bed with ${r3(bw - a)} x ${r3(bd - b)} mm to spare`)
  }
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
