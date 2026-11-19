// Builds the v4 keyboard: runs Ergogen on config.yaml + footprints/, then lays out the wire
// channels of the printed wiring boards (wiring/routes.js for the left half,
// wiring/routes_right.js for the right), checks them and writes:
//   output/outlines, output/cases       everything Ergogen makes (left half)
//   output/cases/*_right.jscad          the same cases from a mirrored run (right half)
//   output/cases/wireboard_<half>.jscad the wiring boards: base case + channels
//   output/wiring/wiring_map_<half>.svg assembly maps (back view and front view)
//   output/wiring/report_<half>.md      pin map, wire lengths, sleeves, check results
//
// CLI:    node wiring/build.js        (same as `npm run build`)
// Module: require('./wiring/build').build() -> Promise<{ code, clashes, log }>
//   code 1 if Ergogen or the wiring step fails; clashes = number of check errors.
// CLI exit code 1 if either happens (the outputs are still written).

const fs = require('fs')
const path = require('path')
const G = require('./geom')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'output')
const EG = fs.realpathSync(path.join(ROOT, 'node_modules', 'ergogen', 'src'))
const egRequire = require('module').createRequire(path.join(EG, 'cli.js'))
const yaml = egRequire('js-yaml')
const makerjs = egRequire('makerjs')
const ergogen = require(path.join(EG, 'ergogen.js'))
const io = require(path.join(EG, 'io.js'))
const anchor = require(path.join(EG, 'anchor.js')).parse

// ---------- channel and clearance settings ----------
const SET = {
  w: 0.9,            // channel width for 22 AWG solid wire (0.64 mm)
  deep: 2.1,         // deep channel: the wire lies on the socket tabs
  shallow: 1.0,      // shallow channel (rows, bundle, links)
  front: 1.0,        // front channel depth
  wall: 0.3,         // minimum wall between channels, and to holes and pockets
  edge: 0.6,         // minimum wall to the board edge
  via: 1.0,          // hole for a wire through the board
  // case standoffs (r 2.5) press on the back face round each mounting hole. A channel may
  // run under the outer part of that ring (the wire sits below the face), but not within:
  standoff: 2.0,
  sleeve: { w: 2.0, len: 6, depth: 1.4 },   // pocket for a heat-shrink sleeve at a crossing
  minAngle: 30,      // crossings flatter than this are flagged
}

// ---------- Ergogen ----------
const listJs = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? listJs(path.join(dir, e.name), base + e.name + '/') : e.name.endsWith('.js') ? [base + e.name] : [])

const injectFootprints = () => {
  const dir = path.join(ROOT, 'footprints')
  for (const rel of listJs(dir)) {
    const name = rel.replace(/\.js$/, '')
    const text = fs.readFileSync(path.join(dir, rel), 'utf8')
    const mod = new Function('require', 'const module = {};\n\n' + text + '\n\nreturn module.exports;')(io.fake_require(name))
    ergogen.inject('footprint', name, mod)
  }
}

const writeErgogenOutputs = results => {
  fs.rmSync(OUT, { recursive: true, force: true })
  const put = (rel, data) => {
    const abs = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, data)
  }
  for (const [name, o] of Object.entries(results.outlines)) if (!name.startsWith('_')) put(`outlines/${name}.dxf`, o.dxf)
  writeCases(results.cases, '', put)
  return put
}
const writeCases = (cases, suffix, put) => {
  for (const [name, c] of Object.entries(cases)) {
    if (name.startsWith('_') || name.startsWith('wireboard_base')) continue
    put(`cases/${name}${suffix}.jscad`, c.jscad || c)
  }
}

// The right half: the same config with every point mirrored (x -> -x, rotations negated).
// Outlines then come out mirrored, except cuts marked `resist: true` (each switch's socket
// and diode), which keep their own orientation. Its case openings use usb_z_right.
const mirroredRun = text => {
  const req = n => require(path.join(EG, n))
  let [config] = io.interpret(text, () => {})
  const prep = req('prepare.js')
  config = prep.parameterize(prep.inherit(prep.unnest(config)))
  config.units.usb_z = config.units.usb_z_right
  const units = req('units.js').parse(config)
  const points = req('points.js').parse(config.points, units)
  for (const p of Object.values(points)) {
    p.x = -p.x
    p.r = -p.r
    p.meta.mirrored = true
  }
  const outlines = req('outlines.js').parse(config.outlines || {}, points, units)
  const cases = req('cases.js').parse(config.cases || {}, outlines, units)
  return { points, units, cases }
}

