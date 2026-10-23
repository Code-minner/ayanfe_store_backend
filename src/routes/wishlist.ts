import { Router } from "express";
import { z } from "zod";
import { prisma, withId, withIds } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function productCard(product: {
  id: string;
  slug: string;
  name: string;
  image: string;
  images: string[];
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  categorySlug: string;
  category: string | null;
  colors: string[];
  badge: string | null;
  subtitle: string | null;
  stock: number;
  description: string;
}) {
  return withId({
    id: product.id,
    slug: product.slug,
    name: product.name,
    image: product.image,
    images: product.images,
    price: product.price,
    originalPrice: product.originalPrice ?? undefined,
    discountPercent: product.discountPercent ?? undefined,
    categorySlug: product.categorySlug,
    category: product.category ?? undefined,
    colors: product.colors,
    badge: product.badge ?? undefined,
    subtitle: product.subtitle ?? undefined,
    stock: product.stock,
    description: product.description,
    href: `/product/${product.slug}`,
  });
}

async function findProduct(idOrSlug: string) {
  return (
    (await prisma.product.findUnique({ where: { id: idOrSlug } })) ||
    (await prisma.product.findUnique({ where: { slug: idOrSlug } }))
  );
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.wishlistItem.findMany({
      where: { userId: req.user!.id },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: rows.map((r) => productCard(r.product)),
      ids: rows.map((r) => r.productId),
      slugs: rows.map((r) => r.product.slug),
    });
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        productId: z.string().optional(),
        productSlug: z.string().optional(),
      })
      .parse(req.body);

    const rawKey = body.productId || body.productSlug;
    if (!rawKey) throw new AppError(400, "productId or productSlug is required");

    // Frontend used to prefix New Arrivals with "new-" — normalize before lookup
    const key = rawKey.replace(/^new-/, "");
    const product =
      (await findProduct(key)) ||
      (body.productSlug ? await findProduct(body.productSlug.replace(/^new-/, "")) : null) ||
      (body.productId && body.productId !== rawKey ? await findProduct(body.productId) : null);

    if (!product || !product.active) throw new AppError(404, "Product not found");

    await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: product.id } },
      create: { userId: req.user!.id, productId: product.id },
      update: {},
    });

    res.status(201).json({ product: productCard(product) });
  })
);

router.delete(
  "/:idOrSlug",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await findProduct(String(req.params.idOrSlug));
    if (!product) throw new AppError(404, "Product not found");

    await prisma.wishlistItem.deleteMany({
      where: { userId: req.user!.id, productId: product.id },
    });

    res.json({ removed: true, productId: product.id, slug: product.slug });
  })
);

export default router;
