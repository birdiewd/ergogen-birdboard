// Raspberry Pi Pico (v1), 2x20 at 2.54mm pitch, through-hole and castellated SMD pads.
//
// Converted by script from the KiCad footprint `RPi_Pico_SMD_TH`
// (KiCad-RP-Pico library by ncarandini, derived from the HeadBoffin RP_Silicon_KiCad
// project). All pad, hole, silkscreen, fab, courtyard and keep-out geometry is parsed
// from that file; pin names follow the Raspberry Pi Pico pinout and match the
// silkscreen labels in the source.
//
// Orientation: pin 1 (GP0) is top-left, USB end at the top (negative y).
//
// Params
//   <pin>  net for each pin. Default net = the pin name. Remap in config.yaml, e.g.
//          GP2: pinky      (column net)      GP10: top      (row net)
//          Duplicate pins (GND) share one param. Pin 3V3 is `V3V3`, 3V3_EN is `V3V3_EN`.
//   mount  'both' (default) | 'th' | 'smd'  -- which pad set to emit.
//   side   'F' (default) | 'B'              -- mirrors x for back-side mounting.
//   show_labels  pin-name silkscreen, default true.
//   show_keepout copper keep-out drawing (Dwgs.User), default true.
//
// Not reversible (no pads for both sides beyond the through-hole barrels).


