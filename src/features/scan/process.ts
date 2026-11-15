'use client';
// Turns uploaded files (photos and/or PDFs) into "documents" ready for review:
//  • PDFs with real text: read directly (fast, exact); prepared transmittal tables become one document per row,
//  • scanned PDFs and photos: each page is cleaned up (grey, more contrast, enlarged) and read with OCR,
//  • pages are grouped into letters, and fields are guessed with a confidence for each.
// Everything runs in the browser; nothing is sent to an outside service.
import { extractLetter, splitPages, type Confidence, type Extracted, type Guess } from './extract';
import { itemsToText, pageTextItems } from './pdfText';
import { detectTransmittalType, parseTransmittalPage, splitOrgBarangay } from './tableParse';
import type { TransmittalType } from '@/lib/types';

export interface ScanDoc {
  key: string;
  source: 'letter' | 'table';
  fileIndex: number;
  pageLabel: string; // "photo.jpg" or "file.pdf p. 2–3"
  thumbs: string[]; // small images of the pages
  text: string; // text that was read (for checking)
  fields: Extracted;
  solicitor?: string; // medical tables list "Solicitor: …" and "Patient: …" separately
  detectedType?: TransmittalType | null; // for rows of prepared transmittal PDFs
  include: boolean;
}

export interface Progress {
  step: string;
  done: number;
  total: number;
}

interface PageRead {
  seq: number; // upload order, so letters keep their page order
  fileIndex: number;
  label: string;
  thumb: string;
  text: string;
}

const high = (value: string): Guess => ({ value, confidence: value ? 'high' : 'none' });

// ---------------------------------------------------------------- images

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return c;
}