// ---------- route expansion ----------
const BACK = new Set(['deep', 'shallow'])
const zRange = (depth, T) => depth === 'deep' ? [0, SET.deep] : depth === 'shallow' ? [0, SET.shallow] : depth === 'front' ? [T - SET.front, T] : null
const zOverlap = (a, b) => a && b && a[0] < b[1] - 1e-6 && b[0] < a[1] - 1e-6

const expand = wires => {
  const segs = [], vias = [], ends = []
  for (const w of wires) {
    let depth = null, last = null
    w.polys = []
    let cur = null
    for (const part of w.parts) {
      if (typeof part === 'string') {
        if (part === 'via') { vias.push({ net: w.net, p: last }); continue }
        depth = part
        cur = { depth, pts: last ? [last] : [] }
        w.polys.push(cur)
        continue
      }
      if (last && G.dist(last, part) < 1e-6) continue
      if (cur) cur.pts.push(part)
      if (last) {
        const s = { net: w.net, wire: w.name, depth, a: last, b: part }
        segs.push(s)
      }
      last = part
    }
    // where a channel meets the MCU: the ends of every stretch over the module
    for (const p of w.polys) if (p.depth === 'onmodule') ends.push(p.pts[0], p.pts[p.pts.length - 1])
  }
  return { segs, vias, ends }
}

// ---------- keepouts ----------
// ctx.lx = -1 draws each key's own parts mirrored (the right half, seen in the left half's
// frame); ctx.mcuFlipped uses the right half's deeper MCU pocket.
const buildKeepouts = ctx => {
  const { P, U, keyNames } = ctx
  const K = (k, x, y) => ctx.K(k, ctx.lx * x, y)
  const T = U.board_t
  const out = []
  const all = [-1, T + 1]
  const add = (o) => out.push(o)
  const circ = (c, r, z, name, net) => add({ type: 'circle', c, r, z, name, net })
  const rect = (poly, z, name, net) => add({ type: 'poly', poly, z, name, net })
  const tol = U.sock_tol
  for (const k of keyNames) {
    const place = p => K(k, p[0], p[1])
    const meta = P[k].meta || {}
    circ(place([0, 0]), 2.6, all, `${k} centre hole`)
    circ(place([-4.4, -4.7]), 1.55, all, `${k} pin hole`)
    circ(place([2.6, -5.75]), 1.55, all, `${k} pin hole`)
    circ(place([U.diode_x, U.diode_a]), U.leg_hole_d / 2, all, `${k} anode hole`)
    circ(place([U.diode_x, U.diode_k]), U.leg_hole_d / 2, all, `${k} cathode hole`, meta.row_net)
    const sock = [0, U.sock_depth]
    rect(G.rectPoly(-3.8125, -4.7, 6.025 + 2 * tol, 4.35 + 2 * tol, place), sock, `${k} socket`)
    rect(G.rectPoly(1.1625, -5.75, 7.725 + 2 * tol, 4.35 + 2 * tol, place), sock, `${k} socket`)
    rect(G.rectPoly(-7.6375, -4.7, 1.625 + 2 * tol, 1.75 + 2 * tol, place), sock, `${k} column tab`, meta.column_net)
    const t2x = U.diode_x + 0.7
    rect(G.rectPoly((5.025 + t2x) / 2, -5.75, t2x - 5.025 + 2 * tol, 1.75 + 2 * tol, place), sock, `${k} diode tab`)
    const cy = (U.diode_a + U.diode_k) / 2
    rect(G.rectPoly(U.diode_x, cy, 2.4, 4.6, place), [T - U.diode_pocket_d, T], `${k} diode pocket`)
    rect(G.rectPoly(U.diode_x, cy, 0.9, U.diode_k - U.diode_a, place), [T - U.diode_slot_d, T], `${k} diode legs`)
  }
  // mounting holes: the hole itself, and the case standoff against the back face
  for (const h of ctx.mountHoles) {
    circ(h, U.hole_d / 2, all, 'mounting hole')
    circ(h, SET.standoff, [-1, 0.01], 'case standoff')
  }
  const S = ctx.S, M = ctx.M, L = ctx.L
  const sRect = (cx, cy, w, h) => G.rectPoly(cx, cy, w, h, p => S(p[0], p[1]))
  rect(sRect(M[0], M[1], U.mcu_w + 0.3, U.mcu_h + 0.3), [-1, ctx.mcuFlipped ? U.mcu_pocket_d_right : U.mcu_pocket_d], 'MCU pocket', 'MCU')
  rect(sRect(ctx.mcuCut[0], ctx.mcuCut[1], U.mcu_cut_w, U.mcu_cut_up + U.mcu_cut_down), all, 'MCU cutout')
  rect(sRect(ctx.linkCut[0], ctx.linkCut[1], U.link_cut_len, U.link_cut_w), all, 'breakout cutout')
  rect(sRect((L[0] - 2.3 + ctx.edgeX + 1) / 2, L[1], ctx.edgeX + 1 - (L[0] - 2.3), U.usb_h + 0.4), [-1, U.link_pocket_d], 'breakout pocket')
  return out
}

