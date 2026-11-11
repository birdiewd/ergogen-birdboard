// 0xCB Helios (RP2040, Pro Micro / Elite-C footprint), variant "Helios_AC":
// SMD edge pads, USB pointing away from the PCB.
//
// Converted by script from the KiCad footprint `Helios_AC` in ebastler's marbastlib
// (library marbastlib-xp-promicroish, EXPERIMENTAL: the library marks xp footprints
// as needing a confirmed build before use). Pad numbers, positions, sizes, rotation,
// roundrect ratio, the three through-hole pads, silkscreen and comment-layer drawings
// are parsed from that file.
//
// The source footprint has pad NUMBERS only. Pad names below were derived by matching
// each pad's position against the module's own castellated and through-hole pads in the
// Helios rev1.0 PCB (0xCB-dev/0xCB-Helios, CERN-OHL-S-2.0; footprint `0xcb:helios`,
// which carries the GPIO function of every pad). Every one of the 34 pads matched exactly
// one module pad, and every module pad was used once. The module's pad numbers differ
// from marbastlib's numbers, so do not mix the two numberings.
//
// Each pin is a net parameter; the default net is the parameter name, remap it in
// config.yaml, e.g.   GP4: pinky   GP10: top
// Several GND pads share the one `GND` parameter. `RGB_5V` is GP25 after the module's
// level shifter (5V logic). `RAW` is the module's 5V pad (VBUS or battery, per the
// Helios jumper). `USB_DP` / `USB_DM` are the module's D+ / D- pads.
//
// pad -> parameter (module pin function)
//   pad  1  GP0     (IO0/TX)
//   pad  2  GP1     (IO1/RX)
//   pad  3  GND     (GND)
//   pad  4  GND     (GND)
//   pad  5  GP2     (IO2/SDA)
//   pad  6  GP3     (IO3/SCL)
//   pad  7  GP4     (IO4)
//   pad  8  GP5     (IO5)
//   pad  9  GP6     (IO6)
//   pad 10  GP7     (IO7)
//   pad 11  GP8     (IO8)
//   pad 12  GP9     (IO9)
//   pad 13  RAW     (5V)
//   pad 14  GND     (GND)
//   pad 15  RST     (RST)
//   pad 16  V3V3    (3V3)
//   pad 17  GP29    (IO29/A3)
//   pad 18  GP28    (IO28/A2)
//   pad 19  GP27    (IO27/A1)
//   pad 20  GP26    (IO26/A0)
//   pad 21  GP22    (IO22/SCK)
//   pad 22  GP20    (IO20/SDI)
//   pad 23  GP23    (IO23/SDO)
//   pad 24  GP21    (IO21/CS)
//   pad 25  GP12    (IO12)
//   pad 26  GP13    (IO13)
//   pad 27  GP14    (IO14)
//   pad 28  GP15    (IO15)
//   pad 29  GP16    (IO16)
//   pad 30  GP11    (IO11)
//   pad 31  GP10    (IO10)
//   pad 32  USB_DP  (D+)
//   pad 33  USB_DM  (D-)
//   pad 34  RGB_5V  (IO25/shifted)
//
// Params
//   side           'F' (default) | 'B'  -- mirrors x for back-side mounting
//   show_silk      silkscreen outline, pin-1 mark, "USB" labels (default true)
//   show_comments  Cmts.User keep-in rectangles and USB comment (default true)
//
// The footprint is marked exclude_from_bom and exclude_from_pos_files, as in the
// source, so the controller is not sent to the fab's assembly service.

