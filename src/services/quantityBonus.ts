/** Round money to 2 decimal places (NGN kobo-friendly). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function bonusIsConfigured(
  bonusQty: number | null | undefined,
  bonusPercent: number | null | undefined
): boolean {
  return (
    typeof bonusQty === "number" &&
    bonusQty >= 1 &&
    typeof bonusPercent === "number" &&
    bonusPercent > 0 &&
    bonusPercent <= 100
  );
}

export function bonusApplies(
  bonusQty: number | null | undefined,
  bonusPercent: number | null | undefined,
  productQty: number
): boolean {
  return bonusIsConfigured(bonusQty, bonusPercent) && productQty >= (bonusQty as number);
}

/** Unit price after quantity bonus, if the product qty meets the threshold. */
export function unitPriceWithBonus(
  listPrice: number,
  bonusQty: number | null | undefined,
  bonusPercent: number | null | undefined,
  productQty: number
): number {
  if (!bonusApplies(bonusQty, bonusPercent, productQty)) return listPrice;
  return roundMoney(listPrice * (1 - (bonusPercent as number) / 100));
}

type VariantRow = { id: string; price: number };

export function parseVariantPrices(raw: unknown): VariantRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is { id: string; price: number } =>
        Boolean(v) &&
        typeof v === "object" &&
        typeof (v as { id?: unknown }).id === "string" &&
        typeof (v as { price?: unknown }).price === "number"
    )
    .map((v) => ({ id: v.id, price: v.price }));
}

export function listUnitPrice(opts: {
  productPrice: number;
  variants: unknown;
  variantId?: string;
}): number {
  const variants = parseVariantPrices(opts.variants);
  if (opts.variantId) {
    const hit = variants.find((v) => v.id === opts.variantId);
    if (hit) return hit.price;
  }
  return opts.productPrice;
}
