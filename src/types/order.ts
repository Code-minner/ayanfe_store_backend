import type { Order, OrderStatus, Settings } from "../generated/prisma/client.js";

export const ORDER_STATUSES = [
  "pending",
  "pending_verification",
  "on_hold",
  "paid",
  "processing",
  "shipped",
  "failed",
  "cancelled",
] as const satisfies readonly OrderStatus[];

export type OrderItem = {
  productId?: string;
  variantId?: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  color?: string;
};

export type ShippingInfo = {
  method?: "local_pickup" | "waybill" | "stockpile" | string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  shippingFee?: number;
};

export type OrderView = Omit<Order, "items" | "shipping"> & {
  _id: string;
  items: OrderItem[];
  shipping: ShippingInfo | null;
};

export type SettingsView = Settings & {
  payments: { paystack: boolean; bankTransfer: boolean };
};

export function parseItems(items: unknown): OrderItem[] {
  if (!Array.isArray(items)) return [];
  return items as OrderItem[];
}

export function parseShipping(shipping: unknown): ShippingInfo | null {
  if (!shipping || typeof shipping !== "object") return null;
  return shipping as ShippingInfo;
}

export function toOrderView(order: Order): OrderView {
  return {
    ...order,
    _id: order.id,
    items: parseItems(order.items),
    shipping: parseShipping(order.shipping),
  };
}

export function toSettingsView(settings: Settings): SettingsView {
  return {
    ...settings,
    payments: {
      paystack: settings.paystackEnabled,
      bankTransfer: settings.bankTransferEnabled,
    },
  };
}

