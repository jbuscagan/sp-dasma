// DTR printing.
//  • sheet3 (default): 3 forms side by side on A4 landscape, the scanned form printed too (plain paper),
//    slots alternate 1-15, 16-31, 1-15 | 16-31, 1-15, 16-31 … then cut.
//  • single: one form per page, text only, for feeding pre-printed forms.
import { jsPDF } from 'jspdf';
import { addPdfFonts, PDF_FONT, PDF_FONT_CALIBRI } from '@/lib/pdfFonts';
import { FOOTER, FORM_LAYOUT } from './layout';
import { minToPrint, slotIndexes, type DtrSettings, type FormPlan } from './engine';


export interface PersonPlan {
  id: string;
  name: string;
  position: string;
  dept: string;
  forms: FormPlan[];
  signature?: string; // employee e-signature (data URL), printed on the employee's signature line
}

export interface DtrImages {
  formA?: string; // data URL of the blank 1-15 form
  formB?: string; // data URL of the blank 16-31 form
  official?: string; // data URL of the certifying official's e-signature
}

const A4 = { w: 297, h: 210 };

interface Slot {
  type: 'A' | 'B';
  form: FormPlan | null;
  person: PersonPlan | null;
}

export async function renderDtrPdf(plan: PersonPlan[], s: DtrSettings, images: DtrImages = {}, opts: { guides?: boolean } = {}) {
  const sheet = s.layout !== 'single';
  const pageW = sheet ? A4.w : s.offsetL + s.formW;
  const pageH = sheet ? A4.h : s.offsetT + s.formH;
  const orientation = pageW > pageH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation });
  await addPdfFonts(doc);

  // 1. Every form in order, then into alternating A/B slots.
  const flat = plan.flatMap((person) => person.forms.map((form) => ({ person, form })));
  const slots: Slot[] = [];
  if (sheet) {
    const idx = slotIndexes(flat.map((f) => f.form.type));
    const count = flat.length ? idx[idx.length - 1] + 1 : 0;
    const perSheet = Math.ceil(count / 3) * 3; // fill the last sheet with blank forms
    for (let i = 0; i < perSheet; i++) slots.push({ type: i % 2 === 0 ? 'A' : 'B', form: null, person: null });
    flat.forEach((f, i) => (slots[idx[i]] = { type: f.form.type, form: f.form, person: f.person }));
  } else {
    flat.forEach((f) => slots.push({ type: f.form.type, form: f.form, person: f.person }));
  }

  // 2. Draw.
  const perPage = sheet ? 3 : 1;
  const pageOf: Record<string, { from: number; to: number; name: string }> = {};
  slots.forEach((slot, i) => {
    const pos = i % perPage;
    if (i > 0 && pos === 0) doc.addPage([pageW, pageH], orientation);
    const page = Math.floor(i / perPage) + 1;
    const left = (sheet ? s.sheetMarginX + pos * (s.formW + s.sheetGap) : s.offsetL) + s.xShift;
    const top = (sheet ? s.sheetMarginY : s.offsetT) + s.yShift;
    drawForm(doc, slot, s, left, top, images, sheet && s.printBackground, opts.guides);
    if (slot.person) {
      const p = (pageOf[slot.person.id] ??= { from: page, to: page, name: slot.person.name });
      p.to = page;
    }
  });

  const order = plan.filter((p) => pageOf[p.id]).map((p) => pageOf[p.id]);
  return { blob: doc.output('blob'), pages: doc.getNumberOfPages(), forms: flat.length, order };
}

function drawForm(doc: jsPDF, slot: Slot, s: DtrSettings, left: number, top: number, images: DtrImages, background: boolean, guides?: boolean) {
  const L = FORM_LAYOUT[slot.type];
  const W = s.formW;
  const H = s.formH;
  const X = (f: number) => left + f * W;
  const Y = (f: number) => top + f * H;
  doc.setTextColor(0);

  if (background) {
    const img = slot.type === 'A' ? images.formA : images.formB;
    if (img) doc.addImage(img, 'JPEG', left, top, W, H);
    doc.setDrawColor(0).setLineWidth(0.3).rect(left, top, W, H); // cutting border
  }

  if (guides) {
    doc.setDrawColor(255, 0, 0).setLineWidth(0.1);
    L.rows.forEach((r) => doc.line(X(L.cols[0]), Y(r), X(L.cols[4]), Y(r)));
    L.cols.forEach((c) => doc.line(X(c), Y(L.rows[0]), X(c), Y(L.rows[L.rows.length - 1])));
    doc.rect(left, top, W, H);
  }

  // Signature area (also on blank forms): SPM left, employee right, on the same level.
  drawFooter(doc, slot, s, X, Y, W, H, images, background);

  const person = slot.person;
  const form = slot.form;
  if (!person || !form) return;

  // Name / position / department — shrink long text so it stays on its line.
  ([
    ['name', person.name],
    ['position', person.position],
    ['dept', person.dept],
  ] as const).forEach(([key, raw]) => {
    const text = String(raw || '').toUpperCase();
    if (!text) return;
    const f = L.header[key];
    // Fit inside the printed line (small side margins) and sit just above it.
    const fieldW = (f.x1 - f.x0) * W - 1.5;
    doc.setFont(PDF_FONT, 'bold').setFontSize(s.headFont);
    const size = Math.max(4.5, Math.min(s.headFont, (s.headFont * fieldW) / Math.max(1, doc.getTextWidth(text))));
    doc.setFontSize(size).text(text, X((f.x0 + f.x1) / 2), Y(f.line) - 0.6, { align: 'center' });
  });

  // Times
  doc.setFont(PDF_FONT, 'normal').setFontSize(s.timeFont);
  Object.keys(form.days).forEach((key) => {
    const day = Number(key);
    const i = day - L.firstDay;
    if (i < 0 || i + 1 >= L.rows.length) return;
    const rec = form.days[day];
    const cy = Y((L.rows[i] + L.rows[i + 1]) / 2) + s.timeYShift;
    [rec.amIn, rec.amOut, rec.pmIn, rec.pmOut].forEach((min, c) => {
      if (min === null) return;
      doc.text(minToPrint(min), X((L.cols[c] + L.cols[c + 1]) / 2), cy, { align: 'center', baseline: 'middle' });
    });
  });

}

