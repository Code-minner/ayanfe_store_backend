import { Router } from "express";
import authRoutes from "./auth.js";
import adminRoutes from "./admin.routes.js";
import categoryRoutes from "./category.routes.js";
import productRoutes from "./product.routes.js";
import checkoutRoutes from "./checkout.routes.js";
import orderRoutes from "./order.routes.js";
import paymentRoutes from "./payment.routes.js";
import settingsRoutes from "./settings.routes.js";
import wishlistRoutes from "./wishlist.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ayanfe_store_backend" });
});

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/settings", settingsRoutes);
router.use("/wishlist", wishlistRoutes);

export default router;
