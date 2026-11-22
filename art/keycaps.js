// Keycaps, the keymap and the UV print files for their legends:
//   output/keymap/layout.json          every key on both halves, for the keymap planner
//   output/cases/keycap_1u.jscad       low-profile caps (in print orientation, top down)
//   output/cases/keycap_1_5u.jscad
//   output/cases/keycap_fit_test.jscad four stem posts with different socket clearances
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
    polys.push(new CSG.Polygon([V(a[i], za), V(a[j], za), V(b[j], zb), V(b[i], zb)]));
  }
  return CSG.fromPolygons(polys);
}
`

// One cap, upright (the skirt's bottom at z = 0, the top at z = H), then turned for printing:
// top down, or with side: true lying on its left side with a cylindrical dish cap_dish deep
// in its top, curving front to back, and chamfered (45 degree) corners rather than rounded
// ones. homing: a homing bar near the front of the top (side caps). tol: socket clearance.
const capSource = (U, cap, tol, name = 'cap', { side = false, homing = false } = {}) => {
  // corners: rounded (8 points each), or for the side caps chamfered (a single flat)
  const corner = side ? 1 : 8
  const dish = side ? U.cap_dish : 0
  const H = U.cap_top_t + U.cap_skirt + dish
  // the dish: a cylinder along x through the top's front and back edges, dish below the top
  // in the middle
  const c = cap.top.h, R = (c * c / 4 + dish * dish) / (2 * dish || 1)
  // lying on its left side: that face leans in by cap_draft over H, so the cap turns by a
  // right angle plus that lean to sit flat on it
  const lean = Math.atan2(U.cap_draft, H) * 180 / Math.PI
  // the outside tapers by cap_draft from the bottom to the top; the skirt's inside follows it
  // cap_wall in, from just below the bottom up to the underside of the top
  const at = z => U.cap_draft * z / H
  const outer = [rrect(cap.w, cap.d, U.cap_r_bottom, corner), rrect(cap.top.w, cap.top.h, U.cap_r_top, corner)]
  const z0 = -0.5, z1 = U.cap_skirt
  const inner = [z0, z1].map(z => rrect(cap.w - 2 * at(z) - 2 * U.cap_wall, cap.d - 2 * at(z) - 2 * U.cap_wall, Math.max(0.4, U.cap_r_bottom - U.cap_wall), corner))
  // homing bar: a rounded bar along x, cap_homing_len long, standing cap_homing_h proud of the
  // dished top, cap_homing_in from the front edge (front is -y, towards you)
  const zc = H - dish + R, surface = y => zc - Math.sqrt(R * R - y * y)
  const hy = -cap.top.h / 2 + U.cap_homing_in, hr = U.cap_homing_r
  const hz = surface(hy) + U.cap_homing_h - hr
  const cl = U.cap_cross + tol, cw = U.cap_cross_w + tol
  return `