// ---------- checks ----------
const check = (ctx, ex, keepouts, outline) => {
  const T = ctx.U.board_t
  const errors = [], warnings = [], sleeves = []
  const half = SET.w / 2
  const fmt = p => { const q = ctx.show(p); return `(${q[0].toFixed(2)}, ${q[1].toFixed(2)})` }
  const chan = ex.segs.filter(s => s.depth !== 'onmodule')
  const isEnd = p => ex.ends.some(e => G.dist(e, p) < 1e-6)

  // wire against wire
  for (let i = 0; i < chan.length; i++) {
    for (let j = i + 1; j < chan.length; j++) {
      const s = chan[i], t = chan[j]
      if (s.net === t.net) continue
      const za = zRange(s.depth, T), zb = zRange(t.depth, T)
      if (!zOverlap(za, zb)) continue
      const x = G.segInter(s.a, s.b, t.a, t.b)
      if (x) {
        if (BACK.has(s.depth) && BACK.has(t.depth) && s.depth !== t.depth) {
          const sh = s.depth === 'shallow' ? s : t, dp = s.depth === 'shallow' ? t : s
          const u = G.sub(sh.b, sh.a), v = G.sub(dp.b, dp.a)
          const ang = Math.abs(Math.asin(Math.max(-1, Math.min(1, G.cross(u, v) / (G.len(u) * G.len(v)))))) * 180 / Math.PI
          sleeves.push({ p: x, shallow: sh, deep: dp, angle: ang })
          if (ang < SET.minAngle) warnings.push(`flat crossing (${ang.toFixed(0)} deg) of ${sh.net} over ${dp.net} at ${fmt(x)}`)
        } else {
          errors.push(`${s.net} (${s.depth}) crosses ${t.net} (${t.depth}) at ${fmt(x)}: same layer`)
        }
        continue
      }
      const d = G.segSeg(s.a, s.b, t.a, t.b)
      if (d < SET.w + SET.wall - 1e-6) {
        // segments that meet a crossing pair near its crossing are judged by the crossing
        const near = sleeves.some(c => (c.shallow === s || c.deep === s || c.shallow === t || c.deep === t) && G.pointSeg(c.p, s.a, s.b) < 1.5 && G.pointSeg(c.p, t.a, t.b) < 1.5)
        if (!near) errors.push(`${s.net} and ${t.net} only ${(d - SET.w).toFixed(2)} mm apart near ${fmt(G.add(s.a, G.mul(G.sub(s.b, s.a), 0.5)))} (${s.wire} / ${t.wire})`)
      }
    }
  }
  // wire against keepouts and the board edge
  for (const s of chan) {
    const zs = zRange(s.depth, T)
    for (const k of keepouts) {
      if (!zOverlap(zs, k.z)) continue
      if (k.net && k.net === s.net) continue
      if (k.net === 'MCU' && (isEnd(s.b) || isEnd(s.a))) continue
      let d
      if (k.type === 'circle') d = G.pointSeg(k.c, s.a, s.b) - k.r
      else d = G.segPoly(s.a, s.b, k.poly)
      const need = half + (k.name === 'case standoff' ? 0 : SET.wall)
      if (d < need - 1e-6) errors.push(`${s.net} (${s.depth}) hits ${k.name} near ${fmt(G.add(s.a, G.mul(G.sub(s.b, s.a), 0.5)))}: ${(d - half).toFixed(2)} mm`)
    }
    for (const p of [s.a, s.b]) {
      const { d, inside } = G.pointPoly(p, outline)
      if (!inside || d < half + SET.edge - 1e-6) errors.push(`${s.net} (${s.depth}) too close to the board edge at ${fmt(p)}: ${(inside ? d - half : -d).toFixed(2)} mm`)
    }
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const d = G.segSeg(s.a, s.b, outline[j], outline[i])
      if (d < half + SET.edge - 1e-6) { errors.push(`${s.net} (${s.depth}) too close to the board edge near ${fmt(G.add(s.a, G.mul(G.sub(s.b, s.a), 0.5)))}: ${(d - half).toFixed(2)} mm`); break }
    }
  }
  // vias against other wires
  for (const v of ex.vias) {
    for (const s of chan) {
      if (s.net === v.net) continue
      const d = G.pointSeg(v.p, s.a, s.b) - SET.via / 2 - half
      if (d < SET.wall - 1e-6) errors.push(`${s.net} (${s.depth}) passes ${v.net}'s hole at ${fmt(v.p)}: ${d.toFixed(2)} mm`)
    }
  }
  return { errors: [...new Set(errors)], warnings, sleeves }
}

