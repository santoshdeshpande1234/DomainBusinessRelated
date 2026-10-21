export const metadata = { title: "No access" };

export default function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">You don&apos;t have access yet</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in, but this account isn&apos;t part of a workspace. Ask your workspace admin to invite this email
          address, or sign in with the address they invited. Invitations expire after 7 days.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn-secondary">Sign out</button>
        </form>
      </div>
    </main>
  );
}
