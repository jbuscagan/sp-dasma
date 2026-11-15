// Table-header colours for generated reports. The defaults follow the office's convention;
// any other colour can be picked in the Generate window.
export const HEADER_COLORS = {
  skyBlue: { label: 'Sky blue', hex: '#9fd4f2' }, // Medical
  green: { label: 'Green', hex: '#b6d7a8' }, // CSO / NGO (and Solicitation Monitoring)
  red: { label: 'Red', hex: '#ff0000' }, // Christmas Party
  violet: { label: 'Violet', hex: '#d5c3ef' }, // Barangay and SK
  blank: { label: 'Blank', hex: '#ffffff' }, // Personal and Published
} as const;

export const SWATCHES = Object.values(HEADER_COLORS);

/** Black or white text, whichever reads better on the header colour. */
export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.45 ? '#ffffff' : '#000000';
}
