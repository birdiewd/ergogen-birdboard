// Builds the v4.5 keyboard: runs Ergogen on config.yaml + footprints/, writes everything it
// makes, builds the right half's cases from a mirrored run, and draws the handwiring guide.
// The RP2040-Zero (USB to the computer) sits in a pod off the outer column's top key and the
// USB-C breakout (the link between the halves) in one off the inner column's; both ports
// come out of the top wall.
//   output/outlines, output/cases       everything Ergogen makes (left half)
//   output/cases/*_right.jscad          the same cases from a mirrored run (right half)
//   output/wiring/wiring_<half>.svg     wiring guide, seen from below (as you wire it)
//   output/wiring/report_<half>.md      pin map, assembly steps, wire lengths
//
// The build is handwired, as in the Scotto44: there is no PCB. Each switch's diode and the
// row and column wires (18 AWG solid copper) are soldered straight onto its pins.
//
// CLI:    node wiring/build.js        (same as `npm run build`)
// Module: require('./wiring/build').build() -> Promise<{ code, clashes, log }>
//   code 1 if Ergogen or the guide step fails (clashes is always 0; kept for the viewer).

const fs = require('fs')
const path = require('path')
const G = require('./geom')
const Inlay = require('../art/inlay')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'output')
const EG = fs.realpathSync(path.join(ROOT, 'node_modules', 'ergogen', 'src'))
const egRequire = require('module').createRequire(path.join(EG, 'cli.js'))
const makerjs = egRequire('makerjs')
const ergogen = require(path.join(EG, 'ergogen.js'))
const io = require(path.join(EG, 'io.js'))
const anchor = require(path.join(EG, 'anchor.js')).parse

// ---------- switch, diode and wiring geometry (key frame, seen from the front, mm) ----------
const PIN_COL = [-4.4, -4.7]     // Gateron LP KS-33 pin wired to the column
const PIN_DIO = [2.6, -5.75]     // the other pin: the diode's anode leg
const DIODE_X = 7.2              // 1N4148 body runs up beside the switch, in the gap to the next key
const ANODE = [DIODE_X, -5.75]   // anode leg bends over to PIN_DIO
const CATHODE = [DIODE_X, 4.41]  // cathode leg meets the row wire here
const MCU_LEG = 15               // extra wire to reach the MCU from a net's end, beyond the straight line

// Pin map (both halves wire the same, so one firmware matrix serves both)
const PINS = { C0: 'GP29', C1: 'GP28', C2: 'GP27', C3: 'GP13', C4: 'GP12', C5: 'GP10', R0: 'GP26', R1: 'GP15', R2: 'GP14', R3: 'GP11' }

// ---------- Ergogen ----------
const listJs = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? listJs(path.join(dir, e.name), base + e.name + '/') : e.name.endsWith('.js') ? [base + e.name] : [])

const injectFootprints = () => {
  const dir = path.join(ROOT, 'footprints')
  if (!fs.existsSync(dir)) return
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
  for (const [name, c] of Object.entries(cases)) if (!name.startsWith('_')) put(`cases/${name}${suffix}.jscad`, c.jscad || c)
}

// The right half: the same config with every point mirrored (x -> -x, rotations negated).
const mirroredRun = text => {
  const req = n => require(path.join(EG, n))
  let [config] = io.interpret(text, () => {})
  const prep = req('prepare.js')
  config = prep.parameterize(prep.inherit(prep.unnest(config)))
  const units = req('units.js').parse(config)
  const points = req('points.js').parse(config.points, units)
  for (const p of Object.values(points)) {
    p.x = -p.x
    p.r = -p.r
    p.meta.mirrored = true
  }
  const outlines = req('outlines.js').parse(config.outlines || {}, points, units)
  const cases = req('cases.js').parse(config.cases || {}, outlines, units)
  return { cases }
}

// ---------- guide ----------
const r2 = v => Math.round(v * 100) / 100
const COLOURS = { C: '#2b6cb0', R: '#c0392b' }