const PIN_KEY = {"1":"GP0","2":"GP1","3":"GND","4":"GP2","5":"GP3","6":"GP4","7":"GP5","8":"GND","9":"GP6","10":"GP7","11":"GP8","12":"GP9","13":"GND","14":"GP10","15":"GP11","16":"GP12","17":"GP13","18":"GND","19":"GP14","20":"GP15","21":"GP16","22":"GP17","23":"GND","24":"GP18","25":"GP19","26":"GP20","27":"GP21","28":"GND","29":"GP22","30":"RUN","31":"GP26","32":"GP27","33":"AGND","34":"GP28","35":"ADC_VREF","36":"V3V3","37":"V3V3_EN","38":"GND","39":"VSYS","40":"VBUS","41":"SWCLK","42":"DEBUG_GND","43":"SWDIO"};
// [pad, shape, x, y, size, drill]
const TH = [[1,"oval",-8.89,-24.13,1.7,1.02],[2,"oval",-8.89,-21.59,1.7,1.02],[3,"rect",-8.89,-19.05,1.7,1.02],[4,"oval",-8.89,-16.51,1.7,1.02],[5,"oval",-8.89,-13.97,1.7,1.02],[6,"oval",-8.89,-11.43,1.7,1.02],[7,"oval",-8.89,-8.89,1.7,1.02],[8,"rect",-8.89,-6.35,1.7,1.02],[9,"oval",-8.89,-3.81,1.7,1.02],[10,"oval",-8.89,-1.27,1.7,1.02],[11,"oval",-8.89,1.27,1.7,1.02],[12,"oval",-8.89,3.81,1.7,1.02],[13,"rect",-8.89,6.35,1.7,1.02],[14,"oval",-8.89,8.89,1.7,1.02],[15,"oval",-8.89,11.43,1.7,1.02],[16,"oval",-8.89,13.97,1.7,1.02],[17,"oval",-8.89,16.51,1.7,1.02],[18,"rect",-8.89,19.05,1.7,1.02],[19,"oval",-8.89,21.59,1.7,1.02],[20,"oval",-8.89,24.13,1.7,1.02],[21,"oval",8.89,24.13,1.7,1.02],[22,"oval",8.89,21.59,1.7,1.02],[23,"rect",8.89,19.05,1.7,1.02],[24,"oval",8.89,16.51,1.7,1.02],[25,"oval",8.89,13.97,1.7,1.02],[26,"oval",8.89,11.43,1.7,1.02],[27,"oval",8.89,8.89,1.7,1.02],[28,"rect",8.89,6.35,1.7,1.02],[29,"oval",8.89,3.81,1.7,1.02],[30,"oval",8.89,1.27,1.7,1.02],[31,"oval",8.89,-1.27,1.7,1.02],[32,"oval",8.89,-3.81,1.7,1.02],[33,"rect",8.89,-6.35,1.7,1.02],[34,"oval",8.89,-8.89,1.7,1.02],[35,"oval",8.89,-11.43,1.7,1.02],[36,"oval",8.89,-13.97,1.7,1.02],[37,"oval",8.89,-16.51,1.7,1.02],[38,"rect",8.89,-19.05,1.7,1.02],[39,"oval",8.89,-21.59,1.7,1.02],[40,"oval",8.89,-24.13,1.7,1.02],[41,"oval",-2.54,23.9,1.7,1.02],[42,"rect",0.0,23.9,1.7,1.02],[43,"oval",2.54,23.9,1.7,1.02]];
// [pad, x, y, rot, w, h]
const SMD = [[1,-8.89,-24.13,0.0,3.5,1.7],[2,-8.89,-21.59,0.0,3.5,1.7],[3,-8.89,-19.05,0.0,3.5,1.7],[4,-8.89,-16.51,0.0,3.5,1.7],[5,-8.89,-13.97,0.0,3.5,1.7],[6,-8.89,-11.43,0.0,3.5,1.7],[7,-8.89,-8.89,0.0,3.5,1.7],[8,-8.89,-6.35,0.0,3.5,1.7],[9,-8.89,-3.81,0.0,3.5,1.7],[10,-8.89,-1.27,0.0,3.5,1.7],[11,-8.89,1.27,0.0,3.5,1.7],[12,-8.89,3.81,0.0,3.5,1.7],[13,-8.89,6.35,0.0,3.5,1.7],[14,-8.89,8.89,0.0,3.5,1.7],[15,-8.89,11.43,0.0,3.5,1.7],[16,-8.89,13.97,0.0,3.5,1.7],[17,-8.89,16.51,0.0,3.5,1.7],[18,-8.89,19.05,0.0,3.5,1.7],[19,-8.89,21.59,0.0,3.5,1.7],[20,-8.89,24.13,0.0,3.5,1.7],[21,8.89,24.13,0.0,3.5,1.7],[22,8.89,21.59,0.0,3.5,1.7],[23,8.89,19.05,0.0,3.5,1.7],[24,8.89,16.51,0.0,3.5,1.7],[25,8.89,13.97,0.0,3.5,1.7],[26,8.89,11.43,0.0,3.5,1.7],[27,8.89,8.89,0.0,3.5,1.7],[28,8.89,6.35,0.0,3.5,1.7],[29,8.89,3.81,0.0,3.5,1.7],[30,8.89,1.27,0.0,3.5,1.7],[31,8.89,-1.27,0.0,3.5,1.7],[32,8.89,-3.81,0.0,3.5,1.7],[33,8.89,-6.35,0.0,3.5,1.7],[34,8.89,-8.89,0.0,3.5,1.7],[35,8.89,-11.43,0.0,3.5,1.7],[36,8.89,-13.97,0.0,3.5,1.7],[37,8.89,-16.51,0.0,3.5,1.7],[38,8.89,-19.05,0.0,3.5,1.7],[39,8.89,-21.59,0.0,3.5,1.7],[40,8.89,-24.13,0.0,3.5,1.7],[41,-2.54,23.9,90.0,3.5,1.7],[42,0.0,23.9,90.0,3.5,1.7],[43,2.54,23.9,90.0,3.5,1.7]];
// [shape, x, y, size, drill]
const NPTH = [["oval",2.725,-24.0,1.8,1.8],["oval",-2.725,-24.0,1.8,1.8],["oval",-2.425,-20.97,1.5,1.5],["oval",2.425,-20.97,1.5,1.5]];
const LINES = {"SilkS":[[10.5,4.9,10.5,5.3,0.12],[-10.5,-23.1,-10.5,-22.7,0.12],[-10.5,-20.5,-10.5,-20.1,0.12],[10.5,10.0,10.5,10.4,0.12],[-3.7,25.5,-10.5,25.5,0.12],[10.5,-0.2,10.5,0.2,0.12],[10.5,22.7,10.5,23.1,0.12],[10.5,-23.1,10.5,-22.7,0.12],[-7.493,-22.833,-7.493,-25.5,0.12],[10.5,-5.3,10.5,-4.9,0.12],[-10.5,-25.5,10.5,-25.5,0.12],[-10.5,20.1,-10.5,20.5,0.12],[-10.5,-2.7,-10.5,-2.3,0.12],[-10.5,22.7,-10.5,23.1,0.12],[-10.5,-15.4,-10.5,-15.0,0.12],[-10.5,-5.3,-10.5,-4.9,0.12],[10.5,-2.7,10.5,-2.3,0.12],[10.5,25.5,3.7,25.5,0.12],[10.5,-15.4,10.5,-15.0,0.12],[-10.5,7.4,-10.5,7.8,0.12],[-10.5,-22.833,-7.493,-22.833,0.12],[-10.5,-7.8,-10.5,-7.4,0.12],[-10.5,4.9,-10.5,5.3,0.12],[-1.5,25.5,-1.1,25.5,0.12],[-10.5,-12.9,-10.5,-12.5,0.12],[10.5,-20.5,10.5,-20.1,0.12],[-10.5,15.1,-10.5,15.5,0.12],[1.1,25.5,1.5,25.5,0.12],[10.5,-12.9,10.5,-12.5,0.12],[-10.5,10.0,-10.5,10.4,0.12],[10.5,2.3,10.5,2.7,0.12],[-10.5,-10.4,-10.5,-10.0,0.12],[-10.5,-0.2,-10.5,0.2,0.12],[-10.5,17.6,-10.5,18.0,0.12],[-10.5,12.5,-10.5,12.9,0.12],[10.5,7.4,10.5,7.8,0.12],[10.5,-10.4,10.5,-10.0,0.12],[10.5,17.6,10.5,18.0,0.12],[10.5,-7.8,10.5,-7.4,0.12],[-10.5,-25.5,-10.5,-25.2,0.12],[10.5,20.1,10.5,20.5,0.12],[10.5,12.5,10.5,12.9,0.12],[10.5,-18.0,10.5,-17.6,0.12],[-10.5,2.3,-10.5,2.7,0.12],[10.5,-25.5,10.5,-25.2,0.12],[-10.5,-18.0,-10.5,-17.6,0.12],[10.5,15.1,10.5,15.5,0.12]],"Fab":[[-10.5,-24.2,-9.2,-25.5,0.12],[10.5,-25.5,10.5,25.5,0.12],[10.5,25.5,-10.5,25.5,0.12],[-10.5,-25.5,10.5,-25.5,0.12],[-10.5,25.5,-10.5,-25.5,0.12]],"CrtYd":[[11.0,-26.0,11.0,26.0,0.12],[11.0,26.0,-11.0,26.0,0.12],[-11.0,-26.0,11.0,-26.0,0.12],[-11.0,26.0,-11.0,-26.0,0.12]]};  // [x1, y1, x2, y2, width]
const KEEPOUTS = [[[-1.5,-16.5],[-3.5,-16.5],[-3.5,-18.5],[-1.5,-18.5]],[[-1.5,-11.5],[-3.5,-11.5],[-3.5,-13.5],[-1.5,-13.5]],[[3.7,-20.2],[-3.7,-20.2],[-3.7,-24.9],[3.7,-24.9]],[[-1.5,-14.0],[-3.5,-14.0],[-3.5,-16.0],[-1.5,-16.0]]];
// [text, x, y, rot]
const LABELS = [["GP11",-13.2,11.43,45.0],["AGND",13.054,-6.35,45.0],["GND",12.8,19.05,45.0],["VBUS",13.3,-24.2,45.0],["GND",12.8,-19.05,45.0],["GP13",-13.054,16.51,45.0],["ADC_VREF",14.0,-12.5,45.0],["GP4",-12.8,-11.43,45.0],["GP7",-12.7,-1.3,45.0],["GP15",-13.054,24.13,45.0],["GP17",13.054,21.59,45.0],["GP26",13.054,-1.27,45.0],["SWCLK",-5.7,26.2,0.0],["3V3_EN",13.7,-17.2,45.0],["3V3",12.9,-13.9,45.0],["GP8",-12.8,1.27,45.0],["GP16",13.054,24.13,45.0],["GND",12.8,6.35,45.0],["GND",-12.8,-6.35,45.0],["GP28",13.054,-9.144,45.0],["GP9",-12.8,3.81,45.0],["SWDIO",5.6,26.2,0.0],["GP5",-12.8,-8.89,45.0],["GP0",-12.8,-24.13,45.0],["GP3",-12.8,-13.97,45.0],["GND",-12.8,19.05,45.0],["GND",-12.8,-19.05,45.0],["GP20",13.054,11.43,45.0],["GP19",13.054,13.97,45.0],["GP2",-12.9,-16.51,45.0],["GP18",13.054,16.51,45.0],["GP6",-12.8,-3.81,45.0],["GP21",13.054,8.9,45.0],["GP22",13.054,3.81,45.0],["GND",-12.8,6.35,45.0],["GP14",-13.1,21.59,45.0],["VSYS",13.2,-21.59,45.0],["GP12",-13.2,13.97,45.0],["GP1",-12.9,-21.6,45.0],["GP10",-13.054,8.89,45.0],["RUN",13.0,1.27,45.0],["GP27",13.054,-3.8,45.0]];

