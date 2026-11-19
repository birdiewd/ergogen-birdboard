// Builds the v4 keyboard: runs Ergogen on config.yaml + footprints/, then lays out the wire
// channels of the printed wiring board (wiring/routes.js), checks them and writes:
//   output/...                   everything Ergogen makes (outlines, cases, the map PCB)
//   output/cases/wireboard.jscad  the wiring board: Ergogen's `wireboard_base` + channels
//   output/pcbs/birdboard.kicad_pcb  gets the wire routes, holes and sleeve marks added
//   output/wiring/wiring_map.svg  assembly map (back view and front view)
//   output/wiring/report.md       pin map, wire lengths, sleeves, check results
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
  for (const [name, c] of Object.entries(results.cases)) if (!name.startsWith('_') && name !== 'wireboard_base') put(`cases/${name}.jscad`, c.jscad)
  return put
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
    // the point where a back channel meets the MCU (just before 'onmodule')
    w.polys.forEach((p, i) => { if (w.polys[i + 1] && w.polys[i + 1].depth === 'onmodule') ends.push(p.pts[p.pts.length - 1]) })
  }
  return { segs, vias, ends }
}

// ---------- keepouts ----------
const buildKeepouts = (ctx, results) => {
  const { P, U, K, keyNames } = ctx
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
  rect(sRect(M[0], M[1], U.mcu_w + 0.3, U.mcu_h + 0.3), [-1, U.mcu_pocket_d], 'MCU pocket', 'MCU')
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
  const fmt = p => `(${(p[0] - ctx.O[0]).toFixed(2)}, ${(p[1] - ctx.O[1]).toFixed(2)})`
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

// ---------- KiCad map ----------
const kicadMap = (pcb, ex, sleeves) => {
  const nets = new Map()
  for (const m of pcb.matchAll(/\(net (\d+) "([^"]*)"\)/g)) nets.set(m[2], Number(m[1]))
  const k = p => `${r4(p[0])} ${r4(-p[1])}`
  const lines = []
  for (const s of ex.segs) {
    if (s.depth === 'onmodule') continue
    const layer = s.depth === 'front' ? 'F.Cu' : 'B.Cu'
    const width = s.depth === 'deep' ? 0.9 : 0.6
    lines.push(`  (segment (start ${k(s.a)}) (end ${k(s.b)}) (width ${width}) (layer "${layer}") (net ${nets.get(s.net) || 0}))`)
  }
  for (const s of ex.segs.filter(s => s.depth === 'onmodule')) {
    lines.push(`  (gr_line (start ${k(s.a)}) (end ${k(s.b)}) (stroke (width 0.3) (type dash)) (layer "Eco1.User"))`)
  }
  for (const v of ex.vias) lines.push(`  (via (at ${k(v.p)}) (size 1.4) (drill ${SET.via}) (layers "F.Cu" "B.Cu") (net ${nets.get(v.net) || 0}))`)
  for (const c of sleeves) {
    lines.push(`  (gr_circle (center ${k(c.p)}) (end ${k(G.add(c.p, [1.2, 0]))}) (stroke (width 0.25) (type solid)) (fill none) (layer "Eco1.User"))`)
  }
  const i = pcb.lastIndexOf(')')
  return pcb.slice(0, i) + lines.join('\n') + '\n' + pcb.slice(i)
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

// ---------- main ----------
const build = async ({ echo = false } = {}) => {
  const log = []
  const say = s => { log.push(s); if (echo) console.log(s) }
  let results
  try {
    injectFootprints()
    const text = fs.readFileSync(path.join(ROOT, 'config.yaml'), 'utf8')
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
    const M = fromEdge('mcu_x', 'mcu_y')
    const L = fromEdge('link_x', 'link_y')
    const edgeX = fromEdge(0, 0)[0]
    const mcuCut = fromEdge('mcu_x', 'mcu_y + (mcu_cut_up - mcu_cut_down) / 2')
    const linkCut = fromEdge('link_x + link_cut_start + link_cut_len / 2', 'link_y')
    const keyNames = Object.keys(P)
    // mounting holes = circles of the mount_holes outline (from its DXF model)
    const holeModel = results.outlines.mount_holes.yaml
    const mountHoles = []
    makerjs.model.walk(holeModel, { onPath: w => { if (w.pathContext.type === 'circle') mountHoles.push(makerjs.point.add(w.pathContext.origin, w.offset)) } })
    // board outline (key area + strip, before the module cutouts)
    const chains = makerjs.model.findChains(results.outlines._pcb_full.yaml)
    const outline = makerjs.chain.toKeyPoints(chains.sort((a, b) => b.pathLength - a.pathLength)[0], 0.5)
    const switches = keyNames.map(k => G.rectPoly(0, 0, 14, 14, p => K(k, p[0], p[1])))
    const ctx = { P, U, K, S, O, M, L, edgeX, mcuCut, linkCut, keyNames, mountHoles, switches, labels: [] }

    const wires = require('./routes')({ K, S, U, M, L })
    const ex = expand(wires)
    const keepouts = buildKeepouts(ctx, results)
    const { errors, warnings, sleeves } = check(ctx, ex, keepouts, outline)

    // labels for the map: MCU pins in use, breakout pins
    const pinNames = { '-10.16L': '5V', '-7.62L': 'GND', '-2.54L': 'C0', '0L': 'C1', '2.54L': 'C2', '5.08L': 'R0', '7.62L': 'R1', '10.16L': 'R2', '-5.08B': 'C3', '-2.54B': 'C4', '0B': 'R3', '2.54B': 'C5', '10.16R': 'LINK' }
    for (const [key, name] of Object.entries(pinNames)) {
      const side = key.slice(-1), v = Number(key.slice(0, -1))
      const p = side === 'L' ? S(M[0] - 5.5, M[1] - v - 0.5) : side === 'R' ? S(M[0] + 5.5, M[1] - v - 0.5) : S(M[0] + v, M[1] - 8.2)
      ctx.labels.push({ p, text: name, size: 1.3, fill: '#000', side: 'back' })
    }
    for (const [py, name] of [[3.81, 'V'], [-1.27, 'D+'], [-3.81, 'G']]) ctx.labels.push({ p: S(L[0] - 2.2, L[1] - py - 0.5), text: name, size: 1.3 })
    ctx.labels.push({ p: S(M[0] - 4.2, M[1] + 10.16 - 0.5), text: '5V', size: 1.3, side: 'front' }, { p: S(M[0] - 4.2, M[1] + 7.62 - 0.5), text: 'GND', size: 1.3, side: 'front' },
      { p: S(M[0] + 4.6, M[1] - 10.16 - 0.5), text: 'LINK', size: 1.3, side: 'front' })
    ctx.labels.push({ p: S(M[0], M[1] + 3), text: 'RP2040-Zero', size: 2, side: 'back' }, { p: S(L[0] + 6, L[1]), text: 'USB-C', size: 2 })

    // JSCAD
    const base = results.cases.wireboard_base.jscad
    put('cases/wireboard.jscad', buildJscad(base, ctx, ex, sleeves))
    // KiCad map
    for (const [name, pcb] of Object.entries(results.pcbs)) put(`pcbs/${name}.kicad_pcb`, kicadMap(pcb, ex, sleeves))
    // SVG map
    put('wiring/wiring_map.svg', svgMap(ctx, ex, sleeves, keepouts, outline, 'BirdBoard v4 wiring'))

    // report
    const lengths = wires.map(w => {
      const l = w.polys.filter(p => p.depth !== 'onmodule').reduce((s, p) => s + G.polyLength(p.pts), 0)
      return `| ${w.net} | ${w.name} | ${l.toFixed(0)} |`
    })
    const perNet = {}
    for (const w of wires) perNet[w.net] = (perNet[w.net] || 0) + w.polys.reduce((s, p) => s + G.polyLength(p.pts), 0)
    const sleeveList = sleeves.map(c => `| ${c.shallow.net} over ${c.deep.net} | (${(c.p[0] - O[0]).toFixed(1)}, ${(c.p[1] - O[1]).toFixed(1)}) | ${c.angle.toFixed(0)} |`)
    const md = `# BirdBoard v4 wiring report

Generated by \`wiring/build.js\`. Coordinates are in mm from the inner column's top key, x right, y up (front view).
Left half only. Map: \`wiring/wiring_map.svg\` (back view is mirrored, as you see it when wiring).

## MCU pin map (RP2040-Zero, upside down, seen from the switch side)

- left, top to bottom: 5V, GND, 3V3 (unused), GP29 = C0, GP28 = C1, GP27 = C2, GP26 = R0, GP15 = R1, GP14 = R2
- bottom, left to right: GP13 = C3, GP12 = C4, GP11 = R3, GP10 = C5, GP9 free
- right, bottom: GP8 = LINK (to the breakout's D+)

## Assembly order

1. Print \`cases/wireboard.stl\` front face down (the switches need that face flat). The back's channels and pockets then face up and need no supports.
2. From the front, fit a 1N4148 per key: legs through the two holes, body in its pocket, cathode band towards the upper hole (the row).
3. Turn the board over. Press a hot-swap socket into each pocket. Bend the anode leg onto the socket's right tab and solder it.
4. Lay the bare column wires in the deep channels, from the bottom key up, soldering to each socket's left tab on the way. Then follow the shallow channels to the MCU.
5. Slide one ${SET.sleeve.len} mm heat-shrink sleeve onto a row (or link) wire for each crossing listed below. Lay the rows in the shallow channels with the sleeves in the wide pockets, and shrink them. Solder each cathode leg to its row wire.
6. Put the RP2040-Zero (component side towards the front) and the USB-C breakout in their pockets. Solder the back wires into the MCU's pad holes, at the edge of its board. Run 5V, GND and LINK in the front channels and push their ends down through the holes into the MCU's and the breakout's pad holes. Solder them on the back.
7. Check every row and column for continuity, and for shorts to its neighbours, before you fit the switches.

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
`
    put('wiring/report.md', md)
    say(`wiring: ${wires.length} wires, ${ex.segs.length} segments, ${ex.vias.length} holes, ${sleeves.length} sleeves`)
    for (const w of warnings) say(`wiring warning: ${w}`)
    for (const e of errors) say(`wiring ERROR: ${e}`)
    return { code: 0, clashes: errors.length, log: log.join('\n') }
  } catch (err) {
    say(String(err && err.stack || err))
    return { code: 1, log: log.join('\n') }
  }
}

module.exports = { build, SET }

if (require.main === module) build({ echo: true }).then(({ code, clashes }) => process.exit(code || (clashes ? 1 : 0)))
