# Domain2Revenue AI

Find undervalued domains and local businesses that need a better web presence, and turn the research into
evidence-backed proposals. Built in phases; Phases 1–4 are in this code.

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

**Website studio growth engine** (per selected prospect)
- Competitive position first: each business is compared with nearby businesses on six dimensions (reputation and
  trust, ease of buying, responsiveness, clarity of offer, discoverability, digital foundation), weighted by what
  decides customers in its industry. Website defects are one input (digital foundation, lowest weight). The audit says
  where it is ahead, behind or on open ground, the capabilities to build, implementations ranked by evidence
  likelihood, and a five-year industry outlook with readiness (an outlook, never a forecast). Evidence strength is
  scored and says what to add. Gaps that win back competitive ground rank ahead of plain defects in the plan.
- Every observed website gap (and labelled industry recommendations) is mapped to a solution, website feature, AI or
  automation, customer benefit, KPI, priority and dependencies, then grouped into Growth Engines (lead generation,
  sales conversion, customer experience, retention, operational automation, search visibility, business intelligence).
- The preview has two pages: the proposed website (service finder, qualifying enquiry form, FAQ and a scripted
  concierge, each labelled working / simulated / proposed / not configured) and a client-ready growth plan (today vs
  proposed, Growth Engines as the primary services with the website as the foundation, gap-to-growth map, rollout,
  KPIs and a what-if calculator with no pre-filled baseline). Competitor names, evidence and financials stay internal.
- Studio: multi-prospect generation one at a time with real per-stage status and retry, desktop/tablet/mobile frames,
  refinements (premium style, hero, lead generation, engine priority, segment, sections), versions with compare and
  restore. Deterministic code only; the one external call is the app's own home-page check when it is stale.
- Original website inventory: the prospect's own site is read page by page (navigation, sitemap, robots.txt; up to
  12 pages, a few per server step). Each page keeps its URL, extraction status and what was missing. Customer quotes
  are kept word for word with their source; vague or numeric claims ("award-winning", "5000+ patients") are set aside
  for review, never shown. Official social profiles and the share image are captured too.
- Blueprint: every original page is improved, preserved, merged, replaced or excluded with a reason, and every saved
  Growth Plan item is mapped to the page and component that builds it (built / simulated / proposed / needs review).
  On rebuild the saved plan is the source of truth. The preview becomes a multi-page site (`?page=`), including
  service detail pages, in the business's own logo and colours.
- Self-contained site: articles and case studies become pages of the proposed site (with source credit), testimonials
  get their own page when quotes were found, careers is kept in the footer. Visitors only leave for official social
  profiles, a map, phone or email. Legal pages are never generated.
- Design system: five directions (Premium Corporate, Modern Minimal, Bold Conversion-Focused, Industry Specialist,
  Contemporary Editorial) with a palette derived from the brand colour, deepened where needed so buttons and text meet
  WCAG AA. Switching direction in the studio keeps every page and fact; a version is saved first.
- Working interactions: navigation with active state, "More" menu and mobile menu; capability lists become tabs with
  a next step ("Ask about X" opens the form with X selected); a validated enquiry form and a four-step booking request
  (service, day and time window, details, review). A preview never claims anything was sent.
- Quality gate: navigation, calls to action, interactive elements, forms, self-containment, accuracy, attributed
  proof, Growth Plan placement, kept context and contrast, scored on every generation and in the studio. Any failed
  required check caps the score at 59. Browser checks are reported as "not run here", never as passed.

**Phase 4, proposals** (per selected prospect)
- One proposal per prospect, built in code from saved research only: the client-safe growth plan (today vs proposed,
  Growth Engines, scope, rollout, KPIs, dependencies), the shared preview link, the campaign's service prices (or the
  workspace defaults) and the financial model. No AI calls, no competitor names, no internal notes.
- Website line priced as a redesign when the business has a site, otherwise a new build; a missing price shows "To be
  confirmed" and blocks "ready". Expected impact appears only when the financial model is complete, labelled as an
  estimate with its confidence. Internal checks flag price mismatches with the model, low confidence, an unshared
  preview and any other business's name in the text.
- Print-ready A4 view at `/print/proposal/<prospect>` (save as PDF from the browser), editable summary, prices and
  next steps, versions with restore, and draft / ready / archived status (audited).
- Three email drafts (first email, follow-ups on day 3 and day 7) that mention only observed gaps and include an
  opt-out line. Edit, copy, or open them in your own email app. Nothing is sent; sending arrives in Phase 5.
- Campaign overview at `/campaigns/<id>/proposals` drafts every missing proposal one at a time.

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
npm run test:e2e:sites       # generated websites: sample businesses in four industries, every page, link, tab,
                             # menu, form and booking step, five directions, 390/768/1280 px. Needs the app running
                             # with SITE_FIXTURES=1 (the /preview/fixture route 404s otherwise); E2E_URL sets the host.
```

## Phases

1. Foundation · 2. Domain discovery, prospect research, scoring · 3. Website previews, competitor analysis,
financial model · 4. Proposals, PDF, email drafts (this release) · 5. Approvals, sending, analytics, hardening
