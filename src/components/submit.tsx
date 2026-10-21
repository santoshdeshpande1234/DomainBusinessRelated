"use client";
import { useTransition } from "react";
import { useFormStatus } from "react-dom";

export function Submit({ children, pending, className = "btn-primary", confirm, busy: forced, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: string; confirm?: string; busy?: boolean }) {
  const status = useFormStatus();
  const busy = forced ?? status.pending;
  return (
    <button type="submit" className={className} disabled={busy || rest.disabled} aria-busy={busy}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} {...rest}>
      {busy && pending ? pending : children}
    </button>
  );
}

/** Submits a form through an action without React's automatic form reset, so inputs keep their values on errors. */
export function useKeepValues(dispatch: (fd: FormData) => void) {
  const [, start] = useTransition();
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    start(() => dispatch(fd));
  };
}