// ---------- JSCAD ----------
const ccw = pts => {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1])
  return a > 0 ? pts : pts.slice().reverse()
}
const r4 = v => Math.round(v * 1e4) / 1e4
const segRect = (a, b, w) => {
  const d = G.sub(b, a), l = G.len(d), n = [-d[1] / l * w / 2, d[0] / l * w / 2]
  return ccw([G.add(a, n), G.add(b, n), G.sub(b, n), G.sub(a, n)]).map(p => p.map(r4))
}

const jscadLayer = (name, polys, circles, z0, z1) => `
function ${name}() {
  const polys = ${JSON.stringify(polys)};
  const circles = ${JSON.stringify(circles)};
  let parts = polys.map(p => CAG.fromPoints(p));
  for (const [x, y, r] of circles) parts.push(CAG.circle({ center: [x, y], radius: r, resolution: 16 }));
  while (parts.length > 1) {
    const next = [];
    for (let i = 0; i < parts.length; i += 2) next.push(i + 1 < parts.length ? parts[i].union(parts[i + 1]) : parts[i]);
    parts = next;
  }
  return parts[0].extrude({ offset: [0, 0, ${r4(z1 - z0)}] }).translate([0, 0, ${r4(z0)}]);
}
`

const buildJscad = (base, ctx, ex, sleeves) => {
  const T = ctx.U.board_t
  const layers = { deep: [SET.deep, -1], shallow: [SET.shallow, -1], front: [T + 1, T - SET.front] }
  const parts = []
  const fns = []
  for (const [depth, _] of Object.entries(layers)) {
    const segs = ex.segs.filter(s => s.depth === depth)
    if (!segs.length) continue
    const polys = segs.map(s => segRect(s.a, s.b, SET.w))
    const pts = new Map()
    for (const s of segs) for (const p of [s.a, s.b]) pts.set(p.map(r4).join(','), p)
    const circles = [...pts.values()].map(p => [r4(p[0]), r4(p[1]), SET.w / 2])
    const [z0, z1] = depth === 'front' ? [T - SET.front, T + 1] : [-1, depth === 'deep' ? SET.deep : SET.shallow]
    fns.push(jscadLayer(`wb_${depth}`, polys, circles, z0, z1))
    parts.push(`wb_${depth}()`)
  }
  if (sleeves.length) {
    const polys = sleeves.map(c => {
      const u = G.sub(c.shallow.b, c.shallow.a), l = G.len(u), h = G.mul(u, SET.sleeve.len / 2 / l)
      return segRect(G.sub(c.p, h), G.add(c.p, h), SET.sleeve.w)
    })
    fns.push(jscadLayer('wb_sleeves', polys, [], -1, SET.sleeve.depth))
    parts.push('wb_sleeves()')
  }
  const vias = ex.vias.map(v => `CSG.cylinder({ start: [${r4(v.p[0])}, ${r4(v.p[1])}, -1], end: [${r4(v.p[0])}, ${r4(v.p[1])}, ${T + 1}], radius: ${SET.via / 2}, resolution: 16 })`)
  return base.replace(/function main\(\)\s*\{\s*return (\w+)\(\);\s*\}/, 'function wb_base() { return $1(); }') + `
// ---------- wire channels (generated by wiring/build.js from wiring/routes.js) ----------
${fns.join('\n')}
function main() {
  let board = wb_base();
  const cuts = [${parts.join(', ')}${vias.length ? ',\n    ' + vias.join(',\n    ') : ''}];
  return board.subtract(cuts);
}
`
}

