import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma, withId, withIds } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { uploadProductImage } from "../middleware/upload.js";
import { uploadProductImageBuffer } from "../services/cloudinary.js";

const router = Router();

const variantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  /** Cap how many of this size/option one customer can buy per order. */
  maxPerOrder: z.number().int().positive().optional(),
  /** Colors available for this size/option only. */
  colors: z.array(z.string().min(1)).optional(),
});

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  image: z.string().min(1),
  images: z.array(z.string()).optional(),
  price: z.number().nonnegative(),
  originalPrice: z.number().optional().nullable(),
  discountPercent: z.number().optional().nullable(),
  /** Min units of this product (all options combined) to unlock the % off. */
  bonusQty: z.number().int().positive().optional().nullable(),
  /** Percent off when bonusQty is met (1–100). */
  bonusPercent: z.number().positive().max(100).optional().nullable(),
  categorySlug: z.string().min(1),
  category: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  colors: z.array(z.string()).optional(),
  variants: z.array(variantSchema).optional(),
  badge: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  stock: z.number().int().nonnegative().optional(),
  isFeatured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  active: z.boolean().optional(),
});

function normalizeVariants(
  variants: z.infer<typeof variantSchema>[] | undefined,
  fallbackPrice: number,
  fallbackStock: number
) {
  if (!variants?.length) {
    return {
      variants: [] as z.infer<typeof variantSchema>[],
      price: fallbackPrice,
      stock: fallbackStock,
      colors: null as string[] | null,
    };
  }
  const cleaned = variants.map((v) => {
    const colors = Array.isArray(v.colors)
      ? [
          ...new Set(
            v.colors
              .map((c) => String(c || "").trim())
              .filter(Boolean)
          ),
        ]
      : [];
    return {
      id: v.id.trim() || v.label.toLowerCase().replace(/\s+/g, "-"),
      label: v.label.trim(),
      price: v.price,
      stock: v.stock,
      ...(v.maxPerOrder && v.maxPerOrder > 0 ? { maxPerOrder: v.maxPerOrder } : {}),
      ...(colors.length ? { colors } : {}),
    };
  });
  const prices = cleaned.map((v) => v.price);
  const stocks = cleaned.map((v) => v.stock);
  // Flat list for product cards / legacy clients (unique colors across sizes).
  const flatColors = [
    ...new Set(cleaned.flatMap((v) => ("colors" in v && Array.isArray(v.colors) ? v.colors : []))),
  ];
  return {
    variants: cleaned,
    price: Math.min(...prices),
    stock: stocks.reduce((sum, n) => sum + n, 0),
    colors: flatColors,
  };
}

