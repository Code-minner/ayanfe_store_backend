/** Mark a slice of active priced products as featured / new arrival for the home page. */
import { prisma } from "./db.js";

const priced = await prisma.product.findMany({
  where: {
    active: true,
    price: { gt: 0 },
    slug: { not: { contains: "-wally-" } },
  },
  orderBy: { createdAt: "desc" },
  select: { id: true },
});

await prisma.product.updateMany({
  where: { slug: { not: { contains: "-wally-" } } },
  data: { isFeatured: false, isNewArrival: false },
});

const featuredIds = priced.slice(0, 48).map((p) => p.id);
const newIds = priced.slice(0, 16).map((p) => p.id);

if (featuredIds.length) {
  await prisma.product.updateMany({
    where: { id: { in: featuredIds } },
    data: { isFeatured: true },
  });
}
if (newIds.length) {
  await prisma.product.updateMany({
    where: { id: { in: newIds } },
    data: { isNewArrival: true },
  });
}

console.log(
  JSON.stringify({
    priced: priced.length,
    featured: featuredIds.length,
    newArrival: newIds.length,
  })
);
await prisma.$disconnect();
