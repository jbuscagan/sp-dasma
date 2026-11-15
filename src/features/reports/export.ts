// Entry point used by the UI. Libraries are loaded only when a report is generated (smaller pages).
import type { ExportFormat, ReportDoc } from './types';

const EXT: Record<ExportFormat, string> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx' };

export async function renderReport(r: ReportDoc, format: ExportFormat): Promise<Blob> {
  if (format === 'pdf') return (await import('./pdf')).renderPdf(r);
  if (format === 'docx') return (await import('./docx')).renderDocx(r);
  return (await import('./xlsx')).renderXlsx(r);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportReport(r: ReportDoc, format: ExportFormat) {
  const blob = await renderReport(r, format);
  downloadBlob(blob, `${r.filename}.${EXT[format]}`);
}
