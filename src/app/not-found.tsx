import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted">It may have been deleted, or you may not have access.</p>
      <Link href="/" className="btn-secondary mt-6">Back to dashboard</Link>
    </main>
  );
}
