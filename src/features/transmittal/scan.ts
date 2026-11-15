// Reads text from photos of solicitation letters (runs in the browser, nothing is sent to a third party
// except the OCR language file, which tesseract.js downloads once from its CDN).

export async function ocrImage(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

/** Finds mobile numbers and dates in scanned text so they can pre-fill the form. */
export function extractHints(text: string) {
  const phones = Array.from(new Set((text.match(/(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g) ?? []).map((p) => p.replace(/[\s-]/g, '').replace(/^\+?63/, '0'))));
  const dates = Array.from(
    new Set([
      ...(text.match(new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?,?\\s+\\d{4}`, 'gi')) ?? []),
      ...(text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ?? []),
    ]),
  );
  return { phones, dates };
}