// Lays out one half's wiring. Everything is computed in the left half's frame; for the
// right half (mirror) each key's own parts are drawn mirrored there (the switches are the
// same part on both halves) and the result is mirrored into place at the end.
const layout = (L, mirror) => {
  const lx = mirror ? -1 : 1
  const fx = p => (mirror ? [-p[0], p[1]] : p)
  const K = (k, [x, y]) => fx(L.K(k, lx * x, y))
  const keys = L.keyNames.map(k => ({ name: k, meta: L.P[k].meta || {} }))
  const group = field => {
    const g = {}
    for (const k of keys) if (k.meta[field]) (g[k.meta[field]] = g[k.meta[field]] || []).push(k.name)
    return g
  }
  const M = fx(L.M), Lk = fx(L.L)
  // nets: columns through the column pins (bottom to top), rows through the cathodes (outer
  // to inner); each ends at the key nearest the MCU, where its wire to the MCU leaves
  const nets = []
  for (const [net, ks] of Object.entries(group('column_net'))) {
    const pts = ks.map(k => K(k, PIN_COL)).sort((a, b) => a[1] - b[1])
    nets.push({ net, pts })
  }
  for (const [net, ks] of Object.entries(group('row_net'))) {
    const pts = ks.map(k => K(k, CATHODE)).sort((a, b) => fx(a)[0] - fx(b)[0])   // outer first (left-frame x)
    nets.push({ net, pts })
  }
  for (const n of nets) {
    const a = n.pts[0], b = n.pts[n.pts.length - 1]
    n.end = G.dist(a, M) < G.dist(b, M) ? a : b
    n.length = G.polyLength(n.pts) + G.dist(n.end, M) + MCU_LEG
  }
  nets.sort((a, b) => a.net.localeCompare(b.net))
  // crossings: a column passes under a row; sleeve the column there
  const crossings = []
  for (const c of nets.filter(n => n.net[0] === 'C')) for (const r of nets.filter(n => n.net[0] === 'R'))
    for (let i = 1; i < c.pts.length; i++) for (let j = 1; j < r.pts.length; j++) {
      const x = G.segInter(c.pts[i - 1], c.pts[i], r.pts[j - 1], r.pts[j])
      if (x) crossings.push({ p: x, col: c.net, row: r.net })
    }
  return {
    nets, crossings, M, Lk,
    keys: keys.map(k => ({
      name: k.name,
      body: G.rectPoly(0, 0, 14, 14, p => K(k.name, p)),
      col: K(k.name, PIN_COL), dio: K(k.name, PIN_DIO), anode: K(k.name, ANODE), cathode: K(k.name, CATHODE),
      diode: G.rectPoly(DIODE_X, (ANODE[1] + CATHODE[1]) / 2, 1.9, 4, p => K(k.name, p)),
    })),
    outline: L.outline.map(fx),
    holes: L.mountHoles.map(fx),
    mcu: G.rectPoly(0, 0, L.U.mcu_w, L.U.mcu_h, p => G.add(M, p)),
    link: G.rectPoly(0, 0, L.U.usb_h, L.U.usb_w, p => G.add(Lk, p)),
  }
}

