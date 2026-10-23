import { prisma } from "./db.js";

const products = await prisma.product.findMany({
  where: { active: true, price: { gt: 0 }, slug: { not: { contains: "-wally-" } } },
  select: { id: true, slug: true, name: true, image: true, images: true },
});

let ok = 0;
const bad: Array<{ slug: string; reason: string; image: string }> = [];

for (const p of products) {
  const reasons: string[] = [];
  if (!p.image.includes("res.cloudinary.com")) reasons.push("main image not cloudinary");
  if (!p.image.includes(p.slug)) reasons.push("main image missing slug");
  if (!p.images?.length) reasons.push("images[] empty");
  else {
    if (!p.images.every((u) => u.includes("res.cloudinary.com"))) {
      reasons.push("gallery has non-cloudinary url");
    }
    if (!p.images.every((u) => u.includes(p.slug))) {
      reasons.push("gallery url missing slug");
    }
  }
  if (reasons.length) {
    bad.push({ slug: p.slug, reason: reasons.join("; "), image: p.image });
  } else {
    ok++;
  }
}

console.log(
  JSON.stringify(
    {
      totalActivePriced: products.length,
      linkedOk: ok,
      linkedBad: bad.length,
      badPreview: bad.slice(0, 8),
      sample: products.slice(0, 3).map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        image: p.image,
        galleryCount: p.images.length,
      })),
    },
    null,
    2
  )
);

await prisma.$disconnect();