// ---------- SVG map ----------
const svgMap = (ctx, ex, sleeves, keepouts, outline, title) => {
  const all = outline
  const xs = all.map(p => p[0]), ys = all.map(p => p[1])
  const pad = 8
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const W = maxX - minX, H = maxY - minY
  const view = (mirror) => {
    // back view: seen from the back, so mirrored left-right
    const tx = p => mirror ? (maxX - (p[0] - minX)) - minX : p[0] - minX
    const ty = p => maxY - p[1]
    const P = p => `${r4(tx(p))},${r4(ty(p))}`
    const g = []
    g.push(`<polygon points="${outline.map(P).join(' ')}" fill="#f4efe6" stroke="#555" stroke-width="0.3"/>`)
    for (const k of keepouts) {
      if (k.name === 'case standoff') { g.push(`<circle cx="${r4(tx(k.c))}" cy="${r4(ty(k.c))}" r="${k.r}" fill="none" stroke="#aaa" stroke-width="0.2" stroke-dasharray="0.6 0.6"/>`); continue }
      const back = k.z[0] < 0.5
      if (mirror !== back && !(k.z[0] < 0 && k.z[1] > ctx.U.board_t)) continue
      const fill = /pocket|socket|tab/.test(k.name) ? '#d9d2c3' : /hole|cutout/.test(k.name) ? '#fff' : '#ccc'
      if (k.type === 'circle') g.push(`<circle cx="${r4(tx(k.c))}" cy="${r4(ty(k.c))}" r="${k.r}" fill="${fill}" stroke="#888" stroke-width="0.15"/>`)
      else g.push(`<polygon points="${k.poly.map(P).join(' ')}" fill="${fill}" stroke="#888" stroke-width="0.15"/>`)
    }
    if (!mirror) for (const poly of ctx.switches) g.push(`<polygon points="${poly.map(P).join(' ')}" fill="none" stroke="#999" stroke-width="0.2" stroke-dasharray="1 0.6"/>`)
    const colour = s => s.depth === 'front' ? '#2a9d4a' : s.net[0] === 'C' ? '#2b6cb0' : s.net[0] === 'R' ? '#c0392b' : '#8e44ad'
    const show = s => mirror ? BACK.has(s.depth) || s.depth === 'onmodule' : s.depth === 'front'
    for (const s of ex.segs.filter(show)) {
      const w = s.depth === 'deep' ? 0.9 : s.depth === 'onmodule' ? 0.3 : 0.7
      g.push(`<line x1="${r4(tx(s.a))}" y1="${r4(ty(s.a))}" x2="${r4(tx(s.b))}" y2="${r4(ty(s.b))}" stroke="${colour(s)}" stroke-width="${w}" stroke-linecap="round"${s.depth === 'onmodule' ? ' stroke-dasharray="0.6 0.4"' : ''}/>`)
    }
    for (const v of ex.vias) g.push(`<circle cx="${r4(tx(v.p))}" cy="${r4(ty(v.p))}" r="0.7" fill="#2a9d4a" stroke="#000" stroke-width="0.15"/>`)
    if (mirror) sleeves.forEach((c, i) => {
      const u = G.sub(c.shallow.b, c.shallow.a), l = G.len(u), h = G.mul(u, SET.sleeve.len / 2 / l)
      g.push(`<line x1="${r4(tx(G.sub(c.p, h)))}" y1="${r4(ty(G.sub(c.p, h)))}" x2="${r4(tx(G.add(c.p, h)))}" y2="${r4(ty(G.add(c.p, h)))}" stroke="#f1c40f" stroke-width="1.8" stroke-opacity="0.75"/>`)
    })
    for (const lab of ctx.labels) {
      if (lab.side && lab.side !== (mirror ? 'back' : 'front')) continue
      g.push(`<text x="${r4(tx(lab.p))}" y="${r4(ty(lab.p))}" font-size="${lab.size || 1.6}" font-family="sans-serif" text-anchor="middle" fill="${lab.fill || '#333'}">${lab.text}</text>`)
    }
    return g.join('\n')
  }
  const legend = [['#2b6cb0', 'column wire (deep: on the socket tabs)'], ['#c0392b', 'row wire (shallow)'], ['#8e44ad', 'other back wire'], ['#2a9d4a', 'front wire / hole through the board'], ['#f1c40f', 'heat-shrink sleeve at a crossing']]
  const lg = legend.map(([c, t], i) => `<rect x="2" y="${H * 2 + 14 + i * 4}" width="6" height="2.4" fill="${c}"/><text x="10" y="${H * 2 + 16 + i * 4}" font-size="2.4" font-family="sans-serif">${t}</text>`).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r4(W)} ${r4(H * 2 + 36)}" width="${r4(W * 5)}" height="${r4((H * 2 + 36) * 5)}">
