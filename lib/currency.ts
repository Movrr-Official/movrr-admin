const eurFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurCompactFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const precisionFormatterCache = new Map<number, Intl.NumberFormat>();

export function formatCurrencyEUR(value: number): string {
  if (!Number.isFinite(value)) {
    return eurFormatter.format(0);
  }
  return eurFormatter.format(value);
}

export function formatCurrencyEURCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return eurCompactFormatter.format(0);
  }
  return eurCompactFormatter.format(value);
}

export function formatCurrencyEURWithPrecision(
  value: number,
  fractionDigits: number,
): string {
  const safeFractionDigits = Number.isInteger(fractionDigits)
    ? Math.min(Math.max(fractionDigits, 0), 6)
    : 2;
  let formatter = precisionFormatterCache.get(safeFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: safeFractionDigits,
      maximumFractionDigits: safeFractionDigits,
    });
    precisionFormatterCache.set(safeFractionDigits, formatter);
  }
  if (!Number.isFinite(value)) {
    return formatter.format(0);
  }
  return formatter.format(value);
}
