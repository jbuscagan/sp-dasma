// Placeholder mark (Paru-Paro butterfly, not the official seal). Replace public/logo.svg with the official seal when approved.
export function Logo({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" width={size} height={size} alt="SP Dasmariñas" className="shrink-0" />
  );
}
