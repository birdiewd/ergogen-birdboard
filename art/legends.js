// Where each legend goes on a keycap's top, shared by the keymap planner (in the browser) and
// the UV print export (in Node), so the plan and the print match. Cap-local coordinates: mm,
// origin at the middle of the cap's flat top, y pointing down (as in SVG).
//
// Every legend has a position on the cap: "left" or "right" (the middle of that edge), or a
// corner: "top-left", "top-right", "bottom-left", "bottom-right". Each layer's is its side; the
// base legend's is style.base.side, which can also be "middle" (the default), and the shift
// legend's style.shift.side, which can also be "top" (centred along the top, the default). A key
// with only a base legend has it in the middle whatever style.base.side says. Two
// corner legends in the same row shrink together if they'd run into each other. A key's
// baseColor, a layer's id or 'shift', draws its base legend in that colour (e.g. for the key
// that switches to the layer), and a key's capColor fills its top with one (capFill). A
// middle base legend and a top shift legend stay centred if they can, slide clear of the
// other legends if they must, and shrink only when there isn't room.
//
// place(key legends, cap top { w, h }, keymap style, layers, measure) -> [{ text, x, y, size,
//   color, anchor: 'start' | 'middle' | 'end' }], x/y the anchor point on the baseline.
// measure(text, size) gives a run's width in mm at that cap height.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.Legends = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  const GAP = 0.8      // between the base legend and a side legend
  const MIN = 0.45     // the base legend shrinks to no less than this share of its size

  const POSITIONS = ['left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

  // A legend's text and Font Awesome icons: an icon is written by name between colons,
  // :volume-high:, or with its style, :regular/keyboard: or :brands/apple: (solid if not
  // given). Anything else, a lone ":" included, is text.
  // pieces('Vol :volume-high:') -> [{ text: 'Vol ' }, { icon: 'volume-high', style: null }]
  const ICON = /:(?:(solid|regular|brands)\/)?([a-z0-9]+(?:-[a-z0-9]+)*):/g
  const pieces = text => {
    const out = []
    let at = 0
    for (const m of (text || '').matchAll(ICON)) {
      if (m.index > at) out.push({ text: text.slice(at, m.index) })
      out.push({ icon: m[2], style: m[1] || null })
      at = m.index + m[0].length
    }
    if (at < (text || '').length) out.push({ text: text.slice(at) })
    return out
  }

  // a centred legend between L and R: stays at x = 0 if it fits, slides clear if it doesn't,
  // shrinks (to no less than MIN of `size`) only when L..R is too short
  const centred = (text, size, L, R, measure) => {
    let s = size, w = measure(text, s)
    if (w > R - L) { s = Math.max(size * MIN, size * (R - L) / w); w = measure(text, s) }
    const x = w <= R - L ? Math.min(Math.max(0, L + w / 2), R - w / 2) : (L + R) / 2
    return { size: s, w, x }
  }
  const overlaps = (a, b) => a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP / 2 && b.y0 < a.y1 + GAP / 2

  const place = (legends, top, style, layers, measure) => {
    const out = [], boxes = []
    // the legends' padding from the top's edges: padX from the left and right, padY from the
    // top and bottom (an older plan's single inset does for both)
    const sideSize = style.side.size
    const padX = style.side.padX ?? style.side.inset ?? 1.4, padY = style.side.padY ?? style.side.inset ?? 1.4
    const W = top.w / 2 - padX, H = top.h / 2 - padY   // the usable half-width and half-height
    const sh = style.shift || { size: sideSize, color: style.base.color }
    // a key with only a base legend has it in the middle, wherever base legends go otherwise
    const alone = !!(legends && legends.base) && !(legends.shift || layers.some(l => legends[l.id]))
    const baseSide = !alone && POSITIONS.includes(style.base.side) ? style.base.side : 'middle'
    const shiftSide = POSITIONS.includes(sh.side) ? sh.side : 'top'
    // the legends at an edge or corner: the layers', and the base and shift legends if theirs
    // are set to one
    const edge = []
    for (const layer of layers) {
      const text = (legends && legends[layer.id]) || ''
      if (text) edge.push({ text, pos: POSITIONS.includes(layer.side) ? layer.side : 'left', size: sideSize, color: layer.color, layer: layer.id })
    }
    if (baseSide !== 'middle' && legends && legends.base) {
      edge.push({ text: legends.base, pos: baseSide, size: style.base.size, color: colorOf(legends.baseColor, style, layers) || style.base.color, layer: 'base' })
    }
    if (shiftSide !== 'top' && legends && legends.shift) edge.push({ text: legends.shift, pos: shiftSide, size: sh.size, color: sh.color, layer: 'shift' })
    // each row's legends (top, middle, bottom) shrink together, no smaller than MIN, if the
    // left one and the right one would run into each other or past the edge
    for (const row of ['top', 'mid', 'bottom']) {
      const rowOf = e => (e.pos.startsWith('top') ? 'top' : e.pos.startsWith('bottom') ? 'bottom' : 'mid')
      const inRow = edge.filter(e => rowOf(e) === row)
      const width = side => Math.max(0, ...inRow.filter(e => e.pos.endsWith(side)).map(e => measure(e.text, e.size)))
      const wl = width('left'), wr = width('right'), room = 2 * W - (wl && wr ? GAP : 0)
      if (wl + wr > room) { const f = Math.max(MIN, room / (wl + wr)); for (const e of inRow) e.size *= f }
    }
    const used = {}
    for (const e of edge) {
      const w = measure(e.text, e.size)
      used[e.pos] = Math.max(used[e.pos] || 0, w)
      const left = e.pos.endsWith('left')
      const y = e.pos.startsWith('top') ? -H + e.size : e.pos.startsWith('bottom') ? H : e.size / 2
      const x = left ? -W : W
      out.push({ text: e.text, x, y, size: e.size, color: e.color, anchor: left ? 'start' : 'end', layer: e.layer })
      boxes.push({ x0: left ? x : x - w, x1: left ? x + w : x, y0: y - e.size, y1: y })
    }
    const room = (a, b) => [-W + (used[a] ? used[a] + GAP : 0), W - (used[b] ? used[b] + GAP : 0)]

    // shift (when it's "top"): centred along the top, clear of any top-corner legends
    const shift = shiftSide === 'top' ? (legends && legends.shift) || '' : ''
    if (shift) {
      const { size, w, x } = centred(shift, sh.size, ...room('top-left', 'top-right'), measure)
      const y = -H + size
      out.push({ text: shift, x, y, size, color: sh.color, anchor: 'middle', layer: 'shift' })
      boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: y - size, y1: y })
    }

    // base (when it's "middle"): centred on the cap whether or not there's a shift legend,
    // clear of the edge legends; smaller if it would still run into the shift or a corner legend
    const base = baseSide === 'middle' ? (legends && legends.base) || '' : ''
    if (base) {
      const mid = 0
      const [L, R] = room('left', 'right')
      let c = centred(base, style.base.size, L, R, measure)
      const boxOf = c => ({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, y0: mid - c.size / 2, y1: mid + c.size / 2 })
      while (boxes.some(b => overlaps(boxOf(c), b)) && c.size > style.base.size * MIN + 1e-6) {
        c = centred(base, Math.max(style.base.size * MIN, c.size * 0.95), L, R, measure)
      }
      // a key can colour its base legend as a layer (baseColor: the layer's id), e.g. the key
      // that switches to that layer
      const tint = colorOf(legends.baseColor, style, layers)
      out.push({ text: base, x: c.x, y: mid + c.size / 2, size: c.size, color: tint || style.base.color, anchor: 'middle', layer: 'base' })
    }
    return out
  }

  // the colour a key's baseColor or capColor names: 'shift' (the shift legends' colour) or a
  // layer's id; null for anything else
  const colorOf = (id, style, layers) => {
    if (!id) return null
    if (id === 'shift') return style.shift.color
    const l = layers.find(l => l.id === id)
    return l ? l.color : null
  }

  // the colour of a key's top: the cap colour, or capColor's; and whether it's capColor's (so
  // the print file fills the top with it)
  const capFill = (legends, style, layers) => {
    const tint = colorOf(legends && legends.capColor, style, layers)
    return { color: tint || style.capColor, tinted: !!tint }
  }

  return { place, pieces, capFill, colorOf, POSITIONS, BASE_POSITIONS: ['middle', ...POSITIONS], SHIFT_POSITIONS: ['top', ...POSITIONS] }
})