/**
 * Bottom of the form. With the printed form (plain paper) the form's own long line and label are covered
 * and redrawn as two equal blocks; on pre-printed forms only the names/signatures are added.
 * Each block: e-signature directly above the printed name → short line under the name → small label.
 */
function drawFooter(
  doc: jsPDF,
  slot: Slot,
  s: DtrSettings,
  X: (f: number) => number,
  Y: (f: number) => number,
  W: number,
  H: number,
  images: DtrImages,
  redraw: boolean,
) {
  const L = FORM_LAYOUT[slot.type];
  const top = Y(L.footer.certifyBottom) + 0.8 + s.footerYShift; // just under "I hereby certify…"
  const bottom = Y(FOOTER.coverBottom) + s.footerYShift;
  const colW = FOOTER.columnWidth * W;

  if (redraw) {
    doc.setFillColor(255, 255, 255).rect(X(FOOTER.coverX0), Y(L.footer.certifyBottom) + 0.6, (FOOTER.coverX1 - FOOTER.coverX0) * W, Y(FOOTER.coverBottom) - Y(L.footer.certifyBottom) - 0.6, 'F');
  }

  // Same positions for both blocks → level ("pantay").
  const labelY = redraw ? bottom - 1.2 : Y(L.footer.lineY) + 2.6;
  const lineY = redraw ? labelY - s.footerLabelFont * 0.42 - 0.6 : Y(L.footer.lineY);
  const nameY = lineY - 0.7;
  const sigBottom = nameY + 0.8; // the signature slightly overlaps the name (signature over printed name)
  const sigH = Math.max(3, Math.min(s.footerSigMaxH, sigBottom - top));

  const block = (cx: number, name: string, label: string, signature?: string, showName = true) => {
    if (signature) drawImageFit(doc, signature, cx, sigBottom - sigH / 2, colW * 0.8, sigH);
    let lineHalf = 15; // default line length 30 mm (blank forms)
    if (showName && name) {
      const text = name.toUpperCase();
      doc.setFont(PDF_FONT_CALIBRI, 'bold').setFontSize(s.footerNameFont);
      const size = Math.max(4.5, Math.min(s.footerNameFont, (s.footerNameFont * colW * 0.95) / Math.max(1, doc.getTextWidth(text))));
      doc.setFontSize(size).text(text, cx, nameY, { align: 'center' });
      lineHalf = Math.min(colW / 2, doc.getTextWidth(text) / 2 + 1.5);
    }
    if (redraw) {
      doc.setDrawColor(40).setLineWidth(0.25).line(cx - lineHalf, lineY, cx + lineHalf, lineY);
      doc.setFont(PDF_FONT_CALIBRI, 'normal').setFontSize(s.footerLabelFont).setTextColor(60);
      doc.text(label, cx, labelY, { align: 'center' });
      doc.setTextColor(0);
    }
  };

  if (s.signatoryShow && s.signatoryName) {
    block(X(FOOTER.leftCenter), s.signatoryName, s.signatoryTitle || 'Sangguniang Panlungsod Member', images.official);
  }
  const p = slot.person;
  block(redraw ? X(FOOTER.rightCenter) : X((L.footer.lineX0 + L.footer.lineX1) / 2), p?.name ?? '', "EMPLOYEE'S SIGNATURE", p?.signature, s.employeeNameShow && !!p);
}

/** Draws an image centred on (cx, cy), keeping its proportions inside maxW × maxH. */
function drawImageFit(doc: jsPDF, img: string, cx: number, cy: number, maxW: number, maxH: number) {
  try {
    const p = doc.getImageProperties(img);
    let h = maxH;
    let w = (p.width / p.height) * h;
    if (w > maxW) {
      w = maxW;
      h = (p.height / p.width) * w;
    }
    doc.addImage(img, cx - w / 2, cy - h / 2, w, h);
  } catch {
    // A broken image should not stop the whole PDF.
  }
}
