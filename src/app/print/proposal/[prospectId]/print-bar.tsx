"use client";

/** Toolbar above the printable proposal; hidden when printing. */
export function PrintBar({ status, file }: { status: string; file: string }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 text-sm print:hidden">
      <span className="text-neutral-600">{status === "ready" ? "Ready to send." : `Status: ${status}. Mark it ready in the studio before sending.`} In the print dialog, choose &ldquo;Save as PDF&rdquo; ({file}).</span>
      <button type="button" onClick={() => { document.title = file.replace(/\.pdf$/, ""); window.print(); }} className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700">Download PDF</button>
    </div>
  );
}
