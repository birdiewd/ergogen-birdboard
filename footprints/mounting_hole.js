// Mounting hole for an M2 screw (KiCad 8 syntax).
//
// Params:
//   designator: reference prefix (default 'H')
//   drill: hole diameter (default 2.2, clearance for M2)
//   head: screw head / standoff diameter, drawn as the courtyard on both sides so
//         nothing gets placed under it (default 4)
//   plated: if true, a plated hole with a copper ring of `ring` diameter, left
//           unconnected (default false: a plain non-plated hole)
//   ring: copper ring diameter for a plated hole (default 3.8)

module.exports = {
  params: {
    designator: 'H',
    drill: 2.2,
    head: 4,
    plated: false,
    ring: 3.8,
  },
  body: p => {
    const r = p.head / 2
    const pad = p.plated
      ? `(pad "1" thru_hole circle (at 0 0 ${p.r}) (size ${p.ring} ${p.ring}) (drill ${p.drill}) (layers "*.Cu" "*.Mask"))`
      : `(pad "" np_thru_hole circle (at 0 0 ${p.r}) (size ${p.drill} ${p.drill}) (drill ${p.drill}) (layers "*.Cu" "*.Mask"))`
    const circle = layer =>
      `(fp_circle (center 0 0) (end ${r} 0) (stroke (width 0.05) (type solid)) (fill none) (layer "${layer}"))`
    return `
  (footprint "mounting_hole"
    (layer "F.Cu")
    ${p.at}
    (property "Reference" "${p.ref}" (at 0 ${-(r + 1)} ${p.r}) (layer "F.Fab") ${p.ref_hide}
      (effects (font (size 1 1) (thickness 0.15))))
    (attr exclude_from_pos_files exclude_from_bom)
    ${pad}
    ${circle('F.CrtYd')}
    ${circle('B.CrtYd')}
    (fp_circle (center 0 0) (end ${r} 0) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab"))
  )
  `
  },
}