<rect width="100%" height="100%" fill="#fff"/>
<text x="2" y="5" font-size="3.4" font-family="sans-serif" font-weight="bold">${title}: back (as you wire it, board face down)</text>
<g transform="translate(0,7)">${view(true)}</g>
<text x="2" y="${H + 12}" font-size="3.4" font-family="sans-serif" font-weight="bold">front (switch side)</text>
<g transform="translate(0,${H + 14})">${view(false)}</g>
${lg}
</svg>`
}

// ---------- one half ----------
const ASSEMBLY = {
  left: `1. Print \`cases/wireboard_left.stl\` front face down (the switches need that face flat). The back's channels and pockets then face up and need no supports.
2. From the front, fit a 1N4148 per key: legs through the two holes, body in its pocket, cathode band towards the upper hole (the row).
3. Turn the board over. Press a hot-swap socket into each pocket. Bend the anode leg onto the socket's right tab and solder it.
4. Lay the bare column wires in the deep channels, from the bottom key up, soldering to each socket's left tab on the way. Then follow the shallow channels to the MCU.
5. Slide one ${SET.sleeve.len} mm heat-shrink sleeve onto a row (or link) wire for each crossing listed below. Lay the rows in the shallow channels with the sleeves in the wide pockets, and shrink them. Solder each cathode leg to its row wire.
6. Run 5V, GND and LINK in the front channels and push their ends down through the holes. Put the RP2040-Zero (component side towards the front) and the USB-C breakout in their back pockets, threading those ends through their pad holes. Bring each back wire over the edge of the MCU's board and push it through its pad hole and on into the hole in the board behind it. Every MCU pin in use then has a wire right through it, which holds the module in place. Solder all of them on the back, and trim the ends that poke out on the front.
7. Check every row and column for continuity, and for shorts to its neighbours, before you fit the switches.`,
  right: `1. Print \`cases/wireboard_right.stl\` front face down (the switches need that face flat). The back's channels and pockets then face up and need no supports.
2. From the front, fit a 1N4148 per key: legs through the two holes, body in its pocket, cathode band towards the upper hole (the row). The switches, sockets and diodes sit exactly as on the left half; only their positions are mirrored.
3. Turn the board over. Press a hot-swap socket into each pocket. Bend the anode leg onto the socket's diode tab and solder it.
4. Lay the bare column wires in the deep channels, from the bottom key up, soldering to each socket's column tab on the way. Then follow the shallow channels towards the MCU. Each ends on a hole: push the end up through it.
5. Slide one ${SET.sleeve.len} mm heat-shrink sleeve onto a row (or link) wire for each crossing listed below. Lay the rows in the shallow channels with the sleeves in the wide pockets, and shrink them. Solder each cathode leg to its row wire. Push the row ends up through their holes.
6. Push one end each of 5V, GND and LINK down through its hole beside the MCU cutout from the front, run them in the front channels (GND dips through the board once, under 5V), and push their other ends down into the breakout's pad holes. From the back, put the RP2040-Zero in its pocket component side up (towards you), USB-C port at the top edge, threading those three ends through its pad holes. Bring each back wire over the pocket's edge, down onto the module and through its pad hole into the hole in the board in front of it. Every MCU pin in use then has a wire right through it, which holds the module in place. Fit the USB-C breakout (turned round, opening towards the other half) in its back pocket. Solder everything on the back and trim the ends that poke out on the front.
7. Check every row and column for continuity, and for shorts to its neighbours, before you fit the switches.`,
}

