// Wire routes for the RIGHT half of the v4 printed wiring board. Same conventions as
// routes.js (read that first), with one twist: these routes are written in the LEFT half's
// frame, i.e. as the right half seen in a mirror, and the build mirrors them into place.
// So K(), S(), M and L are the left half's, and only the parts that do not mirror differ:
//   - each switch's pins and diode: in this mirror frame the column pin is on the key's
//     right (x = +4.4) and the diode on its left (x = -7.2)
//   - the USB-C breakout is turned round, so its pins run V, D-, D+, G from the top
//   - the RP2040-Zero is flipped (components towards the back, in a back pocket that stops
//     short of the front face), so its pinout DOES mirror: its castellations sit where the
//     left half's do. Back wires drop to its level at the pocket edge; front wires are cut
//     down to it from the front.

module.exports = ({ K, S, U, M, L, pitch }) => {
  const wires = []
  const W = (net, name, ...parts) => wires.push({ net, name, parts })
  const O = S(0, 0)
  const rel = p => [p[0] - O[0], p[1] - O[1]]
  const p = pitch

  const COL_X = 4.4, TAB_Y = -4.7, ROW_Y = U.diode_k, DX = -U.diode_x, GAP = 9.4
  const tab = k => K(k, COL_X, TAB_Y)
  const cath = k => K(k, DX, ROW_Y)
  const rowP = k => K(k, GAP, ROW_Y)

  // MCU castellations (same places as the left half's in this frame)
  const padY = py => M[1] - py
  const edgeL = M[0] - U.mcu_w / 2, edgeR = M[0] + U.mcu_w / 2, edgeB = M[1] - U.mcu_h / 2
  const leftPad = py => [S(edgeL - 1, padY(py)), 'mcuback', S(edgeL, padY(py))]
  const bottomPad = px => [S(M[0] + px, edgeB - 1), 'mcuback', S(M[0] + px, edgeB)]
  // breakout pad holes, turned round: V at the top, then D-, D+, G
  const linkPad = py => S(L[0], L[1] + py)

  const ZL = { C0: 13.45, C1: 13.45 - p, C2: 13.45 - 2 * p, R0: 13.45 - 3 * p }
  const LANE = { a: 11.9, b: 11.9 + p, c: 11.9 + 2 * p, d: 11.9 + 3 * p }
  const HOR = { a: -14.85, b: -14.85 - p, c: -14.85 - 2 * p, d: -14.85 - 3 * p }
  const R2_LANE = ZL.C2

  // ---------------- rows (shallow): under every key from its cathode, stepping at x = +9.4 ----------------
  const cols = ['outer', 'pinky', 'ring', 'middle', 'index', 'inner']
  const rowThrough = keys => {
    const pts = [cath(keys[0]), rowP(keys[0])]
    for (let i = 1; i < keys.length; i++) {
      const prev = rowP(keys[i - 1]), next = cath(keys[i])
      pts.push([prev[0], next[1]], next, rowP(keys[i]))
    }
    return pts
  }
  const matrixRow = r => cols.map(c => `matrix_${c}_${r}`)
  // the last key's row runs on only as far as its lane
  const toLane = (pts, x) => [...pts.slice(0, -1), S(x, rel(pts[pts.length - 1])[1])]
  W('R0', 'row R0 (top)', 'shallow', ...toLane(rowThrough(matrixRow('top')), ZL.R0), S(ZL.R0, padY(5.08)), ...leftPad(5.08))
  W('R1', 'row R1 (home)', 'shallow', ...toLane(rowThrough(matrixRow('home')), ZL.R0), S(ZL.R0, padY(7.62)), ...leftPad(7.62))
  W('R2', 'row R2 (bottom)', 'shallow', ...toLane(rowThrough(matrixRow('bottom')), R2_LANE), S(R2_LANE, padY(10.16)), ...leftPad(10.16))

  const tfo = 'thumbfan_outer_thumb', fn = 'thumbfan_fn_thumb', home = 'thumbfan_home_thumb'
  const r3 = rowThrough(['mod_outer_thumb', 'mod_pinky_thumb', 'mod_ring_thumb'])
  r3.push([r3[r3.length - 1][0], cath(tfo)[1]], cath(tfo), rowP(tfo), cath(fn), rowP(fn), cath(home), rowP(home))
  W('R3', 'row R3 (thumbs)', 'shallow', ...r3, S(LANE.d, -52.0), S(LANE.d, HOR.d), S(M[0] + 2.54, HOR.d), ...bottomPad(2.54))

  // ---------------- columns (deep under the keys) ----------------
  const colTabs = (c, withMod) => [...(withMod ? [`mod_${c}_thumb`] : []), ...['bottom', 'home', 'top'].map(r => `matrix_${c}_${r}`)].map(tab)

  // Column bundle along the top edge, one pitch per lane above R0. Here the columns rise on
  // the keys' right (over their column pins), so the lanes climb before the next column
  // rises: C0 over the pinky key, then all three over the ring key, right of the mounting
  // hole above it (C0 first; C2 jogs right from where it rises).
  const r0y = c => cath(`matrix_${c}_top`)[1]
  const lane = (j, c) => r0y(c) + p * (j + 1)
  const kx = c => K(`matrix_${c}_top`, 0, 0)[0]
  const tail = (j, y0) => {
    // middle -> index -> inner (down, lower lane first, right of R0's steps)
    const pts = []
    let y = y0
    for (const [to, x] of [['index', kx('middle') + GAP + p * (j + 1)], ['inner', kx('index') + GAP + p * (j + 1)]]) {
      pts.push([x, y]); y = lane(j, to); pts.push([x, y])
    }
    return { pts, y }
  }
  const finish = (net, c, j, py, lx, head) => {
    const t = tail(j, head[head.length - 1][1])
    W(net, `column ${net}`, 'deep', ...colTabs(c, true), [tab(`matrix_${c}_top`)[0], r0y(c) + p / 2],
      'shallow', ...head, ...t.pts, S(lx, rel([0, t.y])[1]), S(lx, padY(py)), ...leftPad(py))
  }
  const x0 = tab('matrix_outer_top')[0], x1 = tab('matrix_pinky_top')[0], x2 = tab('matrix_ring_top')[0]
  const hx = 2.65                        // first step right of the ring key's mounting hole
  const sp = kx('pinky') + COL_X - p     // C0's step, left of where C1 rises
  finish('C0', 'outer', 2, -2.54, ZL.C0, [
    [x0, lane(2, 'outer')], [sp, lane(2, 'outer')], [sp, lane(2, 'ring')],
    [kx('ring') + hx, lane(2, 'ring')], [kx('ring') + hx, lane(2, 'middle')]])
  finish('C1', 'pinky', 1, 0, ZL.C1, [
    [x1, lane(1, 'ring')], [kx('ring') + hx + p, lane(1, 'ring')], [kx('ring') + hx + p, lane(1, 'middle')]])
  finish('C2', 'ring', 0, 2.54, ZL.C2, [
    [x2, lane(0, 'ring')], [kx('ring') + hx + 2 * p, lane(0, 'ring')], [kx('ring') + hx + 2 * p, lane(0, 'middle')]])

  // Thumb-side columns. Each column comes down to a corner (tee) above row R3; from there a
  // link runs right to its lane in the strip and a branch crosses R3 to its thumb key.
  const yC3 = S(0, -47.0)[1], yC4 = S(0, -47.0 - p)[1], yC5 = S(0, -47.0 - 2 * p)[1]
  const tee3 = [tab(tfo)[0], yC3]
  W('C3', 'column C3', 'deep', ...colTabs('middle', false).reverse(), [tab('matrix_middle_bottom')[0], yC3], tee3,
    'shallow', [S(LANE.a, 0)[0], yC3], S(LANE.a, HOR.a), S(M[0] - 5.08, HOR.a), ...bottomPad(-5.08))
  W('C3', 'C3 to the thumb key', 'deep', tee3, tab(tfo))

  const tee4 = [tab('matrix_index_bottom')[0], yC4]
  W('C4', 'column C4', 'deep', ...colTabs('index', false).reverse(), tee4, K(fn, COL_X, 8), tab(fn))
  W('C4', 'C4 to the MCU', 'shallow', tee4, [S(LANE.b, 0)[0], yC4], S(LANE.b, HOR.b), S(M[0] - 2.54, HOR.b), ...bottomPad(-2.54))

  const tee5 = [tab('matrix_inner_bottom')[0], yC5]
  W('C5', 'column C5', 'deep', ...colTabs('inner', false).reverse(), tee5, K(home, COL_X, 8), tab(home))
  W('C5', 'C5 to the MCU', 'shallow', tee5, [S(LANE.c, 0)[0], yC5], S(LANE.c, HOR.c), S(M[0], HOR.c), ...bottomPad(0))

  // ---------------- power and link (front, under the MCU cover) ----------------
  // Each starts square against its castellation (cut from the front down to the module) and
  // drops through a hole into the breakout's pad hole. The breakout is turned round, so 5V
  // and GND would cross: GND dips under 5V through the board once.
  const fx = x => S(x, 0)[0]
  const v5y = padY(-10.16), gy = padY(-7.62), lky = padY(10.16)
  // the module sits deep here, so its back stretches reach the front channels' depth: keep clear of them
  const PG = edgeL - 1 - p, P5 = PG - p, PL = 34.0, XL = L[0] + 2.0, yLink = edgeB - 1 - p, XH = 19.3
  const y5 = -23.0, yH1 = -21.3, yH2 = -24.7
  W('5V', '5V to the breakout', 'mcufront', S(edgeL, v5y), S(P5, v5y), 'front', S(P5, y5), [linkPad(3.81)[0], S(0, y5)[1]], linkPad(3.81), 'via')
  W('GND', 'GND to the breakout', 'mcufront', S(edgeL, gy), S(PG, gy), 'front', S(PG, yH1), S(XH, yH1), 'via',
    'shallow', S(XH, yH2), 'via', 'front', [fx(XH), linkPad(-3.81)[1]], linkPad(-3.81), 'via')
  W('LINK', 'link line to the breakout', 'mcufront', S(edgeR, lky), S(PL, lky), 'front', S(PL, yLink), S(XL, yLink),
    [fx(XL), linkPad(-1.27)[1]], linkPad(-1.27), 'via')

  // labels (in this mirror frame; the build mirrors their positions)
  const labels = []
  const pinLabel = (text, px, py, dx, dy, side) => labels.push({ p: S(M[0] + px + dx, M[1] - py + dy), text, side })
  for (const [py, t] of [[-2.54, 'C0'], [0, 'C1'], [2.54, 'C2'], [5.08, 'R0'], [7.62, 'R1'], [10.16, 'R2']]) pinLabel(t, -7.62, py, 2.1, -0.5, 'back')
  for (const [px, t] of [[-5.08, 'C3'], [-2.54, 'C4'], [0, 'C5'], [2.54, 'R3']]) pinLabel(t, px, 10.16, 0, 2.2, 'back')
  pinLabel('5V', -7.62, -10.16, 2.1, -0.5, 'front'); pinLabel('GND', -7.62, -7.62, 2.4, -0.5, 'front'); pinLabel('LINK', 7.62, 10.16, -2.8, -0.5, 'front')
  for (const [py, t] of [[3.81, 'V'], [-1.27, 'D+'], [-3.81, 'G']]) labels.push({ p: S(L[0] - 2.2, L[1] + py - 0.5), text: t })
  labels.push({ p: S(M[0], M[1] + 3), text: 'RP2040-Zero', size: 2, side: 'back' }, { p: S(L[0] + 6, L[1]), text: 'USB-C', size: 2 })

  const pins = `- RP2040-Zero flipped (components towards the back) in a back pocket, resting on the board's front skin; its USB-C port hangs about 0.8 mm below the board. Each wire ends square against its castellation. Pins as seen from the switch side of the right half:
- right, top to bottom: 5V, GND, 3V3 (unused), GP29 = C0, GP28 = C1, GP27 = C2, GP26 = R0, GP15 = R1, GP14 = R2
- bottom, right to left: GP13 = C3, GP12 = C4, GP11 = C5, GP10 = R3, GP9 free
- left, bottom: GP8 = LINK (to the breakout's D+)
- differs from the left half: GP11 and GP10 (C5 and R3 swap)`
  return { wires, labels, pins }
}
