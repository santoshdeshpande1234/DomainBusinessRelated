import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirect";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one.",
  google: "Google sign-in is not available right now.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(safeNext(sp.next));
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#14123a] p-12 text-white lg:flex">
        <p className="text-lg font-semibold tracking-tight">Domain2Revenue <span className="text-indigo-300">AI</span></p>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Turn domains and local research into revenue, with evidence for every number.</h1>
          <ul className="mt-6 space-y-2 text-sm text-indigo-100/80">
            <li>Real data only: every fact keeps its source.</li>
            <li>Nothing is bought, sent or published without your approval.</li>
            <li>Calculations are done in code, with assumptions shown.</li>
          </ul>
        </div>
        <p className="text-xs text-indigo-200/60">Access is by invitation only.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="mb-8 text-lg font-semibold tracking-tight lg:hidden">Domain2Revenue <span className="text-accent">AI</span></p>
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Use the email your workspace admin invited.</p>
          <LoginForm next={safeNext(sp.next)} google={process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1"} initialError={sp.error ? ERRORS[sp.error] : undefined} />
        </div>
      </section>
    </main>
  );
}
