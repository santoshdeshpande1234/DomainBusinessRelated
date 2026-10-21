"use client";
import { useActionState } from "react";
import { Submit } from "@/components/submit";
import { updatePassword, updateProfile } from "./actions";

type S = { errors?: Record<string, string>; ok?: string } | undefined;
const Msg = ({ s }: { s: S }) => (s?.errors?._ || s?.ok ? <p role="status" className={`text-xs ${s.errors ? "text-bad" : "text-good"}`}>{s.errors?._ ?? s.ok}</p> : null);

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [s, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className="label">Email</label><input className="input" value={email} disabled /></div>
      <div><label className="label" htmlFor="full_name">Full name</label><input className="input" id="full_name" name="full_name" defaultValue={name} maxLength={80} required />
        {s?.errors?.full_name && <p className="error">{s.errors.full_name}</p>}</div>
      <Msg s={s} />
      <Submit pending="Saving…">Save profile</Submit>
    </form>
  );
}

export function PasswordForm() {
  const [s, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        {s?.errors?.password && <p className="error">{s.errors.password}</p>}</div>
      <div><label className="label" htmlFor="confirm">Confirm password</label><input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        {s?.errors?.confirm && <p className="error">{s.errors.confirm}</p>}</div>
      <Msg s={s} />
      <Submit pending="Saving…">Set password</Submit>
    </form>
  );
}
