// Waveshare RP2040-Zero, 23 castellated edge pads (each pad has an SMD and a through-hole land).
//
// Converted by script from the user-supplied KiCad footprint `RP2040 Zero`. Pad, silkscreen
// and fab geometry is parsed from that file; the origin is moved to the centre of the pad field.
// Edge.Cuts lines in the source (an open-topped notch under the module) are NOT carried over,
// because an unclosed outline would end up in the PCB edge.
//
// Orientation: USB-C end at the top (negative y).
//   Left column, top to bottom:  5V GND 3V3 GP29 GP28 GP27 GP26 GP15 GP14   (pads 1-9)
//   Bottom row, left to right:   GP13 GP12 GP11 GP10 GP9                    (pads 19-23)
//   Right column, top to bottom: GP0 GP1 ... GP8                            (pads 10-18)
// Names were assigned by physical position from the Waveshare pinout (pad numbers in the source
// file do not follow Waveshare's own anticlockwise numbering). Not on the edge: GP16 (on-board
// WS2812), GP17-GP25 (underside solder points).
//
// Params
//   <pin>  net for each pin; default net = the pin name. `5V` is `V5`, `3V3` is `V3V3`.
//          Remap in config.yaml, e.g.  GP0: pinky   GP8: top
//   mount  'both' (default) | 'th' | 'smd'
//   side   'F' (default) | 'B'   mirrors x for back-side mounting
//   show_labels  pin-name silkscreen, default true
//
// Not reversible.

const PIN_KEY = {"1":"V5","2":"GND","3":"V3V3","4":"GP29","5":"GP28","6":"GP27","7":"GP26","8":"GP15","9":"GP14","10":"GP0","11":"GP1","12":"GP2","13":"GP3","14":"GP4","15":"GP5","16":"GP6","17":"GP7","18":"GP8","19":"GP13","20":"GP12","21":"GP11","22":"GP10","23":"GP9"};
// [pad, shape, x, y, size, drill]
const TH = [[1,"circle",-7.62,-10.16,1.7,0.8],[2,"circle",-7.62,-7.62,1.7,0.8],[3,"circle",-7.62,-5.08,1.7,0.8],[4,"circle",-7.62,-2.54,1.7,0.8],[5,"circle",-7.62,0.0,1.7,0.8],[6,"circle",-7.62,2.54,1.7,0.8],[7,"circle",-7.62,5.08,1.7,0.8],[8,"circle",-7.62,7.62,1.7,0.8],[9,"circle",-7.62,10.16,1.7,0.8],[10,"circle",7.62,-10.16,1.7,0.8],[11,"circle",7.62,-7.62,1.7,0.8],[12,"circle",7.62,-5.08,1.7,0.8],[13,"circle",7.62,-2.54,1.7,0.8],[14,"circle",7.62,0.0,1.7,0.8],[15,"circle",7.62,2.54,1.7,0.8],[16,"circle",7.62,5.08,1.7,0.8],[17,"circle",7.62,7.62,1.7,0.8],[18,"circle",7.62,10.16,1.7,0.8],[19,"circle",-5.08,10.16,1.7,0.8],[20,"circle",-2.54,10.16,1.7,0.8],[21,"circle",0.0,10.16,1.7,0.8],[22,"circle",2.54,10.16,1.7,0.8],[23,"circle",5.08,10.16,1.7,0.8]];
// [pad, x, y, rot, w, h]
const SMD = [[1,-8.52,-10.16,0.0,3.5,1.7],[2,-8.52,-7.62,0.0,3.5,1.7],[3,-8.52,-5.08,0.0,3.5,1.7],[4,-8.52,-2.54,0.0,3.5,1.7],[5,-8.52,0.0,0.0,3.5,1.7],[6,-8.47,2.54,0.0,3.5,1.7],[7,-8.47,5.08,0.0,3.5,1.7],[8,-8.47,7.62,0.0,3.5,1.7],[9,-8.47,10.16,0.0,3.5,1.7],[10,8.52,-10.16,0.0,3.5,1.7],[11,8.52,-7.62,0.0,3.5,1.7],[12,8.52,-5.08,0.0,3.5,1.7],[13,8.52,-2.54,0.0,3.5,1.7],[14,8.52,0.0,0.0,3.5,1.7],[15,8.52,2.54,0.0,3.5,1.7],[16,8.52,5.08,0.0,3.5,1.7],[17,8.52,7.62,0.0,3.5,1.7],[18,8.52,10.16,0.0,3.5,1.7],[19,-5.08,11.06,90.0,3.5,1.7],[20,-2.54,11.01,90.0,3.5,1.7],[21,0.0,11.01,90.0,3.5,1.7],[22,2.54,11.01,90.0,3.5,1.7],[23,5.08,11.01,90.0,3.5,1.7]];
const LINES = {"SilkS":[[-10.16,-11.938,-5.588,-11.938,0.12],[-10.16,11.938,-6.35,11.938,0.12],[5.588,-11.938,10.16,-11.938,0.12],[6.35,11.938,10.16,11.938,0.12]],"Fab":[[-9.144,-11.938,-4.445,-11.938,0.1],[-9.017,11.938,-9.144,-11.938,0.1],[4.572,-11.938,9.144,-11.938,0.1],[9.144,-11.938,9.144,11.938,0.1],[9.144,11.938,-9.017,11.938,0.1]]};  // [x1, y1, x2, y2, width]
const RECTS = [[-4.445,-13.716,4.572,-8.382,0.1]];  // [x1, y1, x2, y2, width]
// [text, x, y, rot]
const LABELS = [["5V",-3.22,-10.16,0],["GND",-3.22,-7.62,0],["3V3",-3.22,-5.08,0],["GP29",-3.22,-2.54,0],["GP28",-3.22,0.0,0],["GP27",-3.22,2.54,0],["GP26",-3.22,5.08,0],["GP15",-3.22,7.62,0],["GP14",-3.22,10.16,0],["GP0",3.22,-10.16,0],["GP1",3.22,-7.62,0],["GP2",3.22,-5.08,0],["GP3",3.22,-2.54,0],["GP4",3.22,0.0,0],["GP5",3.22,2.54,0],["GP6",3.22,5.08,0],["GP7",3.22,7.62,0],["GP8",3.22,10.16,0],["GP13",-5.08,6.76,90],["GP12",-2.54,6.76,90],["GP11",0.0,6.76,90],["GP10",2.54,6.76,90],["GP9",5.08,6.76,90]];

