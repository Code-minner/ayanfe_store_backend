import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { getStoreSettings } from "../services/settings.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { optionalAuth } from "../middleware/auth.js";
import { uploadReceipt } from "../middleware/upload.js";
import { uploadReceiptBuffer } from "../services/cloudinary.js";
import { makeDocNumber } from "../services/documents.js";
import { sendOrderPlacedEmails } from "../services/mail.js";
import { toOrderView } from "../types/order.js";

const router = Router();

const itemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  image: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  color: z.string().optional(),
});

const shippingSchema = z
  .object({
    fullName: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  })
  .optional();

const checkoutSchema = z.object({
  email: z.string().email(),
  items: z.array(itemSchema).min(1),
  customerNote: z.string().optional(),
  shipping: shippingSchema,
});

function totals(items: z.infer<typeof itemSchema>[]) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const fee = env.checkoutFee;
  return { subtotal, fee, total: subtotal + fee };
}

router.get(
  "/payment-config",
  asyncHandler(async (_req, res) => {
    const settings = await getStoreSettings();
    res.json({
      bank: env.bank,
      checkoutFee: env.checkoutFee,
      paystackPublicKey: settings.paystackEnabled ? env.paystackPublicKey || null : null,
      payments: {
        paystack: Boolean(settings.paystackEnabled && env.paystackSecretKey),
        bankTransfer: Boolean(settings.bankTransferEnabled),
      },
      storeName: settings.storeName,
    });
  })
);

router.post(
  "/bank-transfer",
  optionalAuth,
  (req, res, next) => {
    uploadReceipt(req, res, (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(400, "Upload failed"));
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const settings = await getStoreSettings();
    if (!settings.bankTransferEnabled) {
      throw new AppError(403, "Bank transfer is currently disabled");
    }

    let shipping = req.body.shipping;
    if (typeof shipping === "string") {
      try {
        shipping = JSON.parse(shipping);
      } catch {
        shipping = undefined;
      }
    }

    const parsed = checkoutSchema.safeParse({
      email: req.body.email,
      items: typeof req.body.items === "string" ? JSON.parse(req.body.items) : req.body.items,
      customerNote: req.body.customerNote,
      shipping,
    });
    if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid payload");
    if (!req.file) throw new AppError(400, "Please upload proof of payment");

    const uploaded = await uploadReceiptBuffer(req.file.buffer, req.file.originalname);
    const { subtotal, fee, total } = totals(parsed.data.items);

    const email = parsed.data.email.toLowerCase();
    let userId = req.user?.id;
    if (!userId) {
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      userId = existing?.id;
    }

    const order = await prisma.order.create({
      data: {
        userId,
        email,
        items: parsed.data.items as Prisma.InputJsonValue,
        subtotal,
        fee,
        total,
        paymentMethod: "bank_transfer",
        status: "pending_verification",
        receiptUrl: uploaded.url,
        customerNote: parsed.data.customerNote,
        shipping: (parsed.data.shipping ?? {}) as Prisma.InputJsonValue,
        invoiceNumber: makeDocNumber("INV"),
      },
    });

    const view = toOrderView(order);
    void sendOrderPlacedEmails(view).catch((err) => console.error("order email failed", err));

    res.status(201).json({ order: view });
  })
);

async function createPaystackOrder(req: Request, res: Response) {
  const settings = await getStoreSettings();
  if (!settings.paystackEnabled) {
    throw new AppError(403, "Paystack is currently disabled");
  }
  if (!env.paystackSecretKey) {
    throw new AppError(503, "Paystack is not configured on the server");
  }

  const body = checkoutSchema.parse(req.body);
  const { subtotal, fee, total } = totals(body.items);

  const order = await prisma.order.create({
    data: {
      userId: req.user?.id,
      email: body.email,
      items: body.items as Prisma.InputJsonValue,
      subtotal,
      fee,
      total,
      paymentMethod: "paystack",
      status: "pending",
      customerNote: body.customerNote,
      shipping: (body.shipping ?? {}) as Prisma.InputJsonValue,
      invoiceNumber: makeDocNumber("INV"),
    },
  });

  const view = toOrderView(order);
  void sendOrderPlacedEmails(view).catch((err) => console.error("order email failed", err));

  res.status(201).json({ order: view });
}

router.post("/paystack", optionalAuth, asyncHandler(createPaystackOrder));
router.post("/paystack/create", optionalAuth, asyncHandler(createPaystackOrder));

export default router;

