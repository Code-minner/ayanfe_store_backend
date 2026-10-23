import { Router } from "express";
import { z } from "zod";
import { prisma, withId, withIds } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  heroImage: z.string().min(1),
  icon: z.string().min(1),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json({ categories: withIds(categories) });
  })
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findUnique({
      where: { slug: String(req.params.slug) },
    });
    if (!category) throw new AppError(404, "Category not found");
    res.json({ category: withId(category) });
  })
);

router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = categorySchema.parse(req.body);
    const category = await prisma.category.create({ data: body });
    res.status(201).json({ category: withId(category) });
  })
);

router.put(
  "/:slug",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = categorySchema.partial().parse(req.body);
    try {
      const category = await prisma.category.update({
        where: { slug: String(req.params.slug) },
        data: body,
      });
      res.json({ category: withId(category) });
    } catch {
      throw new AppError(404, "Category not found");
    }
  })
);

export default router;
