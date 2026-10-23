// The preview design system: design directions (layout, type and shape) and a colour palette derived
// from the business's own brand colour, its industry and accessibility rules. Pure and deterministic,
// safe to import in the browser.
//
// Colours are design tokens on the page (CSS variables), so every component reads the same palette.
// A brand colour that can't carry white text (too light) is darkened for buttons and the change is
// recorded as a note, so the original stays recognisable as a highlight.

export type DirectionKey = "corporate" | "minimal" | "bold" | "specialist" | "editorial";
export type Direction = {
  label: string; description: string;
  heading: string; body: string;
  /** Hero composition. */
  hero: "split" | "centered" | "dark" | "grid" | "editorial";
  radius: "sm" | "md" | "lg"; card: "border" | "shadow" | "flat"; button: "pill" | "rounded" | "square";
  header: "light" | "dark";
};

const SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const GROTESK = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";

export const DIRECTIONS: Record<DirectionKey, Direction> = {
  corporate: { label: "Premium Corporate", description: "Calm authority: split hero with a proof panel, bordered cards, restrained colour.",
    heading: SANS, body: SANS, hero: "split", radius: "md", card: "border", button: "rounded", header: "light" },
  minimal: { label: "Modern Minimal", description: "Lots of whitespace, centred statement hero, flat sections and thin dividers.",
    heading: SANS, body: SANS, hero: "centered", radius: "sm", card: "flat", button: "square", header: "light" },
  bold: { label: "Bold Conversion-Focused", description: "Dark hero with the enquiry built in, strong contrast and prominent calls to action.",
    heading: GROTESK, body: SANS, hero: "dark", radius: "lg", card: "shadow", button: "pill", header: "dark" },
  specialist: { label: "Industry Specialist", description: "Capability-led: hero with a service grid, tabs for expertise, technical tone.",
    heading: GROTESK, body: SANS, hero: "grid", radius: "md", card: "border", button: "rounded", header: "light" },
  editorial: { label: "Contemporary Editorial", description: "Large serif headlines, asymmetric layout and story-led sections.",
    heading: SERIF, body: SANS, hero: "editorial", radius: "sm", card: "flat", button: "square", header: "light" },
};
export const DIRECTION_KEYS = Object.keys(DIRECTIONS) as DirectionKey[];
export const isDirection = (k: string): k is DirectionKey => k in DIRECTIONS;

// Starting palettes per industry when the business has no usable brand colour: [primary, secondary].
const INDUSTRY: Record<string, [string, string]> = {
  healthcare: ["#0f766e", "#0c4a6e"], professional_services: ["#1e3a5f", "#9a7b4f"], real_estate: ["#2f3e46", "#b5651d"],
  hospitality: ["#7a2e3a", "#c08a3e"], education: ["#1d4e89", "#d97706"], automotive: ["#1f2933", "#c0392b"],
  home_services: ["#2f6b3a", "#e07a1f"], manufacturing: ["#2b4c6f", "#d4a017"], it: ["#1849a9", "#0e9384"], retail: ["#1c1917", "#e0564f"],
};
const GENERIC: [string, string] = ["#1f3b57", "#0e9384"];

// Default direction by industry: what customers in that market tend to expect.
const DEFAULT_DIRECTION: Record<string, DirectionKey> = {
  healthcare: "minimal", professional_services: "corporate", real_estate: "editorial", hospitality: "editorial", education: "minimal",
  automotive: "bold", home_services: "bold", manufacturing: "specialist", it: "specialist", retail: "editorial",
};
export const defaultDirection = (industry: string | null | undefined): DirectionKey => DEFAULT_DIRECTION[industry ?? ""] ?? "corporate";

// Old theme names stored on earlier previews.
const LEGACY: Record<string, { direction: DirectionKey; primary: string; ink: string }> = {
  harbor: { direction: "corporate", primary: "#0b6e78", ink: "#0f2a44" }, sage: { direction: "minimal", primary: "#2f6b48", ink: "#1d3a2a" },
  clay: { direction: "editorial", primary: "#a2471f", ink: "#3a2318" }, slate: { direction: "corporate", primary: "#4338ca", ink: "#1e1b4b" },
  atelier: { direction: "editorial", primary: "#8a6a3b", ink: "#1c1917" },
};

// ---------------------------------------------------------------- colour maths

