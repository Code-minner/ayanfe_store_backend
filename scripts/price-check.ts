import { prisma } from "../src/db.js";

const zero = await prisma.product.count({ where: { price: { lte: 0 } } });
const activeZero = await prisma.product.count({
  where: { active: true, price: { lte: 0 } },
});
const activeOk = await prisma.product.count({
  where: { active: true, price: { gt: 0 } },
});
const inactiveZero = await prisma.product.count({
  where: { active: false, price: { lte: 0 } },
});
const samples = await prisma.product.findMany({
  where: { price: { lte: 0 } },
  take: 10,
  select: {
    slug: true,
    name: true,
    price: true,
    active: true,
    variants: true,
  },
});
const cheap = await prisma.product.findMany({
  where: { active: true },
  orderBy: { price: "asc" },
  take: 8,
  select: { slug: true, name: true, price: true, active: true },
});

console.log(
  JSON.stringify(
    { zero, activeZero, inactiveZero, activeOk, samples, cheapestActive: cheap },
    null,
    2
  )
);
await prisma.$disconnect();
