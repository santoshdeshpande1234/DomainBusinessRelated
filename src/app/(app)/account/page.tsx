import { Card, Notice, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/session";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata = { title: "Account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string; reset?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  return (
    <>
      <PageHeader title="Your account" description={`Signed in as ${s.email} · ${s.role} of ${s.workspace.name}`} />
      {sp.welcome && <div className="mb-6"><Notice tone="good">Welcome to {s.workspace.name}! Add your name and set a password so you can sign in without an email link.</Notice></div>}
      {sp.reset && <div className="mb-6"><Notice>Choose a new password below.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile"><ProfileForm name={s.name ?? ""} email={s.email} /></Card>
        <Card title="Password" description="You can always sign in with an email link instead."><PasswordForm /></Card>
      </div>
    </>
  );
}