module.exports = {
  params: {
    designator: 'MCU',
    side: 'F',
    mount: 'both',
    show_labels: true,
    show_keepout: true,
    GP0: { type: 'net', value: 'GP0' },
    GP1: { type: 'net', value: 'GP1' },
    GND: { type: 'net', value: 'GND' },
    GP2: { type: 'net', value: 'GP2' },
    GP3: { type: 'net', value: 'GP3' },
    GP4: { type: 'net', value: 'GP4' },
    GP5: { type: 'net', value: 'GP5' },
    GP6: { type: 'net', value: 'GP6' },
    GP7: { type: 'net', value: 'GP7' },
    GP8: { type: 'net', value: 'GP8' },
    GP9: { type: 'net', value: 'GP9' },
    GP10: { type: 'net', value: 'GP10' },
    GP11: { type: 'net', value: 'GP11' },
    GP12: { type: 'net', value: 'GP12' },
    GP13: { type: 'net', value: 'GP13' },
    GP14: { type: 'net', value: 'GP14' },
    GP15: { type: 'net', value: 'GP15' },
    GP16: { type: 'net', value: 'GP16' },
    GP17: { type: 'net', value: 'GP17' },
    GP18: { type: 'net', value: 'GP18' },
    GP19: { type: 'net', value: 'GP19' },
    GP20: { type: 'net', value: 'GP20' },
    GP21: { type: 'net', value: 'GP21' },
    GP22: { type: 'net', value: 'GP22' },
    RUN: { type: 'net', value: 'RUN' },
    GP26: { type: 'net', value: 'GP26' },
    GP27: { type: 'net', value: 'GP27' },
    AGND: { type: 'net', value: 'GND' },
    GP28: { type: 'net', value: 'GP28' },
    ADC_VREF: { type: 'net', value: 'ADC_VREF' },
    V3V3: { type: 'net', value: '3V3' },
    V3V3_EN: { type: 'net', value: '3V3_EN' },
    VSYS: { type: 'net', value: 'VSYS' },
    VBUS: { type: 'net', value: 'VBUS' },
    SWCLK: { type: 'net', value: 'SWCLK' },
    DEBUG_GND: { type: 'net', value: 'DEBUG_GND' },
    SWDIO: { type: 'net', value: 'SWDIO' },
  },
  body: p => {
    const side = p.side === 'B' ? 'B' : 'F';
    const sx = side === 'B' ? -1 : 1; // back-side footprints are stored mirrored in x
    const L = name => `"${side}.${name}"`;
    const net = pad => p[PIN_KEY[pad]].str;
    const x = v => sx * v;
    const mirror = side === 'B' ? ' (justify mirror)' : '';
    const wantTh = p.mount === 'both' || p.mount === 'th';
    const wantSmd = p.mount === 'both' || p.mount === 'smd';

    let out = `
  (footprint "custom:mcu_pico_v1" (layer "${side}.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}" (at 0 0 ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (descr "Raspberry Pi Pico, 2x20 2.54mm pitch, converted from RPi_Pico_SMD_TH")`;

    for (const [shape, px, py, size, drill] of NPTH) {
      out += `
    (pad "" np_thru_hole ${shape} (at ${x(px)} ${py} ${p.r}) (size ${size} ${size}) (drill ${drill}) (layers "*.Cu" "*.Mask"))`;
    }
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

    const line = (layer, [x1, y1, x2, y2, w]) => `
    (fp_line (start ${x(x1)} ${y1}) (end ${x(x2)} ${y2}) (stroke (width ${w}) (type solid)) (layer ${L(layer)}))`;
    for (const layer of ['SilkS', 'Fab', 'CrtYd']) {
      for (const seg of LINES[layer]) out += line(layer, seg);
    }
    if (p.show_keepout) {
      for (const pts of KEEPOUTS) {
        out += `
    (fp_poly (pts ${pts.map(([a, b]) => `(xy ${x(a)} ${b})`).join(' ')}) (stroke (width 0.1) (type solid)) (fill solid) (layer "Dwgs.User"))`;
      }
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
