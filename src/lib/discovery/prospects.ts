// Prospect helpers: normalisation, duplicate keys, website audit parsing, scoring and CSV.
// Pure functions only. Website HTML is untrusted: it is pattern-matched, never executed or sent to an AI.
import type { Keyword } from "./keywords";
import type { Component, ScoreResult } from "./domains";

export function normalizeWebsite(raw: string | null | undefined): { url: string; host: string } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return { url: `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname === "/" ? "" : u.pathname}`, host };
  } catch {
    return null;
  }
}

export function dedupeKey(name: string, city: string | null | undefined) {
  const n = name.toLowerCase().normalize("NFKD").replace(/&/g, "and").replace(/\b(the|pvt|private|ltd|limited|llc|inc|co)\b/g, "").replace(/[^a-z0-9]/g, "");
  return `${n}|${(city ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------- website audit

export type Audit = {
  url: string; final_url: string; status: number; https: boolean; ms: number; kb: number;
  title: string | null; description: string | null; viewport: boolean; h1: number;
  forms: number; booking: boolean; cta: string[]; tel: boolean; emails: string[]; schema: boolean;
  copyright_year: number | null; generator: string | null; error?: string;
  // Added in Phase 3; older audits don't have them.
  nav?: string[]; headings?: string[]; pricing?: boolean;
};

const BOOKING = /\b(book (an? )?(appointment|table|now|online|consultation)|schedule (a|an|your)|appointment|calendly\.com|reserve (a|now)|booking)\b/i;
const CTAS = ["contact us", "get a quote", "request a quote", "free quote", "call now", "book now", "get started", "enquire", "inquire", "request a callback", "whatsapp"];

// Navigation labels that say nothing about what a business offers.
const GENERIC_NAV = /^(home|about( us)?|contact( us)?|blog|news|login|log in|sign in|sign up|register|careers|jobs|privacy( policy)?|terms.*|faq|faqs|search|menu|cart|account|my account|gallery|team|our team|testimonials|reviews|more|english|en|skip to content|\W*)$/i;
const PRICE = /[$£€₹]\s?\d|\b(?:rs\.?|inr|usd|aed|sgd)\s?\d|\bpricing\b|\bprices?\b(?! on request)/i;

const strip = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function parseAudit(input: { url: string; finalUrl: string; status: number; html: string; ms: number; bytes: number }, year = new Date().getUTCFullYear()): Audit {
  const h = input.html;
  const meta = (name: string) => h.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
    ?? h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1] ?? null;
  const text = strip(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")).toLowerCase();
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1])).filter((y) => y > 1995 && y <= year);
  const emails = [...new Set([...h.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]).toLowerCase()).filter((e) => EMAIL_RE.test(e)))].slice(0, 5);
  return {
    url: input.url, final_url: input.finalUrl, status: input.status, https: input.finalUrl.startsWith("https://"),
    ms: input.ms, kb: Math.round(input.bytes / 1024),
    title: strip(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200) || null,
    description: meta("description")?.slice(0, 300) ?? null,
    viewport: /<meta[^>]+name=["']viewport["']/i.test(h),
    h1: (h.match(/<h1[\s>]/gi) ?? []).length,
    forms: (h.match(/<form[\s>]/gi) ?? []).length,
    booking: BOOKING.test(text) || /calendly|acuityscheduling|setmore|simplybook|zocdoc|practo/i.test(h),
    cta: CTAS.filter((c) => text.includes(c)),
    tel: /href=["']tel:/i.test(h),
    emails,
    schema: /application\/ld\+json/i.test(h),
    copyright_year: years.length ? Math.max(...years) : null,
    generator: meta("generator")?.slice(0, 80) ?? null,
    nav: [...new Set([...(h.match(/<nav[\s\S]*?<\/nav>/gi) ?? []).join(" ").matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => strip(m[1])).filter((t) => t.length >= 3 && t.length <= 40 && !GENERIC_NAV.test(t)))].slice(0, 12),
    headings: [...h.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => strip(m[1])).filter((t) => t.length >= 3 && t.length <= 80).slice(0, 10),
    pricing: PRICE.test(text),
  };
}

/** Observable opportunities, each tied to an audit fact. */
export function opportunities(a: Audit | null, hasWebsite: boolean, year = new Date().getUTCFullYear()): string[] {
  if (!hasWebsite) return ["No website listed"];
  if (!a) return [];
  if (a.error) return [`Website could not be loaded (${a.error})`];
  const o: string[] = [];
  if (!a.https) o.push("Not served over HTTPS");
  if (!a.viewport) o.push("Not set up for mobile screens (no viewport tag)");
  if (a.forms === 0) o.push("No inquiry form on the home page");
  if (!a.booking) o.push("No online booking found");
  if (a.cta.length === 0) o.push("No clear call to action found");
  if (!a.tel) o.push("Phone number is not tap-to-call");
  if (a.copyright_year && a.copyright_year < year - 2) o.push(`Copyright notice last updated ${a.copyright_year}`);
  if (a.ms > 3000) o.push(`Slow first response (${(a.ms / 1000).toFixed(1)} s)`);
  if (a.kb > 1200) o.push(`Heavy home page (${a.kb} KB of HTML)`);
  if (!a.description) o.push("No search description (meta description)");
  if (!a.schema) o.push("No structured data for search engines");
  return o;
}

// ---------------------------------------------------------------- scoring

export type ProspectFacts = {
  name: string; category: string | null; city: string | null; campaignCity: string | null; status: string | null;
  website: string | null; phone: string | null; email: string | null; contactName: string | null;
  reviews: number | null; audit: Audit | null; evidenceCount: number; industryWords: Keyword[]; searchTerms: string[];
};

export function scoreProspect(f: ProspectFacts): ScoreResult {
  const c: Component[] = [];
  const flags: string[] = [];
  const hay = `${f.name} ${f.category ?? ""}`.toLowerCase();

  const industryHit = f.industryWords.some((k) => hay.includes(k.word)) || f.searchTerms.some((t) => t.toLowerCase().split(" ").some((w) => w.length > 3 && hay.includes(w)));
  const local = !f.campaignCity || (f.city ?? "").toLowerCase() === f.campaignCity.toLowerCase();
  c.push({ key: "fit", label: "Business fit", weight: 25, score: (industryHit ? 60 : 25) + (local ? 40 : 10),
    note: `${industryHit ? "Matches" : "Unclear match to"} the campaign industry; ${local ? "in" : "outside"} the target city` });
  if (f.status && f.status !== "OPERATIONAL") flags.push(`Listed as ${f.status.toLowerCase().replace(/_/g, " ")}`);

  const opps = opportunities(f.audit, !!f.website);
  const audited = !f.website || !!f.audit;
  c.push({ key: "growth", label: "Growth opportunity", weight: 30, score: audited ? Math.min(100, 20 + opps.length * 12) : null,
    note: audited ? `${opps.length} observed opportunit${opps.length === 1 ? "y" : "ies"}` : "Website not checked yet" });

  c.push({ key: "commercial", label: "Commercial potential", weight: 20,
    score: f.reviews == null ? null : f.reviews >= 200 ? 90 : f.reviews >= 50 ? 75 : f.reviews >= 10 ? 55 : 35,
    note: f.reviews == null ? "No public size signal" : `${f.reviews} public reviews (a proxy for customer volume)` });

  const contacts = [f.phone, f.email, f.contactName].filter(Boolean).length;
  c.push({ key: "contact", label: "Contact availability", weight: 15, score: [0, 45, 75, 100][contacts],
    note: [f.phone && "phone", f.email && "email", f.contactName && "named contact"].filter(Boolean).join(", ") || "No contact details" });

  c.push({ key: "evidence", label: "Evidence quality", weight: 10, score: Math.min(100, f.evidenceCount * 20), note: `${f.evidenceCount} sourced fact(s)` });

  const known = c.filter((x) => x.score != null);
  const wsum = known.reduce((s, x) => s + x.weight, 0);
  let score = wsum ? known.reduce((s, x) => s + x.score! * x.weight, 0) / wsum : 0;
  if (f.status && f.status !== "OPERATIONAL") score = Math.min(score, 20);
  return { score: Math.round(score), confidence: Math.round((wsum / 100) * 100), components: c, flags };
}

// ---------------------------------------------------------------- CSV

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

// Spreadsheet apps run cells starting with = + - @ as formulas; prefix them so exports are inert.
const cellOut = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cellOut).join(",")).join("\r\n") + "\r\n";

export const CSV_COLUMNS = ["name", "website", "phone", "email", "address", "city", "region", "country", "category", "contact_name", "contact_role", "notes"] as const;

/** Maps a header row to known columns (case and spacing insensitive). */
export function csvRecords(rows: string[][]) {
  if (rows.length < 2) return { records: [], unknown: [] as string[] };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const alias: Record<string, string> = { company: "name", business: "name", business_name: "name", company_name: "name", url: "website", site: "website", telephone: "phone", contact: "contact_name", title: "contact_role", role: "contact_role", state: "region" };
  const cols = head.map((h) => (CSV_COLUMNS as readonly string[]).includes(h) ? h : alias[h] ?? null);
  const records = rows.slice(1).map((r) => Object.fromEntries(cols.flatMap((c, i) => (c && r[i]?.trim() ? [[c, r[i].trim().slice(0, 300)]] : [])))) as Partial<Record<(typeof CSV_COLUMNS)[number], string>>[];
  return { records, unknown: head.filter((_, i) => !cols[i]) };
}
