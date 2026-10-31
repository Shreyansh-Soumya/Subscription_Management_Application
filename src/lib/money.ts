// All money is stored and calculated in whole paise.

/** A percentage of an amount, rounding half a paisa up. 1800 basis points means 18%. */
export function percentOf(amountPaise: number, basisPoints: number): number {
  return Math.floor((amountPaise * basisPoints + 5000) / 10000);
}

/** Splits an amount by weight so the parts always add up to exactly the amount. */
export function allocate(amountPaise: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return weights.map(() => 0);

  const amount = BigInt(amountPaise);
  const bigTotal = BigInt(total);
  const shares = weights.map((weight) => amount * BigInt(weight));
  const parts = shares.map((share) => Number(share / bigTotal));
  const remainders = shares.map((share, index) => ({ index, remainder: share % bigTotal }));
  remainders.sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));

  let left = amountPaise - parts.reduce((sum, part) => sum + part, 0);
  for (const { index } of remainders) {
    if (left === 0) break;
    parts[index] += 1;
    left -= 1;
  }
  return parts;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function formatMoney(paise: number): string {
  return inr.format(paise / 100);
}
