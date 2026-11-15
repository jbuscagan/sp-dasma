/**
 * Position of every cell, as a fraction of ONE form's width / height (copied from the
 * Apps Script). The real size comes from DTR settings (default 94 x 195 mm).
 *   A = form with days 1-15      B = form with days 16-31
 */
export const FORM_LAYOUT = {
  A: {
    firstDay: 1,
    cols: [0.12268, 0.2521, 0.38339, 0.51095, 0.64596],
    rows: [0.3959, 0.42721, 0.45851, 0.49304, 0.52434, 0.55611, 0.58787, 0.61872,
      0.65048, 0.68225, 0.71355, 0.74762, 0.778, 0.81068, 0.84245, 0.87697],
    // Header text sits on the printed lines (measured on the form image: x0..x1 = line ends, line = its height).
    header: {
      name: { x0: 0.187, x1: 0.62, line: 0.0765 },
      position: { x0: 0.785, x1: 0.969, line: 0.0765 },
      dept: { x0: 0.178, x1: 0.671, line: 0.112 },
    },
    // Measured on the form image: bottom of "I hereby certify…" and the printed "Employee's signature" line.
    footer: { certifyBottom: 0.902, lineY: 0.9405, lineX0: 0.451, lineX1: 0.961 },
  },
  B: {
    firstDay: 16,
    cols: [0.11548, 0.24119, 0.37052, 0.49624, 0.62919],
    rows: [0.37197, 0.40286, 0.43375, 0.46511, 0.49923, 0.53058, 0.56239, 0.59374,
      0.62464, 0.65599, 0.6878, 0.71962, 0.75281, 0.78463, 0.81552, 0.84733, 0.88237],
    header: {
      name: { x0: 0.179, x1: 0.602, line: 0.0855 },
      position: { x0: 0.765, x1: 0.946, line: 0.0852 },
      dept: { x0: 0.17, x1: 0.654, line: 0.12 },
    },
    footer: { certifyBottom: 0.9065, lineY: 0.9454, lineX0: 0.438, lineX1: 0.935 },
  },
} as const;

/**
 * Signature area at the bottom of every form (same for both forms, so the blocks are level):
 * the printed signature line/label of the form image is covered and redrawn as two equal blocks —
 * left = SPM (certifying official), right = employee — each: signature over printed name, short line, label.
 */
export const FOOTER = {
  coverBottom: 0.982, // bottom of the area that is redrawn (fraction of form height)
  coverX0: 0.03,
  coverX1: 0.97,
  leftCenter: 0.27,
  rightCenter: 0.73,
  columnWidth: 0.42,
};