module.exports = {
  params: {
    designator: 'MCU',
    side: 'F',
    mount: 'both',
    show_labels: true,
    V5: { type: 'net', value: '5V' },
    GND: { type: 'net', value: 'GND' },
    V3V3: { type: 'net', value: '3V3' },
    GP29: { type: 'net', value: 'GP29' },
    GP28: { type: 'net', value: 'GP28' },
    GP27: { type: 'net', value: 'GP27' },
    GP26: { type: 'net', value: 'GP26' },
    GP15: { type: 'net', value: 'GP15' },
    GP14: { type: 'net', value: 'GP14' },
    GP0: { type: 'net', value: 'GP0' },
    GP1: { type: 'net', value: 'GP1' },
    GP2: { type: 'net', value: 'GP2' },
    GP3: { type: 'net', value: 'GP3' },
    GP4: { type: 'net', value: 'GP4' },
    GP5: { type: 'net', value: 'GP5' },
    GP6: { type: 'net', value: 'GP6' },
    GP7: { type: 'net', value: 'GP7' },
    GP8: { type: 'net', value: 'GP8' },
    GP13: { type: 'net', value: 'GP13' },
    GP12: { type: 'net', value: 'GP12' },
    GP11: { type: 'net', value: 'GP11' },
    GP10: { type: 'net', value: 'GP10' },
    GP9: { type: 'net', value: 'GP9' },
  },
  body: p => {
    const side = p.side === 'B' ? 'B' : 'F';
    const sx = side === 'B' ? -1 : 1;
    const L = name => `"${side}.${name}"`;
    const net = pad => p[PIN_KEY[pad]].str;
    const x = v => sx * v + 0; // + 0 avoids "-0"
    const mirror = side === 'B' ? ' (justify mirror)' : '';
    const wantTh = p.mount === 'both' || p.mount === 'th';
    const wantSmd = p.mount === 'both' || p.mount === 'smd';

    let out = `
  (footprint "custom:mcu_rp2040_zero" (layer "${side}.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}" (at 0 0 ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (descr "Waveshare RP2040-Zero, castellated, converted from RP2040 Zero")`;

    if (wantTh) {
      for (const [pad, shape, px, py, size, drill] of TH) {
        out += `
    (pad "${pad}" thru_hole ${shape} (at ${x(px)} ${py} ${p.r}) (size ${size} ${size}) (drill ${drill}) (layers "*.Cu" "*.Mask") ${net(pad)})`;
      }
    }
    if (wantSmd) {
      for (const [pad, px, py, rot, w, h] of SMD) {
        out += `
    (pad "${pad}" smd rect (at ${x(px)} ${py} ${p.r + rot}) (size ${w} ${h}) (layers "${side}.Cu" "${side}.Mask") ${net(pad)})`;
      }
    }
    for (const layer of ['SilkS', 'Fab']) {
      for (const [x1, y1, x2, y2, w] of LINES[layer]) {
        out += `
    (fp_line (start ${x(x1)} ${y1}) (end ${x(x2)} ${y2}) (stroke (width ${w}) (type solid)) (layer ${L(layer)}))`;
      }
    }
    for (const [x1, y1, x2, y2, w] of RECTS) {
      out += `
    (fp_rect (start ${x(x1)} ${y1}) (end ${x(x2)} ${y2}) (stroke (width ${w}) (type solid)) (fill none) (layer ${L('Fab')}))`;
    }
    if (p.show_labels) {
      for (const [t, lx, ly, lr] of LABELS) {
        out += `
    (fp_text user "${t}" (at ${x(lx)} ${ly} ${p.r + lr}) (layer ${L('SilkS')})
      (effects (font (size 0.8 0.8) (thickness 0.15))${mirror}))`;
      }
    }
    out += `
  )`;
    return out;
  },
};
