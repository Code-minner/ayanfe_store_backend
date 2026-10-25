import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { AppError } from "../utils/AppError.js";

export type OrderLineInput = {
  productId?: string;
  variantId?: string;
  name: string;
  quantity: number;
  price: number;
};

export type PackVariant = {
  id: string;
  label: string;
  price: number;
  stock: number;
  maxPerOrder?: number;
};

export function parseVariants(raw: unknown): PackVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is PackVariant =>
        Boolean(v) &&
        typeof v === "object" &&
        typeof (v as PackVariant).id === "string" &&
        typeof (v as PackVariant).label === "string" &&
        typeof (v as PackVariant).price === "number" &&
        typeof (v as PackVariant).stock === "number"
    )
    .map((v) => {
      const maxRaw = (v as PackVariant).maxPerOrder;
      const maxPerOrder =
        typeof maxRaw === "number" && Number.isFinite(maxRaw) && maxRaw > 0
          ? Math.floor(maxRaw)
          : undefined;
      return {
        id: v.id,
        label: v.label,
        price: v.price,
        stock: Math.max(0, Math.floor(v.stock)),
        ...(maxPerOrder ? { maxPerOrder } : {}),
      };
    });
}

function lineKey(line: OrderLineInput) {
  return `${line.productId || "unknown"}::${line.variantId || "base"}`;
}

/** Aggregate quantities for the same product/pack across the cart. */
function aggregateLines(items: OrderLineInput[]) {
  const map = new Map<string, OrderLineInput>();
  for (const item of items) {
    const key = lineKey(item);
    const prev = map.get(key);
    if (prev) {
      prev.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return [...map.values()];
}

/**
 * Ensures every line has enough stock (pack or base).
 * Throws AppError(400) with a clear message for the customer.
 */
export async function assertStockAvailable(items: OrderLineInput[]) {
  const lines = aggregateLines(items);
  const missingId = lines.find((l) => !l.productId);
  if (missingId) {
    throw new AppError(
      400,
      `Missing product id for "${missingId.name}". Please remove it from cart and add it again.`
    );
  }

  const ids = [...new Set(lines.map((l) => l.productId!))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, active: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const line of lines) {
    const product = byId.get(line.productId!);
    if (!product) {
      throw new AppError(400, `"${line.name}" is no longer available.`);
    }

    const variants = parseVariants(product.variants);
    if (line.variantId) {
      const pack = variants.find((v) => v.id === line.variantId);
      if (!pack) {
        throw new AppError(
          400,
          `Pack option for "${line.name}" is no longer available. Please choose another pack.`
        );
      }
      if (pack.maxPerOrder && line.quantity > pack.maxPerOrder) {
        throw new AppError(
          400,
          `You can only buy ${pack.maxPerOrder} of "${product.name}" size ${pack.label}. Please pick another size for the rest.`
        );
      }
      if (line.quantity > pack.stock) {
        throw new AppError(
          400,
          `Only ${pack.stock} of "${product.name} (${pack.label})" left in stock. You asked for ${line.quantity}.`
        );
      }
    } else if (variants.length > 0) {
      throw new AppError(
        400,
        `"${product.name}" is sold in packs. Please choose a pack size on the product page.`
      );
    } else if (line.quantity > product.stock) {
      throw new AppError(
        400,
        `Only ${product.stock} of "${product.name}" left in stock. You asked for ${line.quantity}.`
      );
    }
  }
}

/**
 * Decrements pack / base stock after payment is confirmed.
 * Safe to call once: skips if order was already paid (caller should check previous status).
 */
export async function decrementStockForPaidOrder(items: unknown) {
  if (!Array.isArray(items)) return;

  const lines = aggregateLines(
    items
      .filter((i): i is OrderLineInput => Boolean(i) && typeof i === "object")
      .map((i) => ({
        productId: typeof i.productId === "string" ? i.productId : undefined,
        variantId: typeof i.variantId === "string" ? i.variantId : undefined,
        name: typeof i.name === "string" ? i.name : "Item",
        quantity: typeof i.quantity === "number" ? i.quantity : 0,
        price: typeof i.price === "number" ? i.price : 0,
      }))
      .filter((i) => i.productId && i.quantity > 0)
  );

  for (const line of lines) {
    const product = await prisma.product.findUnique({ where: { id: line.productId! } });
    if (!product) continue;

    const variants = parseVariants(product.variants);
    if (line.variantId && variants.length > 0) {
      const nextVariants = variants.map((v) =>
        v.id === line.variantId
          ? { ...v, stock: Math.max(0, v.stock - line.quantity) }
          : v
      );
      const stockSum = nextVariants.reduce((sum, v) => sum + v.stock, 0);
      await prisma.product.update({
        where: { id: product.id },
        data: {
          variants: nextVariants as Prisma.InputJsonValue,
          stock: stockSum,
        },
      });
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: { stock: Math.max(0, product.stock - line.quantity) },
      });
    }
  }
}
