// Pure exchange-rate arithmetic (USD-based table: 1 USD = rates[X] units of X).
export type Rates = Record<string, number>;

export function convert(amount: number, from: string, to: string, rates: Rates) {
  if (!rates[from] || !rates[to]) throw new Error(`Unsupported currency ${!rates[from] ? from : to}`);
  return Math.round((amount / rates[from]) * rates[to] * 100) / 100;
}

export function usdPerUnit(currency: string, rates: Rates) {
  if (!rates[currency]) throw new Error(`Unsupported currency ${currency}`);
  return Math.round((1 / rates[currency]) * 1e8) / 1e8;
}

export const FX_TTL_HOURS = 12;

export function isFresh(fetchedAt: string, now = Date.now()) {
  return now - new Date(fetchedAt).getTime() < FX_TTL_HOURS * 3600_000;
}
