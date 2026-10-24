/**
 * After import, mark a healthy set of products as featured / new arrivals
 * so the storefront home sections are not empty.
 *
 *   npx tsx src/repair-product-flags.ts
 */
import { prisma } from "./db.js";

async function main() {
  const active = await prisma.product.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, categorySlug: true },
  });

  console.log(`Active products: ${active.length}`);

  // Reset flags first
  await prisma.product.updateMany({
    data: { isFeatured: false, isNewArrival: false },
  });

  const newIds = active.slice(0, 24).map((p) => p.id);
  if (newIds.length) {
    await prisma.product.updateMany({
      where: { id: { in: newIds } },
      data: { isNewArrival: true },
    });
  }

  // Up to 4 featured per category, max 48 overall
  const byCat = new Map<string, string[]>();
  for (const p of active) {
    const list = byCat.get(p.categorySlug) ?? [];
    if (list.length < 4) {
      list.push(p.id);
      byCat.set(p.categorySlug, list);
    }
  }
  const featuredIds = [...byCat.values()].flat().slice(0, 48);
  if (featuredIds.length) {
    await prisma.product.updateMany({
      where: { id: { in: featuredIds } },
      data: { isFeatured: true },
    });
  }

  const [featured, newer, activeCount, total] = await Promise.all([
    prisma.product.count({ where: { active: true, isFeatured: true } }),
    prisma.product.count({ where: { active: true, isNewArrival: true } }),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count(),
  ]);

  console.log(
    JSON.stringify({ total, activeCount, featured, newer }, null, 2)
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