/** Grey, contrast-stretched and about 2000 px wide: OCR reads this much better than a raw phone photo. */
export function prepareForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const scale = Math.min(2.5, Math.max(1, 2000 / src.width));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
  }
  // stretch between the 2nd and 98th percentile
  const n = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let a = 0, s = 0; a < 256; a++) if ((s += hist[a]) > n * 0.02) { lo = a; break; }
  for (let a = 255, s = 0; a >= 0; a--) if ((s += hist[a]) > n * 0.02) { hi = a; break; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function thumbOf(src: HTMLCanvasElement, width = 600): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((src.height * width) / src.width);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

// ---------------------------------------------------------------- OCR (2 readers in parallel)

type Scheduler = { addJob: (a: 'recognize', img: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

async function makeScheduler(): Promise<Scheduler> {
  const { createScheduler, createWorker } = await import('tesseract.js');
  const scheduler = createScheduler();
  const count = (navigator.hardwareConcurrency ?? 2) >= 4 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    // Files are served by this site (copied to public/ocr at build time), not downloaded from a CDN.
    const w = await createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang', gzip: true });
    await w.setParameters({ preserve_interword_spaces: '1' } as Record<string, string>);
    scheduler.addWorker(w);
  }
  return scheduler as unknown as Scheduler;
}

// ---------------------------------------------------------------- PDF

async function openPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

// ---------------------------------------------------------------- main

export async function processFiles(
  files: File[],
  ctx: { barangays: string[]; orgs: string[]; medical: boolean; type?: TransmittalType },
  onProgress: (p: Progress) => void,
): Promise<ScanDoc[]> {
  const docs: ScanDoc[] = [];
  const letterPages: PageRead[] = [];
  const toOcr: { seq: number; fileIndex: number; label: string; canvas: HTMLCanvasElement; thumb: string }[] = [];
  let seq = 0;

  // 1. read PDFs' own text, collect pages that need OCR
  for (const [fi, f] of files.entries()) {
    onProgress({ step: `Opening ${f.name}…`, done: fi, total: files.length });
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      const pdf = await openPdf(f);
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const items = await pageTextItems(page);
        const vp = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 2000 / vp.width);
        const canvas = document.createElement('canvas');
        const v2 = page.getViewport({ scale });
        canvas.width = Math.round(v2.width);
        canvas.height = Math.round(v2.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: v2 }).promise;
        const thumb = thumbOf(canvas);
        const label = `${f.name} p. ${p}`;
        const pageSeq = seq++;
        const text = itemsToText(items);
        if (text.replace(/\s/g, '').length > 40) {
          // digital page: a prepared transmittal table → one document per row; otherwise a letter
          const rows = parseTransmittalPage(items);
          const detectedType = detectTransmittalType(text.slice(0, 600));
          if (rows.length) {
            rows.forEach((r, ri) => {
              const ob = r.orgBarangay ? splitOrgBarangay(r.orgBarangay, ctx.barangays) : { organization: '', barangay: '' };
              docs.push({
                key: `${fi}-${p}-${ri}`,
                source: 'table',
                fileIndex: fi,
                pageLabel: `${label}, row ${ri + 1}`,
                thumbs: [thumb],
                text: Object.values(r).join(' · '),
                detectedType,
                // rows of another kind of transmittal (e.g. a Medical page while on Christmas Party) start unticked
                include: !detectedType || !ctx.type || detectedType === ctx.type,
                fields: {
                  name: high(ctx.medical ? r.patient_name || r.solicitor_name || '' : r.solicitor_name || ''),
                  organization: high(r.organization ?? ob.organization),
                  barangay: high(r.barangay ?? ob.barangay),
                  request: high(r.request ?? ''),
                  purpose: high(r.purpose ?? ''),
                  dateReceived: high(r.date_received ?? ''),
                  eventDate: high(r.event_date ?? ''),
                  contact: high(r.contact_number ?? ''),
                  diagnosis: high(r.diagnosis ?? ''),
                },
                solicitor: ctx.medical && r.patient_name ? r.solicitor_name : undefined,
              });
            });
          } else letterPages.push({ seq: pageSeq, fileIndex: fi, label, thumb, text });
        } else toOcr.push({ seq: pageSeq, fileIndex: fi, label, canvas, thumb });
      }
    } else if (f.type.startsWith('image/')) {
      const canvas = await fileToCanvas(f);
      toOcr.push({ seq: seq++, fileIndex: fi, label: f.name, canvas, thumb: thumbOf(canvas) });
    }
  }

  // 2. OCR the scanned pages / photos, two at a time
  if (toOcr.length) {
    onProgress({ step: 'Preparing the text reader (first time takes a few seconds)…', done: 0, total: toOcr.length });
    const scheduler = await makeScheduler();
    try {
      let done = 0;
      const results = await Promise.all(
        toOcr.map(async (pg) => {
          const r = await scheduler.addJob('recognize', prepareForOcr(pg.canvas));
          onProgress({ step: 'Reading text…', done: ++done, total: toOcr.length });
          return { ...pg, text: r.data.text };
        }),
      );
      // keep the original order
      results.forEach((r) => letterPages.push({ seq: r.seq, fileIndex: r.fileIndex, label: r.label, thumb: r.thumb, text: r.text }));
    } finally {
      await scheduler.terminate();
    }
  }

  // 3. group pages into letters and guess the fields
  letterPages.sort((a, b) => a.seq - b.seq);
  const groups = splitPages(letterPages.map((p) => p.text));
  groups.forEach((g, gi) => {
    const pages = g.map((i) => letterPages[i]);
    const text = pages.map((p) => p.text).join('\n\n');
    docs.push({
      key: `L${gi}`,
      source: 'letter',
      fileIndex: pages[0].fileIndex,
      pageLabel: pages.length > 1 ? `${pages[0].label} – ${pages[pages.length - 1].label.split(' ').pop()}` : pages[0].label,
      thumbs: pages.map((p) => p.thumb),
      text,
      include: true,
      fields: extractLetter(text, ctx),
    });
  });
  return docs;
}

export const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: 'border-l-4 border-l-emerald-500',
  medium: 'border-l-4 border-l-amber-400',
  low: 'border-l-4 border-l-red-400 bg-red-50/40 dark:bg-red-950/20',
  none: 'border-l-4 border-l-slate-300',
};
