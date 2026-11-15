// Embeds Liberation Sans (Arial-compatible) and Carlito (Calibri-compatible) into PDFs,
// so ₱, ñ and – always print. Fonts are downloaded once from /public/fonts and cached.
import type { jsPDF } from 'jspdf';

export const PDF_FONT = 'LiberationSans';
export const PDF_FONT_CALIBRI = 'Carlito';

const FILES: [file: string, family: string, style: string][] = [
  ['LiberationSans-Regular.ttf', PDF_FONT, 'normal'],
  ['LiberationSans-Bold.ttf', PDF_FONT, 'bold'],
  ['LiberationSans-Italic.ttf', PDF_FONT, 'italic'],
  ['Carlito-Regular.ttf', PDF_FONT_CALIBRI, 'normal'],
  ['Carlito-Bold.ttf', PDF_FONT_CALIBRI, 'bold'],
];

type Source = (file: string) => Promise<string>; // returns base64

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

let source: Source = async (file) => toBase64(await (await fetch(`/fonts/${file}`)).arrayBuffer());
const cache = new Map<string, Promise<string>>();

/** Tests (Node) read the files from disk instead of fetching them. */
export function setFontSource(s: Source) {
  source = s;
  cache.clear();
}

export async function addPdfFonts(doc: jsPDF) {
  const data = await Promise.all(
    FILES.map(([file]) => {
      if (!cache.has(file)) cache.set(file, source(file));
      return cache.get(file)!;
    }),
  );
  FILES.forEach(([file, family, style], i) => {
    doc.addFileToVFS(file, data[i]);
    doc.addFont(file, family, style);
  });
  doc.setFont(PDF_FONT, 'normal');
}
