# Domain2Revenue AI

Find undervalued domains and local businesses that need a better web presence, and turn the research into
evidence-backed proposals. Built in phases; Phases 1–3 are in this code.

**Phase 1, foundation**
- Invite-only sign-in (password, email link, optional Google) with admin / member / viewer roles
- Campaign wizard (industry, market, objectives, budgets, extensions, limits, pricing) with an exchange-rate snapshot
- Workspace settings, team invites, encrypted integration keys, API usage and an audit log

**Phase 2, discovery** (per campaign)
- Domains: ideas from industry words × location × extensions, registry status from RDAP (free, keyless), manual
  price checks and comparable sales with source links, 0–100 score with a visible breakdown and confidence,
  valuation and ROI only from sourced comparables, shortlist (with the campaign limit), compare, approve. Never buys.
- Prospects: Google Places search (paged, cached 24 h, stopped at the campaign's prospect budget), CSV import with
  duplicate detection, the app's own home-page check (HTTPS, mobile viewport, forms, booking, calls to action…),
  0–100 score, searchable table with filters, select-all, exclusion and CSV export.
- Every fact is an `evidence` row with its source URL and time. Missing data is shown as missing, never guessed.
- Long jobs run as short steps the page repeats, so they fit serverless time limits and resume after interruptions.

**Phase 3, opportunity** (per selected prospect)
- Competitors: from the campaign's own results (free), one Google Maps search (cached, within budget, records the
  prospect's search position), or by hand. Home pages are checked and compared feature by feature; strengths,
  competitor advantages, unserved needs and recommendations are labelled as observed facts or assumptions.
- Financial model: lead-generation or ecommerce formulas in code, each input marked actual / benchmark (with link) /
  assumption, conservative · base · upside scenarios, ramp-up, lead quality, capacity, seasonality, ROI, payback,
  hours saved and a running-net chart. Confidence falls as assumptions rise; missing inputs are asked for.
- Website studio: a templated, responsive concept site from verified facts only (services from the business's own
  navigation, otherwise highlighted placeholders), four styles and two layouts, SEO metadata and schema.org data.
  Private staging link at `/preview/<token>`, never indexed; a share link needs "ready" status and can be revoked.
  No AI copy yet (OpenAI drafting is planned once a key is saved).

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
npm test              # unit: validation, exchange rates, encryption, permissions, scoring, parsing
npm run test:rls      # row-level security against the local Supabase stack
npm run test:e2e      # Phase 1 browser walkthrough against a running app (see the file header)
npm run test:e2e:discovery   # Phase 2 walkthrough; external lookups are pre-loaded into the cache
npm run test:e2e:studio      # Phase 3 walkthrough; prospects and website checks are seeded
```

## Phases

1. Foundation · 2. Domain discovery, prospect research, scoring · 3. Website previews, competitor analysis,
financial model (this release) · 4. Proposals, PDF, email drafts · 5. Approvals, sending, analytics, hardening