// Lays out, checks and writes one half. Everything is computed in the left half's frame;
// for the right half (mirror = true) the routes and the per-key parts are drawn mirrored
// there, and the results are mirrored into place (x -> -x) at the end.
const doHalf = ({ side, mirror, base, left, put, say }) => {
  const { P, U, K, S, O } = left
  const lx = mirror ? -1 : 1
  const fx = p => (mirror ? [-p[0], p[1]] : p)
  const ctx = { ...left, lx, mcuFlipped: mirror, show: p => [lx * (p[0] - O[0]), p[1] - O[1]] }
  const { wires, labels, pins } = require(mirror ? './routes_right' : './routes')({ K, S, U, M: left.M, L: left.L })
  const ex = expand(wires)
  const keepouts = buildKeepouts(ctx)
  const { errors, warnings, sleeves } = check(ctx, ex, keepouts, left.outline)

  // into place
  const seg = s => ({ ...s, a: fx(s.a), b: fx(s.b) })
  const exP = { segs: ex.segs.map(seg), vias: ex.vias.map(v => ({ ...v, p: fx(v.p) })), ends: ex.ends.map(fx) }
  const sleevesP = sleeves.map(c => ({ ...c, p: fx(c.p), shallow: seg(c.shallow), deep: seg(c.deep) }))
  const keepP = keepouts.map(k => (k.type === 'circle' ? { ...k, c: fx(k.c) } : { ...k, poly: k.poly.map(fx) }))
  const outlineP = left.outline.map(fx)
  const ctxP = { ...ctx, switches: left.switches.map(q => q.map(fx)), labels: labels.map(l => ({ size: 1.3, ...l, p: fx(l.p) })) }

  put(`cases/wireboard_${side}.jscad`, buildJscad(base, ctxP, exP, sleevesP))
  put(`wiring/wiring_map_${side}.svg`, svgMap(ctxP, exP, sleevesP, keepP, outlineP, `BirdBoard v4 wiring, ${side} half`))

  const lengths = wires.map(w => {
    const l = w.polys.filter(p => p.depth !== 'onmodule').reduce((s, p) => s + G.polyLength(p.pts), 0)
    return `| ${w.net} | ${w.name} | ${l.toFixed(0)} |`
  })
  const sleeveList = sleeves.map(c => { const q = ctx.show(c.p); return `| ${c.shallow.net} over ${c.deep.net} | (${q[0].toFixed(1)}, ${q[1].toFixed(1)}) | ${c.angle.toFixed(0)} |` })
  put(`wiring/report_${side}.md`, `# BirdBoard v4 wiring report: ${side} half

Generated by \`wiring/build.js\`. Coordinates are in mm from the inner column's top key, x right, y up, seen from the front.
Map: \`wiring/wiring_map_${side}.svg\` (its back view is mirrored, as you see the board when wiring it).

## MCU pin map

${pins}

## Assembly order

${ASSEMBLY[side]}

## Checks

${errors.length ? errors.map(e => `- ERROR: ${e}`).join('\n') : '- no clashes'}
${warnings.map(e => `- warning: ${e}`).join('\n')}

## Wires

Lengths are along the channel; add about 10 mm per end for soldering.

| net | wire | length (mm) |
|---|---|---|
${lengths.join('\n')}

## Heat-shrink sleeves (${sleeves.length})

Slide one ~${SET.sleeve.len} mm sleeve onto the row (or link) wire at each crossing before laying it.

| crossing | at | angle (deg) |
|---|---|---|
${sleeveList.join('\n')}
`)
  say(`wiring ${side}: ${wires.length} wires, ${ex.segs.length} segments, ${ex.vias.length} holes, ${sleeves.length} sleeves`)
  for (const w of warnings) say(`wiring ${side} warning: ${w}`)
  for (const e of errors) say(`wiring ${side} ERROR: ${e}`)
  return errors.length
}

