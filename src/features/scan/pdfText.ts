// Text items of one PDF page in the shape used by tableParse (y measured from the top).
import type { TextItem } from './tableParse';

interface PdfTextItem { str: string; transform: number[]; width: number }
interface PdfPage {
  getViewport(o: { scale: number }): { height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
}

export async function pageTextItems(page: PdfPage): Promise<TextItem[]> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  return (tc.items as PdfTextItem[])
    .filter((i) => typeof i.str === 'string' && i.str.trim())
    .map((i) => ({ str: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width }));
}

/** Plain text of a page, line by line (for letters that are digital PDFs). */
export function itemsToText(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: string[] = [];
  let lastY = -1e9;
  for (const it of sorted) {
    if (Math.abs(it.y - lastY) > 3) out.push('');
    out[out.length - 1] += (out[out.length - 1] ? ' ' : '') + it.str.replace(/​/g, '').trim();
    lastY = it.y;
  }
  return out.map((l) => l.trim()).filter(Boolean).join('\n');
}
