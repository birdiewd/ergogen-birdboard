// Where each legend goes on a keycap's top, shared by the keymap planner (in the browser) and
// the UV print export (in Node), so the plan and the print match. Cap-local coordinates: mm,
// origin at the middle of the cap's flat top, y pointing down (as in SVG).
//
// The base legend sits in the middle. Each layer's legend sits at its position, smaller and in
// the layer's colour: "left" or "right" (the middle of that edge), or a corner: "top-left",
// "top-right", "bottom-left", "bottom-right". A shift legend sits centred along the top, and
// the base legend moves down into the space below it. The shift and base legends stay
// centred if they can, slide clear of a layer legend if they must, and shrink only when there
// isn't room.
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
    const inset = style.side.inset, sideSize = style.side.size
    const W = top.w / 2 - inset, H = top.h / 2 - inset   // the usable half-width and half-height
    const used = {}
    for (const layer of layers) {
      const text = (legends && legends[layer.id]) || ''
      if (!text) continue
      const pos = POSITIONS.includes(layer.side) ? layer.side : 'left'
      const w = measure(text, sideSize)
      used[pos] = Math.max(used[pos] || 0, w)
      const left = pos.endsWith('left')
      const y = pos.startsWith('top') ? -H + sideSize : pos.startsWith('bottom') ? H : sideSize / 2
      const x = left ? -W : W
      out.push({ text, x, y, size: sideSize, color: layer.color, anchor: left ? 'start' : 'end', layer: layer.id })
      boxes.push({ x0: left ? x : x - w, x1: left ? x + w : x, y0: y - sideSize, y1: y })
    }
    const room = (a, b) => [-W + (used[a] ? used[a] + GAP : 0), W - (used[b] ? used[b] + GAP : 0)]

    // shift: centred along the top, clear of any top-corner legends
    const shift = (legends && legends.shift) || ''
    const sh = style.shift || { size: sideSize, color: style.base.color }
    let top0 = -H
    if (shift) {
      const { size, w, x } = centred(shift, sh.size, ...room('top-left', 'top-right'), measure)
      const y = -H + size
      out.push({ text: shift, x, y, size, color: sh.color, anchor: 'middle', layer: 'shift' })
      boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: y - size, y1: y })
      top0 = y + GAP
    }

    // base: centred (below the shift legend, if any), clear of the edge legends; smaller if
    // it would still run into a corner legend
    const base = (legends && legends.base) || ''
    if (base) {
      const mid = shift ? (top0 + H) / 2 : 0
      const [L, R] = room('left', 'right')
      let size = shift ? Math.max(style.base.size * MIN, Math.min(style.base.size, 2 * (H - mid))) : style.base.size
      let c = centred(base, size, L, R, measure)
      const boxOf = c => ({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, y0: mid - c.size / 2, y1: mid + c.size / 2 })
      while (boxes.some(b => overlaps(boxOf(c), b)) && c.size > style.base.size * MIN + 1e-6) {
        c = centred(base, Math.max(style.base.size * MIN, c.size * 0.95), L, R, measure)
      }
      out.push({ text: base, x: c.x, y: mid + c.size / 2, size: c.size, color: style.base.color, anchor: 'middle', layer: 'base' })
    }
    return out
  }

  return { place, pieces, POSITIONS }
})
