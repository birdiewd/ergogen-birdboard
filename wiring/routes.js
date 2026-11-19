// Wire routes for the v4 printed wiring board.
//
// Every wire is a polyline of board points (ergogen coordinates, y up, mm), split into
// stretches that each say where the wire runs:
//   'deep'      back channel deep enough to lie on a socket's solder tab (columns)
//   'shallow'   back channel near the back face (rows, the column bundle, MCU links)
//   'front'     front channel, under the MCU cover (power and the link line)
//   'onmodule'  over the RP2040-Zero's own board to one of its pad holes (no channel)
// Every MCU pin in use gets a hole through the wiring board under its pad hole, so each wire
// goes right through the module and into the board, like a header pin: easy to solder, and
// together they hold the module in place.
// A 'via' marker puts a hole through the board at the current point: where a front wire
// drops into a pad hole of the MCU or the breakout.
// A shallow wire may cross a deep one: the build checks every crossing, gives it a sleeve
// pocket and marks it on the map. Any other crossing is an error.
//
// Coordinates: K(key, x, y) is a point in that key's own frame (x right, y up, before the
// key's rotation). S(x, y) is a point in the strip, relative to the inner column's top key.

module.exports = ({ K, S, U, M, L }) => {
  const wires = []
  const W = (net, name, ...parts) => wires.push({ net, name, parts })
  const O = S(0, 0)
  const rel = p => [p[0] - O[0], p[1] - O[1]]      // board point -> strip coordinates

  // Per-key geometry (key frame). The column wire runs over the socket's left (column)
  // tab; the row wire runs through the diode's cathode hole, above the switch centre.
  const COL_X = -7.9                 // column wire: over the left tab, clear of the socket body
  const TAB_Y = -4.7                 // socket tab centre
  const ROW_Y = U.diode_k            // row wire height = cathode hole
  const DX = U.diode_x               // diode leg axis
  const GAP = 9.4                    // rows step between columns this far right of a key
  const tab = k => K(k, COL_X, TAB_Y)
  const cath = k => K(k, DX, ROW_Y)
  const rowR = k => K(k, GAP, ROW_Y)
  const rowL = k => K(k, -GAP, ROW_Y)

  // MCU pads (upside-down RP2040-Zero, footprint KiCad coordinates, y down; M is its
  // centre in strip coordinates) and the edge of its pocket where a back channel ends.
  const pad = (px, py) => S(M[0] + px, M[1] - py)
  const leftPad = py => [S(M[0] - U.mcu_w / 2, M[1] - py), 'onmodule', pad(-7.62, py), 'via']
  const bottomPad = px => [S(M[0] + px, M[1] - U.mcu_h / 2), 'onmodule', pad(px, 10.16), 'via']
  const padY = py => M[1] - py
  // USB-C breakout pad holes (upside down: V at the bottom, then D-, D+, G going up)
  const linkPad = py => S(L[0], L[1] - py)

  // Lanes in the strip (x in strip coordinates): left of the MCU the column bundle and R0
  // come down to the left pads; below it the thumb-side wires come up to the bottom pads,
  // each turning in at its own height (HOR) so they nest without crossing.
  const ZL = { R0: 9.4, C2: 10.65, C1: 11.9, C0: 13.15 }
  const LANE = { a: 11.9, b: 13.15, c: 14.4, d: 15.65 }
  const HOR = { a: -14.85, b: -16.1, c: -17.35, d: -18.6 }
  const R2_LANE = 10.65

  // ---------------- rows (shallow) ----------------
  const cols = ['outer', 'pinky', 'ring', 'middle', 'index', 'inner']
  const rowThrough = keys => {
    const pts = [cath(keys[0]), rowR(keys[0])]
    for (let i = 1; i < keys.length; i++) {
      const prev = rowR(keys[i - 1]), next = cath(keys[i])
      pts.push([prev[0], next[1]], next, rowR(keys[i]))
    }
    return pts
  }
  const matrixRow = r => cols.map(c => `matrix_${c}_${r}`)

  W('R0', 'row R0 (top)', 'shallow', ...rowThrough(matrixRow('top')), S(ZL.R0, padY(5.08)), ...leftPad(5.08))
  W('R1', 'row R1 (home)', 'shallow', ...rowThrough(matrixRow('home')), S(ZL.R0, padY(7.62)), ...leftPad(7.62))
  const r2 = rowThrough(matrixRow('bottom')).slice(0, -1)
  W('R2', 'row R2 (bottom)', 'shallow', ...r2, S(R2_LANE, rel(r2[r2.length - 1])[1]), S(R2_LANE, padY(10.16)), ...leftPad(10.16))

  // Thumb row: the three mod keys, then the thumb fan, then up the strip to GP11.
  const tfo = 'thumbfan_outer_thumb', fn = 'thumbfan_fn_thumb', home = 'thumbfan_home_thumb'
  const r3 = rowThrough(['mod_outer_thumb', 'mod_pinky_thumb', 'mod_ring_thumb'])
  r3.push([r3[r3.length - 1][0], cath(tfo)[1]], cath(tfo), rowR(tfo), rowL(fn), cath(fn), rowR(fn), cath(home))
  W('R3', 'row R3 (thumbs)', 'shallow', ...r3, S(LANE.c, -52.8), S(LANE.c, HOR.c), S(M[0], HOR.c), ...bottomPad(0))

  // ---------------- columns (deep under the keys) ----------------
  // Socket tabs from the bottom of the column to its top key.
  const colTabs = (c, withMod) => [...(withMod ? [`mod_${c}_thumb`] : []), ...['bottom', 'home', 'top'].map(r => tab(`matrix_${c}_${r}`))]
    .map(k => (typeof k === 'string' ? tab(k) : k))

  // Column bundle along the top edge, above row R0: C0, C1 and C2 rise from their top keys
  // and run to the strip, where they turn down to GP29, GP28 and GP27. In each top key's
  // region a lane sits at R0's height + BF, then BP per lane (C2 lowest, C0 highest).
  // Lanes step up left of R0's own step (upper lane first) and down right of it (lower
  // lane first), so they never cross each other or R0.
  const BF = 1.3, BP = 1.2
  const r0y = c => cath(`matrix_${c}_top`)[1]
  const lane = (j, c) => r0y(c) + BF + BP * j
  const kx = c => K(`matrix_${c}_top`, 0, 0)[0]
  const bundleCol = (net, c, j, py, lx) => {
    const top = tab(`matrix_${c}_top`)
    let y = lane(j, c)
    const pts = [[top[0], y]]
    const steps = []
    if (c === 'outer' || c === 'pinky') steps.push(['ring', kx('pinky') + [0, 8.0, 6.8][j]])
    steps.push(['middle', kx('ring') + [8.0, 6.8, 5.6][j]])
    steps.push(['index', kx('middle') + [10.6, 11.8, 13.0][j]])
    steps.push(['inner', kx('index') + [10.6, 11.8, 13.0][j]])
    for (const [to, x] of steps) {
      pts.push([x, y])
      y = lane(j, to)
      pts.push([x, y])
    }
    W(net, `column ${net}`, 'deep', ...colTabs(c, true), [top[0], r0y(c) + 0.9],
      'shallow', ...pts, S(lx, rel([0, y])[1]), S(lx, padY(py)), ...leftPad(py))
  }
  bundleCol('C0', 'outer', 2, -2.54, ZL.C0)
  bundleCol('C1', 'pinky', 1, 0, ZL.C1)
  bundleCol('C2', 'ring', 0, 2.54, ZL.C2)

  // Middle column, down to the thumb fan's outer key, and on under the MCU to GP13. The
  // branch down to the thumb key's socket leaves from the corner below the middle column.
  const yC3 = S(0, -47.0)[1]
  const tee3 = [tab(tfo)[0], yC3]
  W('C3', 'column C3', 'deep', ...colTabs('middle', false).reverse(), [tab('matrix_middle_bottom')[0], yC3], tee3,
    'shallow', [S(LANE.a, 0)[0], yC3], S(LANE.a, HOR.a), S(M[0] - 5.08, HOR.a), ...bottomPad(-5.08))
  W('C3', 'C3 to the thumb key', 'deep', tee3, tab(tfo))

  // Index column down to the thumb fan's middle key; from the corner above that key a link
  // runs along to GP12.
  const fnTop = K(fn, COL_X, 8)
  W('C4', 'column C4', 'deep', ...colTabs('index', false).reverse(), [tab('matrix_index_bottom')[0], fnTop[1]], fnTop, tab(fn))
  W('C4', 'C4 to the MCU', 'shallow', fnTop, [S(LANE.b, 0)[0], fnTop[1]], S(LANE.b, HOR.b), S(M[0] - 2.54, HOR.b), ...bottomPad(-2.54))

  // Inner column down past the thumb fan's middle key to the big thumb key, round that
  // key's bottom and right side, and up to GP10.
  W('C5', 'column C5', 'deep', ...colTabs('inner', false).reverse(), [tab('matrix_inner_bottom')[0], S(0, -52.5)[1]],
    K(fn, 10.6, 8), K(fn, 10.6, -9.2), tab(home), K(home, COL_X, -9.2), K(home, 10.2, -9.2), K(home, 10.2, 3.0),
    'shallow', S(LANE.d, -50.5), S(LANE.d, HOR.d), S(M[0] + 2.54, HOR.d), ...bottomPad(2.54))

  // ---------------- power and link (front, under the MCU cover) ----------------
  // Each drops through a hole into the MCU's pad hole at one end and the breakout's at the
  // other; both are soldered on the back.
  const v5 = pad(-7.62, -10.16), gnd = pad(-7.62, -7.62), lk = pad(7.62, 10.16)
  const fx = x => S(x, 0)[0]
  W('5V', '5V to the breakout', 'front', v5, 'via', [fx(13.2), v5[1]], [fx(13.2), linkPad(3.81)[1]], linkPad(3.81), 'via')
  W('GND', 'GND to the breakout', 'front', gnd, 'via', [fx(14.45), gnd[1]], [fx(14.45), linkPad(-3.81)[1]], linkPad(-3.81), 'via')
  W('LINK', 'link line to the breakout', 'front', lk, 'via', [lk[0], S(0, -13.6)[1]], S(L[0] + 1.5, -13.6),
    S(L[0] + 1.5, L[1] + 1.27), linkPad(-1.27), 'via')

  // map labels: MCU pins in use (back) and power/link holes (front), breakout pins
  const labels = []
  const pinLabel = (text, px, py, dx, dy, side) => labels.push({ p: S(M[0] + px + dx, M[1] - py + dy), text, side })
  for (const [py, t] of [[-10.16, '5V'], [-7.62, 'GND'], [-2.54, 'C0'], [0, 'C1'], [2.54, 'C2'], [5.08, 'R0'], [7.62, 'R1'], [10.16, 'R2']]) pinLabel(t, -7.62, py, 2.1, -0.5, 'back')
  for (const [px, t] of [[-5.08, 'C3'], [-2.54, 'C4'], [0, 'R3'], [2.54, 'C5']]) pinLabel(t, px, 10.16, 0, 2.2, 'back')
  pinLabel('LINK', 7.62, 10.16, -2.6, -0.5, 'back')
  pinLabel('5V', -7.62, -10.16, 3.4, -0.5, 'front'); pinLabel('GND', -7.62, -7.62, 3.4, -0.5, 'front'); pinLabel('LINK', 7.62, 10.16, -3.0, -0.5, 'front')
  for (const [py, t] of [[3.81, 'V'], [-1.27, 'D+'], [-3.81, 'G']]) labels.push({ p: S(L[0] - 2.2, L[1] - py - 0.5), text: t })
  labels.push({ p: S(M[0], M[1] + 3), text: 'RP2040-Zero', size: 2, side: 'back' }, { p: S(L[0] + 6, L[1]), text: 'USB-C', size: 2 })

  const pins = `- RP2040-Zero upside down in a back pocket (component side towards the front). Pins as seen from the switch side:
- left, top to bottom: 5V, GND, 3V3 (unused), GP29 = C0, GP28 = C1, GP27 = C2, GP26 = R0, GP15 = R1, GP14 = R2
- bottom, left to right: GP13 = C3, GP12 = C4, GP11 = R3, GP10 = C5, GP9 free
- right, bottom: GP8 = LINK (to the breakout's D+)`
  return { wires, labels, pins }
}