// [pad, x, y, rot, w, h, roundrect_rratio]
const SMD = [[1,-8.92,-13.97,0.0,3.5,1.8,0.25],[2,-8.92,-11.43,0.0,3.5,1.8,0.25],[3,-8.92,-8.89,0.0,3.5,1.8,0.25],[4,-8.92,-6.35,0.0,3.5,1.8,0.25],[5,-8.92,-3.81,0.0,3.5,1.8,0.25],[6,-8.92,-1.27,0.0,3.5,1.8,0.25],[7,-8.92,1.27,0.0,3.5,1.8,0.25],[8,-8.92,3.81,0.0,3.5,1.8,0.25],[9,-8.92,6.35,0.0,3.5,1.8,0.25],[10,-8.92,8.89,0.0,3.5,1.8,0.25],[11,-8.92,11.43,0.0,3.5,1.8,0.25],[12,-8.92,13.97,0.0,3.5,1.8,0.25],[13,8.92,-13.97,0.0,3.5,1.8,0.25],[14,8.92,-11.43,0.0,3.5,1.8,0.25],[15,8.92,-8.89,0.0,3.5,1.8,0.25],[16,8.92,-6.35,0.0,3.5,1.8,0.25],[17,8.92,-3.81,0.0,3.5,1.8,0.25],[18,8.92,-1.27,0.0,3.5,1.8,0.25],[19,8.92,1.27,0.0,3.5,1.8,0.25],[20,8.92,3.81,0.0,3.5,1.8,0.25],[21,8.92,6.35,0.0,3.5,1.8,0.25],[22,8.92,8.89,0.0,3.5,1.8,0.25],[23,8.92,11.43,0.0,3.5,1.8,0.25],[24,8.92,13.97,0.0,3.5,1.8,0.25],[25,-5.08,15.27,90.0,3.5,1.8,0.25],[26,-2.54,15.27,90.0,3.5,1.8,0.25],[27,0.0,15.27,90.0,3.5,1.8,0.25],[28,2.54,15.27,90.0,3.5,1.8,0.25],[29,5.08,15.27,90.0,3.5,1.8,0.25],[30,8.92,-16.51,180.0,3.5,1.8,0.25],[31,-8.92,-16.51,0.0,3.5,1.8,0.25]];
// [pad, x, y, size, drill]
const TH = [[32,-1.27,-8.89,1.8,1.0],[33,1.27,-8.89,1.8,1.0],[34,-5.08,11.43,1.8,1.0]];
// [x1, y1, x2, y2, width]
const LINES = [[-6.22,15.44,-7.62,15.44,0.15],[-3.55,-14.2,-3.55,-17.98,0.15],[3.55,-14.2,-3.55,-14.2,0.15],[3.55,-14.2,3.55,-17.98,0.15],[7.62,-17.98,-7.62,-17.98,0.15],[7.62,15.44,6.22,15.44,0.15]];
// [startx, starty, midx, midy, endx, endy, width]
const ARCS = [[-8.659446,-17.549446,-8.182544,-17.868102,-7.62,-17.98,0.15],[-7.62,15.44,-8.182545,15.328103,-8.659447,15.009447,0.15],[7.62,-17.98,8.182545,-17.868103,8.659447,-17.549447,0.15],[8.659447,15.009447,8.182545,15.328103,7.62,15.44,0.15]];
// [x1, y1, x2, y2, width]
const RECTS = [[-4.449999,-18.629999,4.450001,-11.979999,0.15],[8.89,-17.78,-8.89,15.24,0.2]];
// [text, x, y, layer, size, justify]
const TEXTS = [["1",-6.02,-13.2825,"SilkS",1.0,"bottom"],["USB",0.0,-16.2,"SilkS",1.0,"bottom"],["topside",0.0,-14.8,"SilkS",1.0,"bottom"],["USB",0.0,-16.2,"User",1.0,"bottom"]];
const REF_XY = [-10.58,16.44];
// pad number -> net parameter name
const PAD_PARAM = {"1":"GP0","2":"GP1","3":"GND","4":"GND","5":"GP2","6":"GP3","7":"GP4","8":"GP5","9":"GP6","10":"GP7","11":"GP8","12":"GP9","13":"RAW","14":"GND","15":"RST","16":"V3V3","17":"GP29","18":"GP28","19":"GP27","20":"GP26","21":"GP22","22":"GP20","23":"GP23","24":"GP21","25":"GP12","26":"GP13","27":"GP14","28":"GP15","29":"GP16","30":"GP11","31":"GP10","32":"USB_DP","33":"USB_DM","34":"RGB_5V"};

