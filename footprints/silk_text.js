// Free text on a silkscreen (or any) layer, centred on the placement point and turned
// with it. Emits a board text item, no footprint.
//
// Params:
//   text: the text (default 'text')
//   layer: KiCad layer name (default 'F.SilkS')
//   font: TrueType font face, e.g. 'Bauhaus 93'; '' uses KiCad's stroke font (default '').
//     KiCad draws TrueType text with the font installed on the machine that opens the
//     board or plots the Gerbers, so plot on a machine that has it.
//   size: character height and width in mm (default 2)
//   thickness: stroke width for KiCad's stroke font (default 0.15)
//   bold, italic: font style (default false)
//   mirror_text: mirror the text, for back layers (default false). Not 'mirror':
//     Ergogen reserves that param name for mirrored-half overrides.

module.exports = {
  params: {
    designator: 'TXT',
    text: 'text',
    layer: 'F.SilkS',
    font: '',
    size: 2,
    thickness: 0.15,
    bold: false,
    italic: false,
    mirror_text: false,
  },
  body: p => {
    const face = p.font ? `(face "${p.font}") ` : ''
    const style = `${p.bold ? ' bold' : ''}${p.italic ? ' italic' : ''}`
    const text = String(p.text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `
  (gr_text "${text}" (at ${p.xy} ${p.r}) (layer "${p.layer}")
    (effects (font ${face}(size ${p.size} ${p.size}) (thickness ${p.thickness})${style})${p.mirror_text ? ' (justify mirror)' : ''}))
  `
  },
}
