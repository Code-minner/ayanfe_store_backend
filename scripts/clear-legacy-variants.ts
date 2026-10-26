/**
 * Clears auto-backfilled / incomplete option variants so legacy products
 * sell as simple items (base stock) until an admin sets real options.
 * Keeps colors, brand, subtitle, and current total stock.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";

type VariantRow = {
  id?: string;
  label?: string;
  price?: number;
  stock?: number;
  maxPerOrder?: number;
};

function looksLikeBackfill(variants: VariantRow[]) {
  if (!variants.length) return false;
  // Explicit purchase caps mean an admin configured options on purpose.
  if (variants.some((v) => typeof v.maxPerOrder === "number" && v.maxPerOrder > 0)) {
    return false;
  }
  // Backfill used size-* / slug ids and distributed stock from subtitle.
  const backfillIds = variants.every((v) => {
    const id = String(v.id || "");
    return (
      id.startsWith("size-") ||
      id.startsWith("opt-") ||
      /^\d{2}$/.test(String(v.label || "").trim())
    );
  });
  return backfillIds;
}

const products = await prisma.product.findMany({
  select: {
    id: true,
    slug: true,
    stock: true,
    variants: true,
  },
});

let cleared = 0;
for (const p of products) {
  const variants = Array.isArray(p.variants) ? (p.variants as VariantRow[]) : [];
  if (!variants.length) continue;
  if (!looksLikeBackfill(variants)) {
    process.stdout.write(`keep ${p.slug} (${variants.length} options)\n`);
    continue;
  }

  const stockSum = variants.reduce(
    (sum, v) => sum + Math.max(0, Math.floor(Number(v.stock) || 0)),
    0
  );

  await prisma.product.update({
    where: { id: p.id },
    data: {
      variants: [],
      stock: stockSum > 0 ? stockSum : p.stock,
    },
  });
  cleared += 1;
  process.stdout.write(`cleared ${p.slug}\n`);
}

process.stdout.write(`Cleared variants on ${cleared} legacy products\n`);
await prisma.$disconnect();
