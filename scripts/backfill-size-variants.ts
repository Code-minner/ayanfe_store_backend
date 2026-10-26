/**
 * One-shot: products that only list sizes in subtitle (and empty variants)
 * get real variants so shoppers can select a size and checkout can check stock.
 */
import "dotenv/config";
import { prisma } from "../src/db.js";

function parseSizeLabels(subtitle: string | null | undefined): string[] {
  if (!subtitle) return [];
  const match = subtitle.match(/sizes?\s*:\s*(.+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeSizeLabel(value: string) {
  const t = value.trim();
  return /^\d{2}$/.test(t) || /^age\s*\d+/i.test(t);
}

function looksLikeColorLabel(value: string) {
  const t = value.trim();
  if (!t) return false;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return true;
  return !looksLikeSizeLabel(t);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function distributeStock(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (total <= 0) return Array.from({ length: count }, () => 0);
  const base = Math.floor(total / count);
  const rem = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

const products = await prisma.product.findMany({
  where: { active: true },
  select: {
    id: true,
    slug: true,
    price: true,
    stock: true,
    subtitle: true,
    colors: true,
    variants: true,
    brand: true,
  },
});

let updated = 0;
for (const p of products) {
  const existing = Array.isArray(p.variants) ? p.variants : [];
  if (existing.length > 0) continue;

  let colors = Array.isArray(p.colors) ? [...p.colors] : [];
  let sizeLabels = parseSizeLabels(p.subtitle);

  // Fix swapped size/color data (sizes stored in colors, colors in subtitle).
  if (
    colors.length > 0 &&
    colors.every(looksLikeSizeLabel) &&
    sizeLabels.length > 0 &&
    sizeLabels.every(looksLikeColorLabel)
  ) {
    const swappedSizes = colors;
    const swappedColors = sizeLabels;
    colors = swappedColors;
    sizeLabels = swappedSizes;
  }

  if (!sizeLabels.length) continue;

  const stocks = distributeStock(p.stock, sizeLabels.length);
  const variants = sizeLabels.map((label, i) => ({
    id: `size-${slugify(label) || i + 1}`,
    label,
    price: p.price,
    stock: stocks[i] ?? 0,
  }));

  const nextSubtitle = `Sizes: ${sizeLabels.join(", ")}`;

  await prisma.product.update({
    where: { id: p.id },
    data: {
      variants,
      colors,
      subtitle: nextSubtitle,
      stock: stocks.reduce((a, b) => a + b, 0),
    },
  });

  updated += 1;
  process.stdout.write(
    `${p.slug}: ${variants.length} sizes, stock=[${stocks.join(",")}], colors=${JSON.stringify(colors)}\n`
  );
}

process.stdout.write(`Updated ${updated} products\n`);
await prisma.$disconnect();
