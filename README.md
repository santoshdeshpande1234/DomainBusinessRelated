# Domain2Revenue AI

Find undervalued domains and local businesses that need a better web presence, and turn the research into
evidence-backed proposals. Built in phases; **Phase 1** (this code) is the foundation:

- Invite-only sign-in (password, email link, optional Google) with admin / member / viewer roles
- Campaign wizard (industry, market, objectives, budgets, extensions, limits, pricing) with an exchange-rate snapshot
- Workspace settings, team invites, encrypted integration keys, API usage and an audit log
- Dashboard with setup checklist; later modules are shown as locked

Rules the code follows: no fabricated data, nothing is bought, sent or deployed without approval, calculations are
deterministic code, and every external call is logged with its cost.

## Stack

Next.js 15 (App Router, server actions) · Supabase (Postgres, Auth, row-level security) · Tailwind CSS 4 · Netlify.

Security model: every table has row-level security keyed to the user's workspace and role. Integration secrets are
AES-256-GCM encrypted by the server and the `secret` column is not readable by browser sessions. Audit rows are
written by database triggers only.

## Local setup

```bash
npm install
npx supabase start                 # local Postgres + Auth (Docker); applies supabase/migrations
cp .env.example .env.local         # fill in values printed by `npx supabase status`
openssl rand -base64 32            # → ENCRYPTION_KEY
npm run bootstrap-admin -- --email you@company.com --workspace "Your Company" --name "Your Name" --password "choose-one"
npm run dev                        # http://localhost:3000
```

## Production setup (Supabase + Netlify)

1. Apply `supabase/migrations` to the Supabase project (`npx supabase db push`, or the SQL editor).
2. In Supabase → Authentication:
   - Turn **off** "Allow new users to sign up" (the app is invite-only).
   - Set the Site URL to the app URL and add `<APP_URL>/auth/callback` to the redirect URLs.
   - Optional: enable the Google provider, then set `NEXT_PUBLIC_GOOGLE_AUTH=1`.
3. In Netlify, set the variables from `.env.example` (`SUPABASE_SERVICE_ROLE_KEY` and `ENCRYPTION_KEY` are secret;
   never change `ENCRYPTION_KEY` once keys are saved).
4. Create the first admin with `scripts/bootstrap-admin.mjs` using the production values.

## Tests

```bash
npm run lint && npm run typecheck
npm test              # unit: validation, exchange rates, encryption, permissions
npm run test:rls      # row-level security against the local Supabase stack
npm run test:e2e      # browser walkthrough against a running app (see the file header)
```

## Phases

1. Foundation (this release) · 2. Domain discovery, prospect research, scoring · 3. Website previews, competitor
analysis, financial model · 4. Proposals, PDF, email drafts · 5. Approvals, sending, analytics, hardening
