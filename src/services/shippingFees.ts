import { env } from "../config/env.js";

export const SHIPPING_METHOD_IDS = [
  "local_pickup",
  "waybill",
  "stockpile",
  "lagos_delivery",
] as const;

export type ShippingMethodId = (typeof SHIPPING_METHOD_IDS)[number];

export function isShippingMethodId(value: string | undefined | null): value is ShippingMethodId {
  return Boolean(value && (SHIPPING_METHOD_IDS as readonly string[]).includes(value));
}

/** Delivery / fulfillment charges (separate from checkout service fee). */
export function shippingFeeFor(method?: string | null): number {
  switch (method) {
    case "waybill":
      return env.waybillFee;
    case "stockpile":
      return env.stockpileFee;
    case "local_pickup":
      return env.localPickupFee;
    case "lagos_delivery":
      return env.lagosDeliveryFee;
    default:
      return 0;
  }
}

export function shippingLabel(method?: string | null): string {
  switch (method) {
    case "local_pickup":
      return "Local pickup";
    case "waybill":
      return "Waybill (outside Lagos)";
    case "stockpile":
      return "Stockpile";
    case "lagos_delivery":
      return "Lagos delivery";
    default:
      return method || "—";
  }
}

export const STOCKPILE_DISCLAIMER =
  "Stockpiling should not exceed three weeks. Goods left longer are at the owner's risk. Stockpile fee is ₦50 per order.";
