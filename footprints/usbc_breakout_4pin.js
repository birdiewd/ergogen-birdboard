// Pads and outline for a generic 4-pin USB-C female breakout board (12 x 13.8 mm,
// pads labelled V, D-, D+, G on a 2.54 mm row along one short edge). It is a PLUG-IN
// MODULE: solder a straight 1x4 male header into the breakout from its underside so the
// breakout sits flat above this PCB, then solder the header pins into the four holes here.
//
// Used as the cable link between the two halves (VBUS, D+ as a single-wire serial line,
// GND; D- is left unconnected).
//
// Geometry (footprint origin = centre of the pad row, +x = direction of the USB-C opening,
// breakout board extends 2.1 mm behind the pad row and 11.7 mm in front of it (plus ~0.9 mm of connector shell), 12 mm wide):
//   F side (module on the front layer, opening toward +x):  V at the bottom, then D-, D+, G going up
//   B side (module on the back layer,  opening toward +x):  V at the top,    then D-, D+, G going down
// The right half is this PCB flipped, so it needs the B set. Both sets exist on the PCB
// (the B set is offset in x by the config so the holes do not collide); populate one.
//
// upside_down: true mounts the breakout from the bottom of this PCB with its component side
// (the USB-C receptacle) facing up into a cutout (cut it in the outline), so the port sits
// level with the PCB. The header goes through both boards at the pad row. Seen from the top
// the pin order is the F order (V at the bottom); outline and text go on the back layers.
// Overrides `side`.
//
// Pin order and sizes are read from the seller's product image; check them against your
// part before ordering boards.

module.exports = {
  params: {
    designator: 'J',
    side: 'F',
    upside_down: false,
    vbus: { type: 'net', value: 'VBUS' },
    dp: { type: 'net', value: 'D_P' },
    gnd: { type: 'net', value: 'GND' },
    // D- has no param: its pad is left unconnected
    drill: 1.0,
    pad: 1.8,
    show_silk: true,
  },
  body: p => {
    const flip = !!p.upside_down;
    const side = flip || p.side === 'B' ? 'B' : 'F';
    const L = name => `"${side}.${name}"`;
    const mirror = side === 'B' ? ' (justify mirror)' : '';
    const pitch = 2.54;
    // KiCad y points down. F (and upside down): V at the bottom (+y); B: V at the top (-y).
    const dir = side === 'B' && !flip ? -1 : 1;
    const refY = flip ? 7.5 : -7.5; // upside down: below the module, clear of the MCU pads
    const pads = [
      ['1', 'V', 1.5 * pitch * dir, p.vbus.str],
      ['2', 'D-', 0.5 * pitch * dir, ''],
      ['3', 'D+', -0.5 * pitch * dir, p.dp.str],
      ['4', 'G', -1.5 * pitch * dir, p.gnd.str],
    ];
    let out = `
  (footprint "custom:usbc_breakout_4pin" (layer "${side}.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}" (at 5 ${refY} ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 1 1) (thickness 0.15))${mirror}))
    (attr through_hole)
    (descr "4-pin USB-C female breakout module, 2.54mm row, plugged in via a straight header")`;
    for (const [num, , y, net] of pads) {
      out += `
    (pad "${num}" thru_hole ${num === '1' ? 'rect' : 'circle'} (at 0 ${y} ${p.r}) (size ${p.pad} ${p.pad}) (drill ${p.drill}) (layers "*.Cu" "*.Mask") ${net})`;
    }
    const line = (x1, y1, x2, y2, layer, w) => `
    (fp_line (start ${x1} ${y1}) (end ${x2} ${y2})
      (stroke (width ${w}) (type solid)) (layer ${L(layer)}))`;
    // breakout outline: x from -2.1 to 12.6 (incl. shell), y +-6
    const x0 = -2.1, x1 = 12.6, h = 6; // 11.7 board + ~0.9 shell
    for (const layer of ['Fab', 'CrtYd']) {
      out += line(x0, -h, x1, -h, layer, 0.1);
      out += line(x1, -h, x1, h, layer, 0.1);
      out += line(x1, h, x0, h, layer, 0.1);
      out += line(x0, h, x0, -h, layer, 0.1);
    }
    if (p.show_silk) {
      out += line(x0, -h, x1, -h, 'SilkS', 0.12);
      out += line(x1, -h, x1, h, 'SilkS', 0.12);
      out += line(x1, h, x0, h, 'SilkS', 0.12);
      out += line(x0, h, x0, -h, 'SilkS', 0.12);
      // (the label would fall in the cutout when upside down)
      if (!flip) out += `
    (fp_text user "USB-C ${side} V" (at 5 ${side === 'B' ? -3.2 : 3.2} ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 0.8 0.8) (thickness 0.12))${mirror}))`;
    }
    out += `
  )`;
    return out;
  },
};
