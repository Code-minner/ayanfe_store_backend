import "dotenv/config";
import { prisma } from "../src/db.js";

const products = await prisma.product.findMany({
  take: 15,
  where: { active: true },
  orderBy: { updatedAt: "desc" },
  select: {
    slug: true,
    brand: true,
    stock: true,
    price: true,
    subtitle: true,
    colors: true,
    variants: true,
  },
});

for (const p of products) {
  process.stdout.write(
    JSON.stringify({
      slug: p.slug,
      brand: p.brand,
      stock: p.stock,
      subtitle: p.subtitle,
      colors: p.colors,
      variantsLen: Array.isArray(p.variants) ? p.variants.length : -1,
    }) + "\n"
  );
}

await prisma.$disconnect();
