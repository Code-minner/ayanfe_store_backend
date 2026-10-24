import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { optionalAuth } from "../middleware/auth.js";
import { sendOrderStatusEmail } from "../services/mail.js";
import { makeDocNumber } from "../services/documents.js";
import { toOrderView } from "../types/order.js";
import { decrementStockForPaidOrder } from "../services/inventory.js";

const router = Router();

router.post(
  "/paystack/initialize",
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!env.paystackSecretKey) {
      throw new AppError(503, "Paystack is not configured on the server");
    }

    const body = z
      .object({
        orderId: z.string().min(1),
        callback_url: z.string().url().optional(),
      })
      .parse(req.body);

    const order = await prisma.order.findUnique({ where: { id: body.orderId } });
    if (!order) throw new AppError(404, "Order not found");
    if (order.paymentMethod !== "paystack") {
      throw new AppError(400, "Order is not a Paystack order");
    }
    if (order.status === "paid") throw new AppError(400, "Order already paid");

    const amountKobo = Math.round(order.total * 100);
    const payload = {
      email: order.email,
      amount: amountKobo,
      currency: "NGN",
      reference: `ayanfe_${order.id}_${Date.now()}`,
      metadata: { orderId: order.id },
      callback_url: body.callback_url,
    };

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new AppError(502, data.message || "Paystack initialize failed");
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { paystackReference: data.data.reference, status: "pending" },
    });

    res.json({
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
      orderId: order.id,
    });
  })
);

router.get(
  "/paystack/verify/:reference",
  asyncHandler(async (req, res) => {
    if (!env.paystackSecretKey) {
      throw new AppError(503, "Paystack is not configured on the server");
    }

    const reference = String(req.params.reference ?? "");
    if (!reference) throw new AppError(400, "Reference is required");
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${env.paystackSecretKey}` } }
    );

    const data = (await response.json()) as {
      status: boolean;
      message: string;
      data?: { status: string; reference: string; metadata?: { orderId?: string } };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new AppError(502, data.message || "Paystack verify failed");
    }

    let order =
      (await prisma.order.findFirst({ where: { paystackReference: reference } })) ||
      (data.data.metadata?.orderId
        ? await prisma.order.findUnique({ where: { id: data.data.metadata.orderId } })
        : null);

    if (!order) throw new AppError(404, "Order not found for this payment");

    const previous = order.status;
    const paidNow = data.data.status === "success";
    order = await prisma.order.update({
      where: { id: order.id },
      data: paidNow
        ? {
            status: "paid",
            paystackReference: data.data.reference,
            invoiceNumber: order.invoiceNumber ?? makeDocNumber("INV"),
          }
        : { status: "failed" },
    });

    if (paidNow && previous !== "paid") {
      void decrementStockForPaidOrder(order.items).catch((err) =>
        console.error("stock decrement failed", err)
      );
    }

    const view = toOrderView(order);
    void sendOrderStatusEmail(view, previous).catch((err) =>
      console.error("status email failed", err)
    );

    res.json({ order: view, paystack: data.data });
  })
);

export default router;
