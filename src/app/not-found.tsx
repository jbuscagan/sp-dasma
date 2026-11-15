import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/" className="text-brand-600 hover:underline">Back to dashboard</Link>
    </div>
  );
}