type RGB = [number, number, number];
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function parseHex(h: string | null | undefined): RGB | null {
  const m = (h ?? "").trim().match(HEX);
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB;
}
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a: string, b: string): number {
  const x = parseHex(a), y = parseHex(b);
  if (!x || !y) return 1;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
const WHITE: RGB = [255, 255, 255], BLACK: RGB = [0, 0, 0];

function hsl(c: RGB): [number, number, number] {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
/** How colourful a colour is: greys and near-blacks can't be a brand's action colour. */
export const saturation = (h: string) => { const c = parseHex(h); return c ? hsl(c)[1] : 0; };

/** Darkens (or lightens) a colour just enough to reach a contrast ratio against a background. */
export function ensureContrast(fg: string, bg: string, ratio: number): string {
  const f = parseHex(fg), b = parseHex(bg);
  if (!f || !b) return fg;
  if (contrast(fg, bg) >= ratio) return toHex(f);
  const towards = luminance(b) > 0.5 ? BLACK : WHITE;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = toHex(mix(f, towards, t));
    if (contrast(c, bg) >= ratio) return c;
  }
  return toHex(towards);
}

// ---------------------------------------------------------------- tokens

export type Tokens = {
  primary: string; onPrimary: string; primaryHover: string;
  secondary: string; accent: string; onAccent: string;
  bg: string; surface: string; surfaceAlt: string; dark: string; onDark: string;
  heading: string; body: string; muted: string; border: string;
  success: string; warning: string; error: string; focus: string;
};
export type Palette = { tokens: Tokens; source: "brand" | "industry" | "legacy"; notes: string[] };

/**
 * The palette for one business. The brand colour wins when it is a real colour (not grey); it is
 * adjusted for contrast and the adjustment is noted. Otherwise the industry palette is used.
 */
export function derivePalette(input: { brand?: string | null; ink?: string | null; industry?: string | null; legacyTheme?: string | null }): Palette {
  const notes: string[] = [];
  const legacy = input.legacyTheme ? LEGACY[input.legacyTheme] : undefined;
  const [indPrimary, indSecondary] = INDUSTRY[input.industry ?? ""] ?? GENERIC;
  let source: Palette["source"] = "industry";
  let base = indPrimary;
  if (input.brand && parseHex(input.brand) && saturation(input.brand) >= 0.18) {
    base = toHex(parseHex(input.brand)!); source = "brand";
  } else if (input.brand && parseHex(input.brand)) {
    notes.push(`Their brand colour ${input.brand} is close to grey, so an industry-appropriate colour leads and theirs is used for text.`);
  } else if (legacy) { base = legacy.primary; source = "legacy"; }

  // Buttons carry white text: the primary must reach 4.5:1 against white.
  const primary = ensureContrast(base, "#ffffff", 4.5);
  if (source === "brand" && primary !== base.toLowerCase()) notes.push(`Brand colour ${base} was deepened to ${primary} so button text stays readable (WCAG AA); the original is kept as the highlight colour.`);
  const p = parseHex(primary)!;
  const inkFromBrand = input.ink && parseHex(input.ink) && contrast(input.ink, "#ffffff") >= 7 ? toHex(parseHex(input.ink)!) : null;
  const heading = inkFromBrand ?? toHex(mix(p, BLACK, 0.72));
  const body = ensureContrast(toHex(mix(parseHex(heading)!, WHITE, 0.18)), "#ffffff", 7);
  const muted = ensureContrast(toHex(mix(parseHex(heading)!, WHITE, 0.42)), "#ffffff", 4.5);
  // A warm or cool counterpart for highlights: the brand's own colour when it was lightened, else the industry secondary.
  const secondary = source === "brand" && primary !== base.toLowerCase() ? base : (legacy && source === "legacy" ? legacy.ink : indSecondary);
  // The accent is the high-priority action colour (calls to action); it has to read on white.
  const accent = ensureContrast(source === "industry" ? indSecondary : primary, "#ffffff", 4.5);
  const dark = toHex(mix(p, BLACK, 0.78));
  return {
    source, notes,
    tokens: {
      primary, onPrimary: "#ffffff", primaryHover: toHex(mix(p, BLACK, 0.15)),
      secondary, accent, onAccent: "#ffffff",
      bg: "#ffffff", surface: toHex(mix(p, WHITE, 0.95)), surfaceAlt: toHex(mix(p, WHITE, 0.9)), dark, onDark: "#ffffff",
      heading, body, muted, border: toHex(mix(p, WHITE, 0.82)),
      success: "#067647", warning: "#b54708", error: "#b42318", focus: ensureContrast(toHex(mix(p, WHITE, 0.1)), "#ffffff", 3),
    },
  };
}

/** CSS custom properties for a palette and direction. */
export function cssVars(t: Tokens, d: Direction): Record<string, string> {
  const r = { sm: ["4px", "6px", "8px"], md: ["6px", "10px", "14px"], lg: ["10px", "16px", "24px"] }[d.radius];
  const btn = { pill: "999px", rounded: r[1], square: r[0] }[d.button];
  return {
    "--primary": t.primary, "--on-primary": t.onPrimary, "--primary-hover": t.primaryHover, "--secondary": t.secondary,
    "--accent": t.accent, "--on-accent": t.onAccent, "--bg": t.bg, "--surface": t.surface, "--surface-alt": t.surfaceAlt,
    "--dark": t.dark, "--on-dark": t.onDark, "--ink": t.heading, "--body": t.body, "--muted": t.muted, "--line": t.border,
    "--success": t.success, "--warning": t.warning, "--error": t.error, "--focus": t.focus,
    // Older components read --soft.
    "--soft": t.surfaceAlt,
    "--r-sm": r[0], "--r-md": r[1], "--r-lg": r[2], "--r-btn": btn,
    "--font-heading": d.heading, "--font-body": d.body,
  };
}

/** Resolves a stored theme value (a direction, or an older theme name) to a direction. */
export function resolveDirection(theme: string | null | undefined, industry?: string | null): { key: DirectionKey; legacy: string | null } {
  if (theme && isDirection(theme)) return { key: theme, legacy: null };
  if (theme && LEGACY[theme]) return { key: LEGACY[theme].direction, legacy: theme };
  return { key: defaultDirection(industry), legacy: null };
}
