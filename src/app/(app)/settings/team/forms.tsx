"use client";
import { useActionState } from "react";
import { Submit } from "@/components/submit";
import { ROLES } from "@/lib/options";
import { inviteMember, removeMember, updateMember } from "./actions";

function Status({ state }: { state: { errors?: Record<string, string>; ok?: string } | undefined }) {
  if (!state) return null;
  const msg = state.errors ? state.errors._ ?? Object.values(state.errors)[0] : state.ok;
  return <p role="status" className={`text-xs ${state.errors ? "text-bad" : "text-good"}`}>{msg}</p>;
}

export function InviteForm() {
  const [state, action] = useActionState(inviteMember, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="name@company.com" className="input sm:flex-1" aria-label="Email to invite" />
        <select name="role" defaultValue="member" className="input sm:w-36" aria-label="Role">{ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select>
        <Submit pending="Sending…">Send invite</Submit>
      </div>
      <Status state={state} />
    </form>
  );
}

export function MemberControls({ userId, role, status, self }: { userId: string; role: string; status: string; self: boolean }) {
  const [state, action] = useActionState(updateMember.bind(null, userId), undefined);
  const [rmState, rmAction] = useActionState(removeMember.bind(null, userId), undefined);
  return (
    <div className="space-y-1">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <select name="role" defaultValue={role} className="input w-28 py-1.5" aria-label="Role">{ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select>
        <select name="status" defaultValue={status} className="input w-28 py-1.5" aria-label="Status"><option value="active">Active</option><option value="disabled">Disabled</option></select>
        <Submit className="btn-secondary py-1.5" pending="Saving…">Save</Submit>
      </form>
      {!self && (
        <form action={rmAction}><Submit className="text-xs text-bad hover:underline" pending="Removing…" confirm="Remove this person from the workspace?">Remove</Submit></form>
      )}
      <Status state={state} /><Status state={rmState} />
    </div>
  );
}
