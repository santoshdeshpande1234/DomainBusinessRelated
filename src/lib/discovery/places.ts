import "server-only";
import { createHash } from "node:crypto";
import { cached, logUsage } from "./net";

// Google Places API (New), Text Search. Asking for website and phone bills each request at the
// "Text Search Enterprise" rate. Up to 20 businesses come back per request.
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents", "places.websiteUri",
  "places.nationalPhoneNumber", "places.googleMapsUri", "places.primaryTypeDisplayName", "places.businessStatus",
  "places.userRatingCount", "nextPageToken",
].join(",");
export const PLACES_COST_PER_REQUEST_USD = 0.035; // list price, before Google's monthly free allowance

export type Place = {
  id: string; name: string; address: string | null; city: string | null; region: string | null; country: string | null;
  website: string | null; phone: string | null; mapsUrl: string | null; category: string | null; status: string | null; reviews: number | null;
};

type Raw = {
  id: string; displayName?: { text: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string;
  googleMapsUri?: string; primaryTypeDisplayName?: { text: string }; businessStatus?: string; userRatingCount?: number;
  addressComponents?: { longText: string; types: string[] }[];
};

export function toPlace(p: Raw): Place {
  const part = (t: string) => p.addressComponents?.find((c) => c.types.includes(t))?.longText ?? null;
  return {
    id: p.id, name: p.displayName?.text ?? "", address: p.formattedAddress ?? null,
    city: part("locality") ?? part("postal_town"), region: part("administrative_area_level_1"), country: part("country"),
    website: p.websiteUri ?? null, phone: p.nationalPhoneNumber ?? null, mapsUrl: p.googleMapsUri ?? null,
    category: p.primaryTypeDisplayName?.text ?? null, status: p.businessStatus ?? null, reviews: p.userRatingCount ?? null,
  };
}

/** One page of results. Cached per workspace for 24 hours so repeated clicks don't re-bill. */
export async function searchPlaces(apiKey: string, query: string, pageToken: string | null, language: string,
  ctx: { workspaceId: string; campaignId: string; userId: string }) {
  const key = "places:" + createHash("sha256").update(`${ctx.workspaceId}|${query}|${pageToken ?? ""}|${language}`).digest("hex");
  return cached(key, 24, ctx.workspaceId, "google_places", async () => {
    const started = Date.now();
    const res = await fetch(ENDPOINT, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: query, pageSize: 20, languageCode: language, ...(pageToken ? { pageToken } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    await logUsage({ workspace_id: ctx.workspaceId, campaign_id: ctx.campaignId, actor_id: ctx.userId, provider: "google_places", operation: "text_search",
      est_cost_usd: res.ok ? PLACES_COST_PER_REQUEST_USD : 0, status: res.ok ? "ok" : "error", latency_ms: Date.now() - started });
    if (!res.ok) throw new Error(`Google Places: ${body?.error?.message ?? res.status}`);
    return { places: ((body.places ?? []) as Raw[]).map(toPlace), next: (body.nextPageToken as string | undefined) ?? null };
  });
}

const LANG: Record<string, string> = { English: "en", Hindi: "hi", Spanish: "es", French: "fr", German: "de", Arabic: "ar", Portuguese: "pt", Italian: "it", Dutch: "nl", Japanese: "ja", "Mandarin Chinese": "zh", Tamil: "ta", Bengali: "bn" };
export const langCode = (l: string) => LANG[l] ?? "en";
