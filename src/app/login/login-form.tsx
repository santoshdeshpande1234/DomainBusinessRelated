"use client";
import { useActionState, useState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { googleSignIn, magicLink, passwordSignIn, resetPassword, type AuthState } from "./actions";

function Message({ state }: { state: AuthState }) {
  if (!state) return null;
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${state.error ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>{state.error ?? state.info}</p>;
}

export function LoginForm({ next, google, initialError }: { next: string; google: boolean; initialError?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pw, pwAction, pwBusy] = useActionState(passwordSignIn, initialError ? { error: initialError } : undefined);
  const [link, linkAction, linkBusy] = useActionState(magicLink, undefined);
  const onPassword = useKeepValues((fd) => (fd.get("intent") === "reset" ? resetAction(fd) : pwAction(fd)));
  const onLink = useKeepValues(linkAction);
  const [reset, resetAction] = useActionState(resetPassword, undefined);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm" role="tablist">
        {(["password", "link"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`rounded-md py-1.5 font-medium ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
            {m === "password" ? "Password" : "Email link"}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form method="post" onSubmit={onPassword} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div><label className="label" htmlFor="email">Work email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
          <div><label className="label" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div>
          <Message state={pw} />
          <Submit className="btn-primary w-full" pending="Signing in…" busy={pwBusy}>Sign in</Submit>
          <button name="intent" value="reset" formNoValidate className="block w-full text-center text-xs text-muted hover:text-ink">Forgot password? Email me a reset link</button>
          <Message state={reset} />
        </form>
      ) : (
        <form method="post" onSubmit={onLink} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div><label className="label" htmlFor="link-email">Work email</label><input className="input" id="link-email" name="email" type="email" autoComplete="email" required /></div>
          <Message state={link} />
          <Submit className="btn-primary w-full" pending="Sending…" busy={linkBusy}>Email me a sign-in link</Submit>
        </form>
      )}

      {google && (
        <form action={googleSignIn}>
          <input type="hidden" name="next" value={next} />
          <div className="mb-4 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <Submit className="btn-secondary w-full" pending="Redirecting…">Continue with Google</Submit>
        </form>
      )}
    </div>
  );
}