// ---------- main ----------
const build = async ({ echo = false } = {}) => {
  const log = []
  const say = s => { log.push(s); if (echo) console.log(s) }
  let results, text
  try {
    injectFootprints()
    text = fs.readFileSync(path.join(ROOT, 'config.yaml'), 'utf8')
    results = await ergogen.process(text, { debug: true }, s => say(s))
  } catch (err) {
    say(String(err && err.stack || err))
    return { code: 1, log: log.join('\n') }
  }
  const put = writeErgogenOutputs(results)
  try {
    const P = results.points, U = results.units
    const K = (k, x, y) => {
      const p = P[k]
      if (!p) throw new Error(`wiring: unknown key ${k}`)
      const [rx, ry] = G.rot([x, y], p.r)
      return [p.x + rx, p.y + ry]
    }
    const O = [P.matrix_inner_top.x, P.matrix_inner_top.y]
    const S = (x, y) => [O[0] + x, O[1] + y]
    const at = spec => { const p = anchor(spec, 'wiring', P)(U); return [p.x - O[0], p.y - O[1]] }
    const thumbEdge = { ref: 'thumbfan_home_thumb', shift: ['0.75px', '-0.5py'], affect: 'x' }
    const fromEdge = (x, y) => at([{ ref: 'matrix_inner_top' }, thumbEdge, { shift: [x, y] }])
    const keyNames = Object.keys(P)
    // mounting holes = circles of the mount_holes outline (from its DXF model)
    const mountHoles = []
    makerjs.model.walk(results.outlines.mount_holes.yaml, { onPath: w => { if (w.pathContext.type === 'circle') mountHoles.push(makerjs.point.add(w.pathContext.origin, w.offset)) } })
    // board outline (key area + strip, before the module cutouts)
    const chains = makerjs.model.findChains(results.outlines._pcb_full.yaml)
    const outline = makerjs.chain.toKeyPoints(chains.sort((a, b) => b.pathLength - a.pathLength)[0], 0.5)
    const left = {
      P, U, K, S, O, keyNames, mountHoles, outline,
      M: fromEdge('mcu_x', 'mcu_y'),
      L: fromEdge('link_x', 'link_y'),
      edgeX: fromEdge(0, 0)[0],
      mcuCut: fromEdge('mcu_x', 'mcu_y + (mcu_cut_up - mcu_cut_down) / 2'),
      linkCut: fromEdge('link_x + link_cut_start + link_cut_len / 2', 'link_y'),
      switches: keyNames.map(k => G.rectPoly(0, 0, 14, 14, p => K(k, p[0], p[1]))),
    }
    let clashes = doHalf({ side: 'left', mirror: false, base: results.cases.wireboard_base.jscad, left, put, say })

    // right half: a mirrored run of the same config, then the mirrored routes
    const right = mirroredRun(text)
    writeCases(right.cases, '_right', put)
    clashes += doHalf({ side: 'right', mirror: true, base: right.cases.wireboard_base_right, left, put, say })
    return { code: 0, clashes, log: log.join('\n') }
  } catch (err) {
    say(String(err && err.stack || err))
    return { code: 1, log: log.join('\n') }
  }
}

module.exports = { build, SET }

if (require.main === module) build({ echo: true }).then(({ code, clashes }) => process.exit(code || (clashes ? 1 : 0)))
