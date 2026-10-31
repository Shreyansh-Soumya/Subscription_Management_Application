/**
 * Converts a rupee amount string to whole paise — exactly, never by rounding.
 * Accepts a plain amount (`1250`, `1250.50`, `0.05`) or an Indian-formatted
 * amount with an optional single ₹ prefix and 2-digit comma groups
 * (`₹1,250.50`, `1,25,000`, `12,34,567`). Anything ambiguous — malformed comma
 * grouping, embedded whitespace, repeated currency symbols, more than two
 * decimal places, negative or empty input — returns null instead of being
 * silently normalized or rounded.
 */
export function rupeesToPaise(input: string): number | null {
  const match = /^₹?(\d+(?:\.\d{1,2})?|\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?)$/.exec(input.trim());
  if (!match) return null;
  const [rupees, paisePart = ""] = match[1].replace(/,/g, "").split(".");
  // BigInt literals need an ES2020 target; the project targets ES2017, so use BigInt().
  const total = BigInt(rupees) * BigInt(100) + BigInt((paisePart + "00").slice(0, 2));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(total);
}
