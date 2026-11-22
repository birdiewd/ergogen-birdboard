// A small TrueType reader: glyph outlines and advance widths, so the key legends can be
// written as vector paths (the UV printer then never substitutes a font). Handles the
// TrueType outline format (glyf/loca, simple and composite glyphs) and the usual character
// maps (cmap formats 4 and 12). Fonts are read from where they are installed, never copied.

const fs = require('fs')

const open = file => {
  const b = fs.readFileSync(file)
  const u16 = o => b.readUInt16BE(o), i16 = o => b.readInt16BE(o), u32 = o => b.readUInt32BE(o)
  const tables = {}
  for (let i = 0, n = u16(4); i < n; i++) {
    const r = 12 + i * 16
    tables[b.toString('latin1', r, r + 4)] = u32(r + 8)
  }
  for (const t of ['head', 'maxp', 'cmap', 'loca', 'glyf', 'hhea', 'hmtx']) {
    if (tables[t] === undefined) throw new Error(`${file}: no ${t} table (only TrueType outline fonts are supported)`)
  }
  const unitsPerEm = u16(tables.head + 18), longLoca = i16(tables.head + 50) === 1
  const numGlyphs = u16(tables.maxp + 4), numHMetrics = u16(tables.hhea + 34)
  const ascender = i16(tables.hhea + 4), descender = i16(tables.hhea + 6)

  // character map: code point -> glyph index
  const cmap = new Map()
  let best = null
  for (let i = 0, n = u16(tables.cmap + 2); i < n; i++) {
    const r = tables.cmap + 4 + i * 8, pid = u16(r), eid = u16(r + 2), off = tables.cmap + u32(r + 4), fmt = u16(off)
    const rank = fmt === 12 ? 3 : (fmt === 4 && pid === 3 && eid === 1) ? 2 : fmt === 4 ? 1 : 0
    if (rank && (!best || rank > best.rank)) best = { off, fmt, rank }
  }
  if (!best) throw new Error(`${file}: no usable cmap`)
  if (best.fmt === 4) {
    const o = best.off, segs = u16(o + 6) / 2
    const ends = o + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2
    for (let s = 0; s < segs; s++) {
      const end = u16(ends + s * 2), start = u16(starts + s * 2), delta = i16(deltas + s * 2), ro = u16(ranges + s * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g
        if (ro === 0) g = (c + delta) & 0xffff
        else {
          const at = ranges + s * 2 + ro + (c - start) * 2
          g = u16(at); if (g) g = (g + delta) & 0xffff
        }
        if (g) cmap.set(c, g)
      }
    }
  } else {
    const o = best.off
    for (let i = 0, n = u32(o + 12); i < n; i++) {
      const r = o + 16 + i * 12, start = u32(r), end = u32(r + 4), g0 = u32(r + 8)
      for (let c = start; c <= end; c++) cmap.set(c, g0 + c - start)
    }
  }

  const loca = g => (longLoca ? u32(tables.loca + g * 4) : u16(tables.loca + g * 2) * 2)
  const advance = g => u16(tables.hmtx + Math.min(g, numHMetrics - 1) * 4)

  // glyph -> contours, each a list of { x, y, on } in font units
  const contoursOf = (g, depth = 0) => {
    if (g >= numGlyphs || depth > 8) return []
    const start = loca(g), end = loca(g + 1)
    if (end <= start) return []
    const o = tables.glyf + start, nc = i16(o)
    if (nc >= 0) {
      const endPts = Array.from({ length: nc }, (_, i) => u16(o + 10 + i * 2))
      const n = nc ? endPts[nc - 1] + 1 : 0
      let p = o + 10 + nc * 2
      p += 2 + u16(p)                       // skip the instructions
      const flags = []
      while (flags.length < n) {
        const f = b[p++]; flags.push(f)
        if (f & 8) { let r = b[p++]; while (r--) flags.push(f) }
      }
      const coord = (short, same) => {
        const out = []; let v = 0
        for (const f of flags) {
          if (f & short) { const d = b[p++]; v += (f & same) ? d : -d }
          else if (!(f & same)) { v += i16(p); p += 2 }
          out.push(v)
        }
        return out
      }
      const xs = coord(2, 16), ys = coord(4, 32)
      const contours = []
      let s = 0
      for (const e of endPts) {
        contours.push(Array.from({ length: e - s + 1 }, (_, k) => ({ x: xs[s + k], y: ys[s + k], on: !!(flags[s + k] & 1) })))
        s = e + 1
      }
      return contours
    }
    // composite: components placed by offset (and scale)
    const out = []
    let p = o + 10, more = true
    while (more) {
      const flags = u16(p), glyph = u16(p + 2); p += 4
      let dx, dy
      if (flags & 1) { dx = i16(p); dy = i16(p + 2); p += 4 } else { dx = b.readInt8(p); dy = b.readInt8(p + 1); p += 2 }
      let a = 1, bb = 0, c = 0, d = 1
      const f2 = q => i16(q) / 16384
      if (flags & 8) { a = d = f2(p); p += 2 }
      else if (flags & 0x40) { a = f2(p); d = f2(p + 2); p += 4 }
      else if (flags & 0x80) { a = f2(p); bb = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8 }
      if (!(flags & 2)) { dx = 0; dy = 0 }   // point-matched components: rare, placed unshifted
      for (const ct of contoursOf(glyph, depth + 1)) out.push(ct.map(q => ({ x: a * q.x + c * q.y + dx, y: bb * q.x + d * q.y + dy, on: q.on })))
      more = !!(flags & 0x20)
    }
    return out
  }

  // the characters the font has, as [first, last] code point ranges
  const ranges = () => {
    const cs = [...cmap.keys()].sort((a, b) => a - b), out = []
    for (const c of cs) { const r = out[out.length - 1]; if (r && c === r[1] + 1) r[1] = c; else out.push([c, c]) }
    return out
  }

  return { unitsPerEm, ascender, descender, glyph: c => cmap.get(c) || 0, has: c => cmap.has(c), advance, contoursOf, ranges }
}

