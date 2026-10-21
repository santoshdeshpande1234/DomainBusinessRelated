export function money(amount: number | null | undefined, currency = "USD", opts: Intl.NumberFormatOptions = {}) {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2, ...opts }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function num(n: number | null | undefined) {
  return n == null ? "—" : new Intl.NumberFormat("en").format(n);
}

export function when(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export function title(slug: string) {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bIt\b/, "IT");
}
