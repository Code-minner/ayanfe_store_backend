import { prisma } from "./db.js";

const total = await prisma.product.count();
const active = await prisma.product.count({ where: { active: true } });
const inactive = await prisma.product.count({ where: { active: false } });
const by = await prisma.product.groupBy({
  by: ["categorySlug"],
  _count: true,
  orderBy: { categorySlug: "asc" },
});
const cloudinary = await prisma.product.count({
  where: { image: { contains: "res.cloudinary.com" } },
});
const wp = await prisma.product.count({
  where: { image: { contains: "ayanfettogracious.com" } },
});
const sample = await prisma.product.findMany({
  where: { active: true },
  take: 3,
  select: {
    name: true,
    slug: true,
    price: true,
    categorySlug: true,
    image: true,
    colors: true,
    subtitle: true,
  },
});

console.log(
  JSON.stringify({ total, active, inactive, cloudinary, wp, by, sample }, null, 2)
);
await prisma.$disconnect();
