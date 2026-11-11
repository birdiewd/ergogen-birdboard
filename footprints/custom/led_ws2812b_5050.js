// WS2812B addressable RGB LED, PLCC4 5.0x5.0mm, pad pitch 3.2mm.
//
// Converted from the official KiCad footprint
//   LED_SMD:LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm  (datasheet: WS2812B.pdf, Worldsemi)
// Pad numbers, positions and sizes are unchanged from the source:
//   pad 1 (-2.45, -1.6)  VDD     pad 4 ( 2.45, -1.6)  DIN
//   pad 2 (-2.45,  1.6)  DOUT    pad 3 ( 2.45,  1.6)  VSS (GND)
// KiCad footprint libraries are CC-BY-SA 4.0 with an exception for use in designs.
//
// Usage in config.yaml:
//   led:
//     what: custom/led_ws2812b_5050
//     where: true
//     params:
//       din: LED_CHAIN_IN
//       dout: LED_CHAIN_OUT
//     adjust:
//       shift: [0, 5]
//
// Single-sided: `side: B` mounts it on the back and mirrors the pad x positions.
// Not reversible (no pads on both sides).

module.exports = {
  params: {
    designator: 'LED',
    side: 'F',
    din: { type: 'net', value: 'LED_DIN' },
    dout: { type: 'net', value: 'LED_DOUT' },
    vdd: { type: 'net', value: 'VCC' },
    gnd: { type: 'net', value: 'GND' },
    show_silk: true,
  },
  body: p => {
    const side = p.side === 'B' ? 'B' : 'F';
    const sx = side === 'B' ? -1 : 1; // KiCad stores back-side footprints mirrored in x
    const L = name => `"${side}.${name}"`;
    const cu = `"${side}.Cu" "${side}.Paste" "${side}.Mask"`;
    const x = v => sx * v;
    const line = (x1, y1, x2, y2, layer, w) => `
    (fp_line (start ${x(x1)} ${y1}) (end ${x(x2)} ${y2})
      (stroke (width ${w}) (type solid)) (layer ${L(layer)}))`;

    let out = `
  (footprint "custom:led_ws2812b_5050" (layer "${side}.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}" (at 0 -3.5 ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 1 1) (thickness 0.15))))
    (attr smd)
    (descr "WS2812B PLCC4 5.0x5.0mm P3.2mm, converted from KiCad LED_SMD library")

    (pad "1" smd rect (at ${x(-2.45)} -1.6 ${p.r}) (size 1.5 1) (layers ${cu}) ${p.vdd.str})
    (pad "2" smd rect (at ${x(-2.45)} 1.6 ${p.r}) (size 1.5 1) (layers ${cu}) ${p.dout.str})
    (pad "3" smd rect (at ${x(2.45)} 1.6 ${p.r}) (size 1.5 1) (layers ${cu}) ${p.gnd.str})
    (pad "4" smd rect (at ${x(2.45)} -1.6 ${p.r}) (size 1.5 1) (layers ${cu}) ${p.din.str})`;

    // courtyard (rectangle from the source)
    out += line(3.45, -2.75, -3.45, -2.75, 'CrtYd', 0.05);
    out += line(3.45, 2.75, 3.45, -2.75, 'CrtYd', 0.05);
    out += line(-3.45, 2.75, 3.45, 2.75, 'CrtYd', 0.05);
    out += line(-3.45, -2.75, -3.45, 2.75, 'CrtYd', 0.05);

    // fabrication outline, with the chamfer line and body circle
    out += line(2.5, 1.5, 1.5, 2.5, 'Fab', 0.1);
    out += line(-2.5, -2.5, -2.5, 2.5, 'Fab', 0.1);
    out += line(-2.5, 2.5, 2.5, 2.5, 'Fab', 0.1);
    out += line(2.5, 2.5, 2.5, -2.5, 'Fab', 0.1);
    out += line(2.5, -2.5, -2.5, -2.5, 'Fab', 0.1);
    out += `
    (fp_circle (center 0 0) (end 0 -2) (stroke (width 0.1) (type solid)) (fill none) (layer ${L('Fab')}))`;

    if (p.show_silk) {
      out += line(-3.65, -2.75, 3.65, -2.75, 'SilkS', 0.12);
      out += line(-3.65, 2.75, 3.65, 2.75, 'SilkS', 0.12);
      out += line(3.65, 2.75, 3.65, 1.6, 'SilkS', 0.12);
      out += `
    (fp_text user "1" (at ${x(-4.15)} -1.6 ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 1 1) (thickness 0.15))))`;
    }

    out += `
  )`;
    return out;
  },
};
