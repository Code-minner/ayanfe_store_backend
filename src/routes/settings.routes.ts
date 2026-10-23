import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { getStoreSettings, getStoreSettingsView } from "../services/settings.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { toSettingsView } from "../types/order.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getStoreSettingsView() });
  })
);

router.put(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        payments: z
          .object({
            paystack: z.boolean().optional(),
            bankTransfer: z.boolean().optional(),
          })
          .optional(),
        adminNotifyEmail: z.string().email().or(z.literal("")).optional(),
        storeName: z.string().min(1).optional(),
        storeAddress: z.string().optional(),
        storePhone: z.string().optional(),
      })
      .parse(req.body);

    const current = await getStoreSettings();
    const settings = await prisma.settings.update({
      where: { id: current.id },
      data: {
        paystackEnabled: body.payments?.paystack ?? current.paystackEnabled,
        bankTransferEnabled: body.payments?.bankTransfer ?? current.bankTransferEnabled,
        adminNotifyEmail: body.adminNotifyEmail ?? current.adminNotifyEmail,
        storeName: body.storeName ?? current.storeName,
        storeAddress: body.storeAddress ?? current.storeAddress,
        storePhone: body.storePhone ?? current.storePhone,
      },
    });

    res.json({ settings: toSettingsView(settings) });
  })
);

export default router;