const listSelect = {
  id: true,
  slug: true,
  name: true,
  image: true,
  price: true,
  originalPrice: true,
  discountPercent: true,
  bonusQty: true,
  bonusPercent: true,
  categorySlug: true,
  category: true,
  brand: true,
  colors: true,
  variants: true,
  badge: true,
  subtitle: true,
  stock: true,
  isFeatured: true,
  isNewArrival: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** True when base stock or any size/option still has units to sell. */
function productHasSellableStock(product: {
  stock: number;
  variants?: unknown;
}): boolean {
  if ((product.stock ?? 0) > 0) return true;
  if (!Array.isArray(product.variants)) return false;
  return product.variants.some(
    (v) =>
      v &&
      typeof v === "object" &&
      typeof (v as { stock?: unknown }).stock === "number" &&
      (v as { stock: number }).stock > 0
  );
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const adminAll = req.query.admin === "true";
    const lean = req.query.lean !== "false";
    const where: {
      active?: boolean;
      categorySlug?: string;
      isFeatured?: boolean;
      isNewArrival?: boolean;
      stock?: { lte: number } | { gt: number };
      OR?: Array<Record<string, unknown>>;
    } = adminAll ? {} : { active: true, stock: { gt: 0 } };

    if (adminAll && req.query.status === "active") where.active = true;
    if (adminAll && req.query.status === "inactive") where.active = false;
    if (adminAll && req.query.stock === "out") where.stock = { lte: 0 };
    if (adminAll && req.query.stock === "in") where.stock = { gt: 0 };

    if (typeof req.query.category === "string") where.categorySlug = req.query.category;
    if (req.query.featured === "true") where.isFeatured = true;
    if (req.query.new === "true") where.isNewArrival = true;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { categorySlug: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const defaultLimit = adminAll ? 20 : 24;
    const limit = Math.min(Number(req.query.limit ?? defaultLimit) || defaultLimit, 100);
    const skip = (page - 1) * limit;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        ...(lean ? { select: listSelect } : {}),
      }),
    ]);

    if (!adminAll) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }

    res.json({
      products: withIds(products),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);

router.get(
  "/:idOrSlug",
  asyncHandler(async (req, res) => {
    const key = String(req.params.idOrSlug ?? "");
    const includeInactive = req.query.admin === "true";
    let product = await prisma.product.findUnique({ where: { slug: key } });
    if (!product) {
      product = await prisma.product.findUnique({ where: { id: key } });
    }
    if (!product) throw new AppError(404, "Product not found");
    if (!product.active && !includeInactive) throw new AppError(404, "Product not found");
    // Storefront only shows products with stock. Admin can still open OOS items.
    if (!includeInactive && !productHasSellableStock(product)) {
      throw new AppError(404, "Product not found");
    }

    if (!includeInactive) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }

    res.json({ product: withId(product) });
  })
);

router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = productSchema.parse(req.body);
    const existing = await prisma.product.findUnique({ where: { slug: body.slug } });
    if (existing) throw new AppError(409, "A product with this slug already exists");
    const normalized = normalizeVariants(
      body.variants,
      body.price,
      body.stock ?? 100
    );
    const product = await prisma.product.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        image: body.image,
        images: body.images?.length ? body.images : [body.image],
        price: normalized.price,
        originalPrice: body.originalPrice,
        discountPercent: body.discountPercent,
        bonusQty: body.bonusQty ?? null,
        bonusPercent: body.bonusPercent ?? null,
        categorySlug: body.categorySlug,
        category: body.category ?? body.categorySlug,
        brand: body.brand ?? "",
        colors:
          normalized.variants.length > 0
            ? normalized.colors ?? []
            : body.colors ?? [],
        variants: normalized.variants as Prisma.InputJsonValue,
        badge: body.badge,
        subtitle: body.subtitle,
        stock: normalized.stock,
        isFeatured: body.isFeatured,
        isNewArrival: body.isNewArrival,
        active: body.active,
      },
    });
    res.status(201).json({ product: withId(product) });
  })
);

router.post(
  "/upload-image",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      uploadProductImage(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (!req.file) throw new AppError(400, "Please upload an image");
    const uploaded = await uploadProductImageBuffer(
      req.file.buffer,
      `admin-${Date.now()}-${req.file.originalname.replace(/\.[^.]+$/, "")}`
    );
    res.status(201).json({ url: uploaded.url, publicId: uploaded.publicId });
  })
);

router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = productSchema.partial().parse(req.body);
    try {
      const existing = await prisma.product.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new AppError(404, "Product not found");

      let data: Prisma.ProductUpdateInput = { ...body };
      if (body.variants !== undefined) {
        const normalized = normalizeVariants(
          body.variants,
          body.price ?? existing.price,
          body.stock ?? existing.stock
        );
        data = {
          ...body,
          variants: normalized.variants as Prisma.InputJsonValue,
          price: normalized.price,
          stock: normalized.stock,
          // Keep product.colors in sync with per-size colors for cards / legacy.
          colors:
            normalized.variants.length > 0
              ? normalized.colors ?? []
              : body.colors !== undefined
                ? body.colors
                : existing.colors,
        };
      }

      const product = await prisma.product.update({
        where: { id: String(req.params.id) },
        data,
      });
      res.json({ product: withId(product) });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(404, "Product not found");
    }
  })
);

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "Product not found");
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true, id });
  })
);

export default router;