// Seen from below: mirrored left-right, as the board lies when you wire it.
const svgGuide = (g, title) => {
  const xs = g.outline.map(p => p[0]), ys = g.outline.map(p => p[1])
  const pad = 8
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const W = maxX - minX, H = maxY - minY
  const tx = p => maxX - p[0], ty = p => maxY - p[1]
  const P = p => `${r2(tx(p))},${r2(ty(p))}`
  const poly = (pts, attrs) => `<polygon points="${pts.map(P).join(' ')}" ${attrs}/>`
  const line = (a, b, attrs) => `<line x1="${r2(tx(a))}" y1="${r2(ty(a))}" x2="${r2(tx(b))}" y2="${r2(ty(b))}" ${attrs}/>`
  const text = (p, t, size = 1.6, attrs = '') => `<text x="${r2(tx(p))}" y="${r2(ty(p))}" font-size="${size}" font-family="sans-serif" text-anchor="middle" ${attrs}>${t}</text>`
  const s = []
  s.push(poly(g.outline, 'fill="#f4efe6" stroke="#555" stroke-width="0.3"'))
  for (const h of g.holes) s.push(`<circle cx="${r2(tx(h))}" cy="${r2(ty(h))}" r="1.1" fill="#fff" stroke="#888" stroke-width="0.2"/>`)
  for (const k of g.keys) s.push(poly(k.body, 'fill="#e6e0d4" stroke="#999" stroke-width="0.2"'))
  // wires to the MCU first, so the module boxes cover their ends
  for (const n of g.nets) s.push(line(n.end, g.M, `stroke="${COLOURS[n.net[0]]}" stroke-width="0.5" stroke-dasharray="1.2 0.8" stroke-opacity="0.7"`))
  s.push(line(g.M, g.Lk, 'stroke="#2a9d4a" stroke-width="0.6" stroke-dasharray="1.2 0.8"'))
  s.push(poly(g.mcu, 'fill="#3a3a3a" stroke="#000" stroke-width="0.2"'))
  s.push(poly(g.link, 'fill="#5a5a5a" stroke="#000" stroke-width="0.2"'))
  s.push(text(G.add(g.M, [0, 2]), 'RP2040-Zero', 2.2, 'fill="#fff"'), text(G.add(g.M, [0, -1.5]), 'wire by the pin', 1.5, 'fill="#ddd"'), text(G.add(g.M, [0, -3.5]), 'labels on the module', 1.5, 'fill="#ddd"'))
  s.push(text(g.Lk, 'USB-C', 2, 'fill="#fff"'), text(G.add(g.Lk, [0, -2.5]), 'V, G, D+', 1.5, 'fill="#ddd"'))
  for (const n of g.nets) s.push(`<polyline points="${n.pts.map(P).join(' ')}" fill="none" stroke="${COLOURS[n.net[0]]}" stroke-width="${n.net[0] === 'C' ? 1.1 : 0.9}" stroke-linejoin="round"/>`)
  for (const c of g.crossings) s.push(`<circle cx="${r2(tx(c.p))}" cy="${r2(ty(c.p))}" r="1.4" fill="#f1c40f" fill-opacity="0.8"/>`)
  for (const k of g.keys) {
    s.push(poly(k.diode, 'fill="#e67e22" stroke="#000" stroke-width="0.15"'))
    s.push(line(k.anode, k.dio, 'stroke="#555" stroke-width="0.35"'))
    // cathode band at the row end
    s.push(line(G.add(k.cathode, G.mul(G.sub(k.anode, k.cathode), 0.37)), G.add(k.cathode, G.mul(G.sub(k.anode, k.cathode), 0.33)), 'stroke="#000" stroke-width="1.8"'))
    s.push(`<circle cx="${r2(tx(k.col))}" cy="${r2(ty(k.col))}" r="0.8" fill="#fff" stroke="#000" stroke-width="0.25"/>`)
    s.push(`<circle cx="${r2(tx(k.dio))}" cy="${r2(ty(k.dio))}" r="0.8" fill="#fff" stroke="#000" stroke-width="0.25"/>`)
    s.push(`<circle cx="${r2(tx(k.cathode))}" cy="${r2(ty(k.cathode))}" r="0.5" fill="#c0392b"/>`)
  }
  for (const n of g.nets) s.push(text(G.add(n.end, n.net[0] === 'C' ? [0, 2.2] : [0, 1.6]), `${n.net} ${PINS[n.net]}`, 1.7, `font-weight="bold" fill="${COLOURS[n.net[0]]}"`))
  const legend = [[COLOURS.C, 'column wire, on the switches\' column pins (heat shrink it)'], [COLOURS.R, 'row wire, on the diodes\' cathode legs (bare)'], ['#e67e22', '1N4148: anode leg to the other pin, band towards the row'], ['#f1c40f', 'column passes a row: keep the heat shrink here'], ['#2a9d4a', 'MCU to breakout: 5V to V, GND to G, GP8 to D+']]
  const lg = legend.map(([c, t], i) => `<rect x="2" y="${H + 10 + i * 4}" width="6" height="2.4" fill="${c}"/><text x="10" y="${H + 12 + i * 4}" font-size="2.4" font-family="sans-serif">${t}</text>`).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H + 32)}" width="${r2(W * 5)}" height="${r2((H + 32) * 5)}">
