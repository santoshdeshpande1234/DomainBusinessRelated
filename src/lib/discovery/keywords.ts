// Industry vocabulary for domain ideas and prospect search. "intent" is a 1–3 weight for how directly a
// word signals a buyer looking for a provider (3 = "dentist", 1 = "care"). It is an editorial heuristic,
// shown as such in score breakdowns, not search-volume data.
export type Keyword = { word: string; intent: 1 | 2 | 3 };

export const INDUSTRY_KEYWORDS: Record<string, { domain: Keyword[]; search: string[] }> = {
  healthcare: {
    domain: [{ word: "clinic", intent: 3 }, { word: "dental", intent: 3 }, { word: "dentist", intent: 3 }, { word: "physio", intent: 3 }, { word: "doctor", intent: 3 }, { word: "health", intent: 2 }, { word: "care", intent: 1 }, { word: "medical", intent: 2 }],
    search: ["clinic", "dentist", "physiotherapy clinic", "medical centre"],
  },
  professional_services: {
    domain: [{ word: "lawyer", intent: 3 }, { word: "law", intent: 2 }, { word: "accountant", intent: 3 }, { word: "tax", intent: 3 }, { word: "consulting", intent: 2 }, { word: "advisors", intent: 2 }, { word: "legal", intent: 2 }],
    search: ["law firm", "accountant", "tax consultant", "business consultant"],
  },
  real_estate: {
    domain: [{ word: "homes", intent: 3 }, { word: "realty", intent: 3 }, { word: "property", intent: 2 }, { word: "estates", intent: 2 }, { word: "rentals", intent: 3 }, { word: "realtor", intent: 3 }],
    search: ["real estate agency", "property dealer", "realtor"],
  },
  hospitality: {
    domain: [{ word: "hotel", intent: 3 }, { word: "stay", intent: 2 }, { word: "resort", intent: 3 }, { word: "inn", intent: 2 }, { word: "dining", intent: 2 }, { word: "cafe", intent: 2 }],
    search: ["hotel", "restaurant", "guest house", "cafe"],
  },
  education: {
    domain: [{ word: "academy", intent: 3 }, { word: "tutors", intent: 3 }, { word: "school", intent: 2 }, { word: "classes", intent: 3 }, { word: "learning", intent: 1 }, { word: "coaching", intent: 3 }],
    search: ["coaching institute", "tutoring centre", "private school", "training academy"],
  },
  automotive: {
    domain: [{ word: "autos", intent: 2 }, { word: "cars", intent: 2 }, { word: "garage", intent: 3 }, { word: "motors", intent: 2 }, { word: "carrepair", intent: 3 }, { word: "tyres", intent: 3 }],
    search: ["car repair", "car dealer", "auto service centre"],
  },
  home_services: {
    domain: [{ word: "plumber", intent: 3 }, { word: "plumbing", intent: 3 }, { word: "electrician", intent: 3 }, { word: "cleaning", intent: 3 }, { word: "repairs", intent: 2 }, { word: "pestcontrol", intent: 3 }, { word: "roofing", intent: 3 }],
    search: ["plumber", "electrician", "cleaning service", "pest control"],
  },
  manufacturing: {
    domain: [{ word: "industries", intent: 1 }, { word: "fabrication", intent: 3 }, { word: "machining", intent: 3 }, { word: "parts", intent: 2 }, { word: "manufacturing", intent: 2 }, { word: "packaging", intent: 2 }],
    search: ["manufacturer", "fabrication workshop", "industrial supplier"],
  },
  it: {
    domain: [{ word: "tech", intent: 1 }, { word: "itsupport", intent: 3 }, { word: "software", intent: 2 }, { word: "cloud", intent: 1 }, { word: "webdesign", intent: 3 }, { word: "cyber", intent: 2 }, { word: "apps", intent: 2 }],
    search: ["IT services company", "software company", "web design agency", "IT support"],
  },
  retail: {
    domain: [{ word: "store", intent: 2 }, { word: "shop", intent: 2 }, { word: "mart", intent: 2 }, { word: "boutique", intent: 2 }, { word: "deals", intent: 2 }, { word: "outlet", intent: 2 }],
    search: ["store", "boutique", "retail shop"],
  },
};

// Words added around keywords. Each carries how much it helps a buyer read the name as a business.
export const MODIFIERS = { prefix: ["best", "my", "top", "the"], suffix: ["pro", "hub", "experts", "hq", "co", "now"] } as const;

// Names that are well-known marks or confusingly close to them. A hit raises legal risk; the absence
// of a hit is never treated as clearance, so every domain still says "trademark search not performed".
export const KNOWN_MARKS = [
  "google", "apple", "amazon", "facebook", "meta", "microsoft", "netflix", "uber", "airbnb", "tesla", "nike", "adidas", "samsung",
  "paypal", "visa", "mastercard", "youtube", "instagram", "whatsapp", "linkedin", "tiktok", "zomato", "swiggy", "flipkart", "paytm",
  "reliance", "tata", "infosys", "wipro", "marriott", "hilton", "oyo", "toyota", "honda", "bmw", "mercedes", "ford", "hyundai",
  "walmart", "ikea", "starbucks", "mcdonalds", "dominos", "kfc", "disney", "pfizer", "apollo", "fortis", "byjus", "unacademy",
] as const;

// Extensions by how naturally buyers trust them; country codes score highest in their own country.
export const COUNTRY_TLD: Record<string, string> = {
  "India": ".in", "United Kingdom": ".co.uk", "Canada": ".ca", "Australia": ".com.au", "United Arab Emirates": ".ae",
  "Singapore": ".sg", "Germany": ".de", "Ireland": ".ie", "New Zealand": ".co.nz", "South Africa": ".co.za", "Japan": ".jp",
  "France": ".fr", "Spain": ".es", "Italy": ".it", "Netherlands": ".nl", "Switzerland": ".ch", "Sweden": ".se", "Norway": ".no",
  "Denmark": ".dk", "Qatar": ".qa", "Mexico": ".mx", "Brazil": ".com.br", "Hong Kong": ".hk", "Saudi Arabia": ".sa",
};

export function industryKeywords(industry: string, custom?: string | null): Keyword[] {
  if (industry === "custom") {
    return (custom ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).slice(0, 4).map((word) => ({ word, intent: 2 }));
  }
  return INDUSTRY_KEYWORDS[industry]?.domain ?? [];
}

export function searchTerms(industry: string, custom?: string | null): string[] {
  if (industry === "custom") return custom ? [custom] : [];
  return INDUSTRY_KEYWORDS[industry]?.search ?? [];
}