function ${name}() {
  const body = loft(${JSON.stringify(outer[0])}, 0, ${JSON.stringify(outer[1])}, ${r3(H)})
    .subtract(loft(${JSON.stringify(inner[0])}, ${z0}, ${JSON.stringify(inner[1])}, ${r3(z1)}));
  const post = CSG.cylinder({ start: [0, 0, 0], end: [0, 0, ${r3(U.cap_skirt + 0.3)}], radius: ${U.cap_post_d / 2}, resolution: 48 });
  const socket = CSG.cube({ center: [0, 0, ${r3((U.cap_socket - 0.5) / 2)}], radius: [${r3(cl / 2)}, ${r3(cw / 2)}, ${r3((U.cap_socket + 0.5) / 2)}] })
    .union(CSG.cube({ center: [0, 0, ${r3((U.cap_socket - 0.5) / 2)}], radius: [${r3(cw / 2)}, ${r3(cl / 2)}, ${r3((U.cap_socket + 0.5) / 2)}] }));
  let cap = body.union(post).subtract(socket);
${side ? `  cap = cap.subtract(CSG.cylinder({ start: [${r3(-cap.w)}, 0, ${r3(zc)}], end: [${r3(cap.w)}, 0, ${r3(zc)}], radius: ${r3(R)}, resolution: 1024 }));
${homing ? `  cap = cap.union(CSG.roundedCylinder({ start: [${r3(-U.cap_homing_len / 2 + hr)}, ${r3(hy)}, ${r3(hz)}], end: [${r3(U.cap_homing_len / 2 - hr)}, ${r3(hy)}, ${r3(hz)}], radius: ${hr}, resolution: 32 }));\n` : ''}  // on its left side, flat on the bed, centred
  cap = cap.rotateY(${r3(-90 - lean)});
  const b = cap.getBounds();
  return cap.translate([-(b[0].x + b[1].x) / 2, -(b[0].y + b[1].y) / 2, -b[0].z]);` : `  // top down for printing: the flat top on the bed
  return cap.rotateX(180).translate([0, 0, ${r3(H)}]);`}
}
`
}

// Four stem posts on small tabs, socket clearance 0.05 to 0.2 mm; the number of notches in a
// tab's edge says which (1 = 0.05 ... 4 = 0.2). Top down, like the caps.
const fitTestSource = U => {
  const tols = [0.05, 0.1, 0.15, 0.2], s = 11
  const parts = tols.map((tol, i) => {
    const cl = U.cap_cross + tol, cw = U.cap_cross_w + tol, x = (i - 1.5) * (s + 3)
    const notches = Array.from({ length: i + 1 }, (_, k) => `CSG.cube({ center: [${r3(x - s / 2 + 2 + k * 1.8)}, ${-s / 2}, 0], radius: [0.5, 0.8, 5] })`).join(', ')
    return `CSG.cube({ center: [${x}, 0, ${U.cap_top_t / 2}], radius: [${s / 2}, ${s / 2}, ${U.cap_top_t / 2}] })
      .union(CSG.cylinder({ start: [${x}, 0, ${U.cap_top_t - 0.1}], end: [${x}, 0, ${r3(U.cap_top_t + U.cap_skirt)}], radius: ${U.cap_post_d / 2}, resolution: 48 }))
      .subtract(CSG.cube({ center: [${x}, 0, ${r3(U.cap_top_t + U.cap_skirt - U.cap_socket / 2 + 0.25)}], radius: [${r3(cl / 2)}, ${r3(cw / 2)}, ${r3(U.cap_socket / 2 + 0.25)}] }))
      .subtract(CSG.cube({ center: [${x}, 0, ${r3(U.cap_top_t + U.cap_skirt - U.cap_socket / 2 + 0.25)}], radius: [${r3(cw / 2)}, ${r3(cl / 2)}, ${r3(U.cap_socket / 2 + 0.25)}] }))
      .subtract([${notches}])`
  })
  return `function main() {\n  return ${parts.join('\n  .union(')}${')'.repeat(parts.length - 1)};\n}\n`
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
  for (const f of [km.style.font, km.style.symbolFont]) if (!fs.existsSync(f)) say(`keymap warning: font not found: ${f}`)

  // every key on both halves, for the planner: the right half mirrored and moved across, as
  // in the assembled view
  const keys = []
  for (const half of ['left', 'right']) {
    for (const id of ORDER) {
      const p = P[id]
      if (!p) { say(`keymap warning: no key ${id}`); continue }
      const units = Math.round(p.meta.width / U.kx * 4) / 4
      keys.push({ half, id, units, x: half === 'left' ? p.x : dx - p.x, y: p.y, r: half === 'left' ? p.r : -p.r })
    }
    for (const id of Object.keys(P)) if (!ORDER.includes(id)) say(`keymap warning: key ${id} isn't in the keymap order`)
  }
  put('keymap/layout.json', JSON.stringify({
    // which characters the text font has: the planner draws the rest as symbols, like the print
    textFont: fs.existsSync(km.style.font) ? T.open(km.style.font).ranges() : [],
    symbolBlocks: T.SYMBOL_BLOCKS,
    cap: { pitch: U.cap_pitch, gap: U.cap_gap, draft: U.cap_draft },
    caps: Object.fromEntries([1, 1.5].map(u => [u, capOf(U, u)])),
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
  for (const units of [1, 1.5]) {
    const cap = capOf(U, units)
    put(`cases/keycap_${String(units).replace('.', '_')}u.jscad`, LIB + capSource(U, cap, U.cap_stem_tol) + 'function main() { return cap(); }\n')
    put(`cases/keycap_${String(units).replace('.', '_')}u_side.jscad`, LIB + capSource(U, cap, U.cap_stem_tol, 'cap', { side: true }) + 'function main() { return cap(); }\n')
    if (units === 1) put('cases/keycap_1u_side_homing.jscad', LIB + capSource(U, cap, U.cap_stem_tol, 'cap', { side: true, homing: true }) + 'function main() { return cap(); }\n')
  }
  put('cases/keycap_fit_test.jscad', fitTestSource(U))

  // holder: the same for both halves (each has 23 1u caps and one 1.5u)
  const perHalf = half => keys.filter(k => k.half === half)
  const holder = holderLayout(U, perHalf('left'))
  put('cases/keycap_holder.jscad', LIB + holderSource(U, holder))

  // print files, one per half, true size: the drawing is exactly the holder
  for (const half of ['left', 'right']) {
    const { slots, W, H } = holderLayout(U, perHalf(half))
    const body = slots.map(s => legendSvg(km, km.keys[half][s.id], capOf(U, s.units).top, s.cx, s.cy)).join('\n')
    put(`keymap/print_${half}.svg`, svgDoc(W, H, body))
    // preview: the holder, the caps' tops and which key each slot is
    const c = U.holder_clear
    const prev = [`<path d="M7.07 0H${W}V${H}H0V7.07Z" fill="#d9d4c7" stroke="#999" stroke-width="0.3"/>`]
    for (const s of slots) {
      const cap = capOf(U, s.units)
      prev.push(`<rect x="${r3(s.cx - cap.w / 2 - c)}" y="${r3(s.cy - cap.d / 2 - c)}" width="${r3(cap.w + 2 * c)}" height="${r3(cap.d + 2 * c)}" rx="${U.cap_r_bottom + c}" fill="#bdb6a6"/>`)
      prev.push(`<rect x="${r3(s.cx - cap.top.w / 2)}" y="${r3(s.cy - cap.top.h / 2)}" width="${r3(cap.top.w)}" height="${r3(cap.top.h)}" rx="${U.cap_r_top}" fill="${km.style.capColor}"/>`)
      prev.push(legendSvg(km, km.keys[half][s.id], cap.top, s.cx, s.cy))
      prev.push(`<text x="${r3(s.cx)}" y="${r3(s.cy + cap.d / 2 + 1.7)}" font-size="1.3" font-family="sans-serif" text-anchor="middle" fill="#555">${s.id.replace(/^matrix_|_thumb$/g, '')}</text>`)
    }
    put(`keymap/preview_${half}.svg`, svgDoc(W, H, prev.join('\n')))
  }
  say(`keymap: ${keys.length} keys, holder ${r3(holder.W)} x ${r3(holder.H)} mm`)
  return { holder }
}

module.exports = { build, capOf, ORDER }