<rect width="100%" height="100%" fill="#fff"/>
<text x="2" y="5" font-size="3.4" font-family="sans-serif" font-weight="bold">${title}: seen from below (switch plate face down, as you wire it)</text>
<g transform="translate(0,7)">
${s.join('\n')}
</g>
${lg}
</svg>`
}

const ASSEMBLY = half => `1. Print \`stl/switchplate${half === 'right' ? '_right' : ''}.stl\` plate side down, then clip a switch into every cutout from the top. Lay the plate face down.
2. Fit a 1N4148 on every switch: the anode leg (the end without the band) bent over to the switch pin nearer the middle of the key and soldered there, the body standing beside the switch, and the cathode leg pointing along the row. The band faces the row wire.
3. Rows: lay a bare 18 AWG wire along each row over the cathode legs (red on the guide) and solder each leg to it. Trim the legs.
4. Columns: cut each column wire to length, slide heat shrink over every stretch between two switches (the yellow marks show where it passes over a row), strip it at each column pin and solder it to the pins (blue).
5. Put the RP2040-Zero in its seat in the pod by the outer column and the USB-C breakout in its seat in the pod by the inner column, both component side up with their ports at the top wall, on double-sided tape.
6. Wire each row and column from its end (labelled on the guide) to its MCU pin, going by the pin labels printed on the module, and 5V to the breakout's V, GND to G and GP8 to D+ (these three run across the half, from pod to pod). Keep every wire low, under the plate's standoff height.
7. Check every key (press it) for continuity from its column's MCU pin to its row's MCU pin, and the rows and columns for shorts to each other.
8. Screw the switch plate onto the standoffs (M2 into heat-set inserts). It covers both pods.`

const report = (g, half) => `# BirdBoard v4.5 wiring guide: ${half} half

Generated by \`wiring/build.js\`. Guide: \`wiring/wiring_${half}.svg\` (seen from below, as you wire it).

Handwired, as in the Scotto44: the switches clip into the printed plate, and the diodes and the 18 AWG solid copper rows and columns are soldered straight onto the switch pins.

## MCU pin map

Both halves are wired the same (component side up):

| net | RP2040-Zero pin | runs |
|---|---|---|
${g.nets.map(n => `| ${n.net} | ${PINS[n.net]} | ${n.net[0] === 'C' ? 'column' : 'row'} |`).join('\n')}
| 5V | 5V | to the breakout's V |
| GND | GND | to the breakout's G |
| LINK | GP8 | to the breakout's D+ (serial between the halves) |

## Assembly order

${ASSEMBLY(half)}

## Parts

- ${g.keys.length} switches (Gateron LP KS-33), ${g.keys.length} 1N4148 diodes
- heat shrink for the column wires: ${g.crossings.length} places where a column passes a row

## Wires

Lengths run along the guide from switch to switch, plus the stretch to the MCU and ${MCU_LEG} mm to spare.

| net | MCU pin | keys | length (mm) |
|---|---|---|---|
${g.nets.map(n => `| ${n.net} | ${PINS[n.net]} | ${n.pts.length} | ${n.length.toFixed(0)} |`).join('\n')}
`

