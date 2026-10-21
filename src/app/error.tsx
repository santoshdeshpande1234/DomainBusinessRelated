"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-1 max-w-md text-sm text-muted">{error.message.includes("role does not allow") ? error.message : "Please try again. If it keeps happening, check the server logs."}</p>
      <button onClick={reset} className="btn-secondary mt-6">Try again</button>
    </main>
  );
}