// SVG path data for a contour list, scaled by k and placed at (x0, y0), y pointing down
// (kx: a different horizontal scale, to stretch a glyph sideways)
const pathOf = (contours, k, x0, y0, kx = k) => {
  const P = q => `${(x0 + q.x * kx).toFixed(3)} ${(y0 - q.y * k).toFixed(3)}`
  let d = ''
  for (const ct of contours) {
    if (!ct.length) continue
    // start on an on-curve point (or the midpoint of the first two off-curve ones)
    let i0 = ct.findIndex(q => q.on)
    const pts = i0 < 0 ? ct : [...ct.slice(i0), ...ct.slice(0, i0)]
    const start = i0 < 0 ? { x: (ct[0].x + ct[1].x) / 2, y: (ct[0].y + ct[1].y) / 2, on: true } : pts[0]
    d += `M${P(start)}`
    const seq = i0 < 0 ? [...pts, pts[0]] : [...pts.slice(1), pts[0]]
    let ctrl = null
    for (const q of seq) {
      if (q.on) { d += ctrl ? `Q${P(ctrl)} ${P(q)}` : `L${P(q)}`; ctrl = null }
      else if (ctrl) { const m = { x: (ctrl.x + q.x) / 2, y: (ctrl.y + q.y) / 2 }; d += `Q${P(ctrl)} ${P(m)}`; ctrl = q }
      else ctrl = q
    }
    if (ctrl) d += `Q${P(ctrl)} ${P(start)}`
    d += 'Z'
  }
  return d
}