// ---------- assembled view ----------
// Where each case sits when the keyboard is put together, for the viewer (the STLs stay in
// their print positions): the plate on the standoffs, and the right half (mirrored about
// x = 0 by the build) moved across so the two inner edges face each other HALF_GAP apart.
const HALF_GAP = 40
const placement = (results, U) => {
  const ext = makerjs.measure.modelExtents(results.outlines.case_outer.yaml)
  const dx = 2 * ext.high[0] + HALF_GAP
  const z = { switchplate: U.plate_z }
  const out = {}
  for (const name of Object.keys(results.cases)) {
    if (name.startsWith('_')) continue
    out[`cases/${name}.stl`] = [0, 0, z[name] || 0]
    out[`cases/${name}_right.stl`] = [dx, 0, z[name] || 0]
  }
  out['cases/keyboard_case_art.stl'] = [0, 0, 0]
  out['cases/keyboard_case_art_right.stl'] = [dx, 0, 0]
  out['cases/switchplate_text.stl'] = [0, 0, U.plate_z]
  out['cases/switchplate_text_right.stl'] = [dx, 0, U.plate_z]
  return out
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
    return { code: 1, clashes: 0, log: log.join('\n') }
  }
  const put = writeErgogenOutputs(results)
  try {
    const P = results.points, U = results.units
    const K = (k, x, y) => {
      const p = P[k]
      const [rx, ry] = G.rot([x, y], p.r)
      return [p.x + rx, p.y + ry]
    }
    const at = spec => { const p = anchor(spec, 'wiring', P)(U); return [p.x, p.y] }
    const mountHoles = []
    makerjs.model.walk(results.outlines.mount_holes.yaml, { onPath: w => { if (w.pathContext.type === 'circle') mountHoles.push(makerjs.point.add(w.pathContext.origin, w.offset)) } })
    const chains = makerjs.model.findChains(results.outlines._inside.yaml)
    const outline = makerjs.chain.toKeyPoints(chains.sort((a, b) => b.pathLength - a.pathLength)[0], 0.5)
    const L = {
      P, U, K, keyNames: Object.keys(P), mountHoles, outline,
      M: at([{ ref: 'matrix_outer_top', shift: ['mcu_cx', 'mcu_cy'] }]),
      L: at([{ ref: 'matrix_inner_top', shift: ['link_cx', 'link_cy'] }]),
    }
    for (const [half, mirror] of [['left', false], ['right', true]]) {
      const g = layout(L, mirror)
      put(`wiring/wiring_${half}.svg`, svgGuide(g, `BirdBoard v4.5 wiring, ${half} half`))
      put(`wiring/report_${half}.md`, report(g, half))
      say(`wiring ${half}: ${g.keys.length} keys, ${g.nets.length} nets, ${g.crossings.length} column/row crossings`)
    }
    const right = mirroredRun(text)
    writeCases(right.cases, '_right', put)
    // the moose on the underside: cut into each case, plus one body per colour
    const caseChains = makerjs.model.findChains(results.outlines.case_outer.yaml)
    const caseOutline = makerjs.chain.toKeyPoints(caseChains.sort((a, b) => b.pathLength - a.pathLength)[0], 0.5)
    const o = P.matrix_outer_top
    const headChains = makerjs.model.findChains(results.outlines._head.yaml)
    // (the insert holes are blind, from the floor up, so nothing on the underside has to keep
    // clear of them)
    const head = makerjs.chain.toKeyPoints(headChains.sort((a, b) => b.pathLength - a.pathLength)[0], 0.5)
    const art = require('../art/moose')({ at: (x, y) => [o.x + x - 100, o.y + y + 62], head })
    // The case's bottom, rebuilt in 0.1 mm slices up to the top of the chamfer or the art,
    // whichever is higher: the floor's outline in each slice (inset by what the 45 degree
    // chamfer takes at the slice's middle), minus the art in the slices the art fills
    const dzs = 0.1, hi = Math.max(U.case_chamfer, U.art_depth)
    const slicesAt = mirror => Array.from({ length: Math.round(hi / dzs) }, (_, i) => {
      const z0 = i * dzs, z1 = (i + 1) * dzs, d = U.case_chamfer - (z0 + z1) / 2
      return { z0, z1, footprint: d > 0 ? Inlay.polyExpr(Inlay.inset(caseOutline, d).map(p => (mirror ? [-p[0], p[1]] : p))) : 'case_outer_2d()' }
    })
    for (const [suffix, mirror, base] of [['', false, results.cases.keyboard_case.jscad], ['_right', true, right.cases.keyboard_case.jscad || right.cases.keyboard_case]]) {
      // the art never reaches the chamfer
      const inlay = Inlay.build({ art, holes: [], depth: U.art_depth, outline: caseOutline, mirror, edge: U.case_chamfer })
      put(`cases/keyboard_case${suffix}.jscad`, inlay.caseWith(Inlay.with2d(base, 'case_outer'), slicesAt(mirror)))
      put(`cases/keyboard_case_art${suffix}.jscad`, inlay.art)
      put(`art/moose${suffix || '_left'}.svg`, Inlay.preview(inlay.flat, caseOutline.map(p => (mirror ? [-p[0], p[1]] : p)), []))
      for (const w of inlay.warnings) say(`art${suffix} warning: ${w}`)
    }
    // "moose" on the plate's top face, below the thumb cluster: the word runs parallel to the
    // board's bottom edge there, centred in the band between the keycaps and the edge
    const edgeA = K('mod_ring_thumb', 0.5 * U.px, -0.5 * U.py - U.mount_pad)
    const edgeB = K('thumbfan_home_thumb', -0.75 * U.px - U.mount_pad, -0.5 * U.py)
    const textAngle = Math.atan2(edgeB[1] - edgeA[1], edgeB[0] - edgeA[0]) * 180 / Math.PI
    const textCentre = G.add(K('thumbfan_outer_thumb', 7, -15.8), G.rot([3.5, 0], textAngle))
    const keycaps = Object.values(P).map(p => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
      G.add([p.x, p.y], G.rot([a * ((p.meta.width || U.kx) - 0.5) / 2, b * ((p.meta.height || U.ky) - 0.5) / 2], p.r))))
    for (const [suffix, mirror, base] of [['', false, results.cases.switchplate.jscad], ['_right', true, right.cases.switchplate.jscad || right.cases.switchplate]]) {
      const fx = p => (mirror ? [-p[0], p[1]] : p)
      const text = require('../art/text')({ centre: fx(textCentre), angle: mirror ? -textAngle : textAngle })
      const inlay = Inlay.build({ art: text, holes: mountHoles.map(fx), holeR: U.hole_d / 2 + 0.4, depth: U.art_depth, outline: outline.map(fx), top: U.frame_t + U.plate_t })
      // the plate's top layer, from the text's depth up, rebuilt from the plate outline
      const top = U.frame_t + U.plate_t
      put(`cases/switchplate${suffix}.jscad`, inlay.caseWith(Inlay.with2d(base, 'plate'), [{ z0: top - U.art_depth, z1: top, footprint: 'plate_2d()' }]))
      put(`cases/switchplate_text${suffix}.jscad`, inlay.art)
      put(`art/text${suffix || '_left'}.svg`, Inlay.preview(inlay.flat, outline.map(fx), mountHoles.map(fx), { case: '#7a5536', art: '#f2ead8' }, { fromTop: true, extra: keycaps.map(k => k.map(fx)) }))
      for (const w of inlay.warnings) say(`text${suffix} warning: ${w}`)
      for (const p of inlay.flat.lines.flatMap(l => l.pts)) {
        const k = keycaps.find(c => G.pointPoly(fx(p), c).inside)
        if (k) { say(`text${suffix} warning: hidden under a keycap at (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`); break }
      }
    }
    put('cases/placement.json', JSON.stringify(placement(results, U), null, 2))
    return { code: 0, clashes: 0, log: log.join('\n') }
  } catch (err) {
    say(String(err && err.stack || err))
    return { code: 1, clashes: 0, log: log.join('\n') }
  }
}

module.exports = { build }

if (require.main === module) build({ echo: true }).then(({ code }) => process.exit(code))