module.exports = {
  params: {
    designator: 'MCU',
    side: 'F',
    show_silk: true,
    show_comments: true,
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
    RAW: { type: 'net', value: 'RAW' },
    RST: { type: 'net', value: 'RST' },
    V3V3: { type: 'net', value: 'V3V3' },
    GP29: { type: 'net', value: 'GP29' },
    GP28: { type: 'net', value: 'GP28' },
    GP27: { type: 'net', value: 'GP27' },
    GP26: { type: 'net', value: 'GP26' },
    GP22: { type: 'net', value: 'GP22' },
    GP20: { type: 'net', value: 'GP20' },
    GP23: { type: 'net', value: 'GP23' },
    GP21: { type: 'net', value: 'GP21' },
    GP12: { type: 'net', value: 'GP12' },
    GP13: { type: 'net', value: 'GP13' },
    GP14: { type: 'net', value: 'GP14' },
    GP15: { type: 'net', value: 'GP15' },
    GP16: { type: 'net', value: 'GP16' },
    GP11: { type: 'net', value: 'GP11' },
    GP10: { type: 'net', value: 'GP10' },
    USB_DP: { type: 'net', value: 'USB_DP' },
    USB_DM: { type: 'net', value: 'USB_DM' },
    RGB_5V: { type: 'net', value: 'RGB_5V' },
  },
  body: p => {
    const side = p.side === 'B' ? 'B' : 'F';
    const sx = side === 'B' ? -1 : 1; // back-side footprints are stored mirrored in x
    const x = v => sx * v;
    const L = name => `"${side}.${name}"`;
    const net = n => p[PAD_PARAM[n]].str;
    const stroke = w => `(stroke (width ${w}) (type solid))`;
    const mirror = side === 'B' ? ' mirror' : '';

    let out = `
  (footprint "custom:mcu_helios" (layer "${side}.Cu")
    (at ${p.x} ${p.y} ${p.r})
    (property "Reference" "${p.ref}" (at ${x(REF_XY[0])} ${REF_XY[1]} ${p.r}) (layer ${L('SilkS')})
      (effects (font (size 1 1) (thickness 0.15)) (justify left${mirror})))
    (attr through_hole exclude_from_pos_files exclude_from_bom)
    (descr "0xCB Helios controller, USB pointing away from PCB, converted from Helios_AC")`;

    for (const [pad, px, py, rot, w, h, rr] of SMD) {
      out += `
    (pad "${pad}" smd roundrect (at ${x(px)} ${py} ${p.r + rot}) (size ${w} ${h}) (layers "${side}.Cu" "${side}.Mask") (roundrect_rratio ${rr}) ${net(pad)})`;
    }
    for (const [pad, px, py, size, drill] of TH) {
      out += `
    (pad "${pad}" thru_hole circle (at ${x(px)} ${py} ${p.r}) (size ${size} ${size}) (drill ${drill}) (layers "*.Cu" "*.Mask") ${net(pad)})`;
    }

    if (p.show_silk) {
      for (const [x1, y1, x2, y2, w] of LINES) {
        out += `
    (fp_line (start ${x(x1)} ${y1}) (end ${x(x2)} ${y2}) ${stroke(w)} (layer ${L('SilkS')}))`;
      }
      for (const [sx1, sy1, mx, my, ex, ey, w] of ARCS) {
        out += `
    (fp_arc (start ${x(sx1)} ${sy1}) (mid ${x(mx)} ${my}) (end ${x(ex)} ${ey}) ${stroke(w)} (layer ${L('SilkS')}))`;
      }
      for (const [t, tx, ty, layer, size, just] of TEXTS) {
        if (layer !== 'SilkS') continue;
        out += `
    (fp_text user "${t}" (at ${x(tx)} ${ty} ${p.r}) (layer ${L('SilkS')})
      (effects (font (size ${size} ${size}) (thickness 0.15)) (justify ${just}${mirror})))`;
      }
    }
    if (p.show_comments) {
      for (const [x1, y1, x2, y2, w] of RECTS) {
        out += `
    (fp_rect (start ${x(x1)} ${y1}) (end ${x(x2)} ${y2}) ${stroke(w)} (fill none) (layer "Cmts.User"))`;
      }
      for (const [t, tx, ty, layer, size, just] of TEXTS) {
        if (layer !== 'User') continue;
        out += `
    (fp_text user "${t}" (at ${x(tx)} ${ty} ${p.r}) (layer "Cmts.User")
      (effects (font (size ${size} ${size}) (thickness 0.15)) (justify ${just}${mirror})))`;
      }
    }
    out += `
  )`;
    return out;
  },
};
