// V-score marker: a line on the Dwgs.User layer (plus a note on Cmts.User) that tells the fab where to
// put the V-groove, not copper and not an outline. Origin = the top end of the line; the line runs
// straight down (+y in KiCad) for `length` mm. Place it on the seam between two halves that touch exactly.
//
// Fabs read this from the order notes / a drawing: JLCPCB ("V-cut" / "Panel by JLCPCB: V-cut") and PCBWay
// both want a mechanical-layer line, and the seam position stated in the order. Keep the line well clear of
// copper: the V-groove removes ~0.5 mm each side, and the board edge is the seam itself.

module.exports = {
  params: {
    designator: 'VS',
    length: 100,
    label: 'V-SCORE (full length, no mouse-bites)',
  },
  body: p => `
  (footprint "custom:vscore_line" (layer "F.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}" (at 3 ${p.length / 2} 90) (layer "F.Fab") hide
      (effects (font (size 1 1) (thickness 0.15))))
    (attr exclude_from_pos_files exclude_from_bom)
    (descr "V-score line marker for the fab: draw layer only")
    (fp_line (start 0 0) (end 0 ${p.length}) (stroke (width 0.2) (type dash)) (layer "Dwgs.User"))
    (fp_text user "${p.label}" (at -1.5 ${p.length / 2} 90) (layer "Dwgs.User")
      (effects (font (size 1.2 1.2) (thickness 0.15))))
    (fp_text user "V-score here: both halves touch exactly on this line" (at 1.5 ${p.length / 2} 90) (layer "Cmts.User")
      (effects (font (size 1.2 1.2) (thickness 0.15))))
  )`,
};