// A text run set in `font` (falling back to `fallback` for characters it lacks) at a cap
// height of `size` mm: { d, dSym, width, height } with the run's left end at x = 0 and its
// baseline at y = 0. Height is the cap height (of "H"), so sizes match across fonts.
// Characters from the fallback (symbols: arrows, ⇧, ⏎ ...) are drawn `symScale` times larger
// and centred on the cap height, since symbol fonts draw them small and low; their outlines
// come back separately in dSym, so they can be drawn bolder.
const fonts = new Map()
const load = f => { if (!fonts.has(f)) fonts.set(f, open(f)); return fonts.get(f) }
const capHeight = font => {
  const cs = font.contoursOf(font.glyph(72))
  return cs.length ? Math.max(...cs.flat().map(q => q.y)) : font.ascender * 0.7
}
// Symbol blocks (arrows, technical and media symbols, shapes, dingbats, pictographs) always come
// from the symbol font when it has them, even if the text font has its own lighter versions,
// so every symbol is drawn the same way. The keymap planner uses the same list.
const SYMBOL_BLOCKS = [[0x2190, 0x21FF], [0x2300, 0x23FF], [0x2400, 0x243F], [0x25A0, 0x25FF], [0x2600, 0x27BF], [0x2900, 0x297F], [0x2B00, 0x2BFF], [0x1F300, 0x1FAFF]]
const inSymbolBlock = c => SYMBOL_BLOCKS.some(([a, b]) => c >= a && c <= b)
// Font Awesome icons (written :name: in a legend, see art/legends.js): icons = { fonts: {
// solid, regular, brands } (font files), codes: { name: { unicode, styles } }, scale }. An icon
// is `scale` times the cap height of its em square, its ink centred on the cap height, and
// goes into dSym like the symbols. Names the icon list doesn't have come back in `missing`.
const { pieces } = require('./legends')
const STYLES = ['solid', 'regular', 'brands']
const run = (text, { font, fallback, size, symScale = 1, stretch = {}, icons = null }) => {
  const F = load(font), B = fallback ? load(fallback) : null
  let x = 0, d = '', dSym = ''
  const missing = []
  const chars = []
  for (const p of pieces(text)) {
    if (p.text !== undefined) { for (const ch of [...p.text]) chars.push(ch); continue }
    const info = icons && icons.codes[p.icon]
    const style = info && (p.style && info.styles.includes(p.style) ? p.style : STYLES.find(s => info.styles.includes(s)))
    const file = style && icons.fonts[style]
    if (!file) { missing.push(p.style ? `${p.style}/${p.icon}` : p.icon); continue }
    chars.push({ icon: true, font: load(file), code: parseInt(info.unicode, 16) })
  }
  for (const ch of chars) {
    if (typeof ch !== 'string') {
      const f = ch.font, g = f.glyph(ch.code), contours = f.contoursOf(g)
      const k = size * (icons.scale || 1.3) / f.unitsPerEm
      const ys = contours.flat().map(q => q.y)
      const mid = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
      dSym += pathOf(contours, k, x, mid * k - size / 2)
      x += f.advance(g) * k
      continue
    }
    const c = ch.codePointAt(0)
    const sym = !!B && B.has(c) && (inSymbolBlock(c) || !F.has(c))
    const f = sym ? B : F
    const g = f.glyph(c), contours = f.contoursOf(g)
    if (!sym) {
      const k = size / capHeight(f)
      d += pathOf(contours, k, x, 0)
      x += f.advance(g) * k
      continue
    }
    // symbol: scaled up, its ink centred halfway up the cap height
    const k = size / capHeight(f) * symScale
    const ys = contours.flat().map(q => q.y)
    const mid = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
    // a stretched symbol is widened (its advance too), so it stays centred in its own room
    const s = stretch[ch] || 1, adv = f.advance(g) * k
    dSym += pathOf(contours, k, x, mid * k - size / 2, k * s)
    x += adv * s
  }
  return { d, dSym, width: x, height: size, missing }
}

module.exports = { open, run, SYMBOL_BLOCKS }
