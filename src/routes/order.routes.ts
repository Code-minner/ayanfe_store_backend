import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { getStoreSettings, getStoreSettingsView } from "../services/settings.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth, requireAdmin, requireStaff, isStaffRole } from "../middleware/auth.js";
import checkoutRoutes from "./checkout.routes.js";
import { makeDocNumber, renderPrintDocument } from "../services/documents.js";
import { sendOrderStatusEmail } from "../services/mail.js";
import { ORDER_STATUSES, toOrderView } from "../types/order.js";
import { decrementStockForPaidOrder } from "../services/inventory.js";

const router = Router();

router.use(checkoutRoutes);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map(toOrderView) });
  })
);

router.get(
  "/print",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const type = z.enum(["invoice", "waybill"]).parse(req.query.type ?? "invoice");
    const methodFilter = z
      .enum(["local_pickup", "waybill", "stockpile", "lagos_delivery", "all"])
      .optional()
      .parse(typeof req.query.method === "string" ? req.query.method : "all");
    const ids = String(req.query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const fromRaw = typeof req.query.from === "string" ? req.query.from : "";
    const toRaw = typeof req.query.to === "string" ? req.query.to : "";
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (fromRaw && (!from || Number.isNaN(from.getTime()))) {
      throw new AppError(400, "Invalid from date");
    }
    if (toRaw && (!to || Number.isNaN(to.getTime()))) {
      throw new AppError(400, "Invalid to date");
    }
    if (to) to.setHours(23, 59, 59, 999);

    if (!ids.length && !from && !to) {
      throw new AppError(400, "Select order ids or a date range (from / to)");
    }

    const where: Prisma.OrderWhereInput = {};
    if (ids.length) {
      where.id = { in: ids };
    } else {
      if (from || to) {
        where.createdAt = {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        };
      }
    }

    // Filter by fulfillment so staff can print only local pickup, waybill, etc.
    const effectiveMethod =
      methodFilter && methodFilter !== "all"
        ? methodFilter
        : type === "waybill"
          ? "waybill"
          : null;
    if (effectiveMethod) {
      if (effectiveMethod === "waybill") {
        where.OR = [
          { shipping: { path: ["method"], equals: "waybill" } },
          { waybillNumber: { not: null } },
        ];
      } else {
        where.shipping = { path: ["method"], equals: effectiveMethod };
      }
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    if (orders.length === 0) throw new AppError(404, "No orders found for print");

    const updated = [];
    for (const order of orders) {
      const data: { invoiceNumber?: string; waybillNumber?: string } = {};
      if (!order.invoiceNumber) data.invoiceNumber = makeDocNumber("INV");
      if (type === "waybill" && !order.waybillNumber) data.waybillNumber = makeDocNumber("WB");
      updated.push(
        Object.keys(data).length
          ? await prisma.order.update({ where: { id: order.id }, data })
          : order
      );
    }

    const settings = await getStoreSettingsView();
    const html = renderPrintDocument(updated.map(toOrderView), settings, type);
    res.type("html").send(html);
  })
);

router.get(
  "/",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const where =
      typeof req.query.status === "string" && req.query.status !== "all"
        ? { status: z.enum(ORDER_STATUSES).parse(req.query.status) }
        : {};
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json({ orders: orders.map(toOrderView) });
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
    if (!order) throw new AppError(404, "Order not found");
    if (!isStaffRole(req.user!.role) && order.userId !== req.user!.id) {
      throw new AppError(403, "Not allowed");
    }
    res.json({ order: toOrderView(order) });
  })
);

router.patch(
  "/:id/status",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const status = z.enum(ORDER_STATUSES).parse(req.body.status);
    const existing = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new AppError(404, "Order not found");

    const previous = existing.status;
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        status,
        invoiceNumber: existing.invoiceNumber ?? makeDocNumber("INV"),
        waybillNumber:
          status === "shipped"
            ? existing.waybillNumber ?? makeDocNumber("WB")
            : existing.waybillNumber,
      },
    });

    if (status === "paid" && previous !== "paid") {
      void decrementStockForPaidOrder(order.items).catch((err) =>
        console.error("stock decrement failed", err)
      );
    }

    const view = toOrderView(order);
    void sendOrderStatusEmail(view, previous).catch((err) =>
      console.error("status email failed", err)
    );

    res.json({ order: view });
  })
);

router.patch(
  "/:id/shipping",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const shipping = z
      .object({
        method: z.enum(["local_pickup", "waybill", "stockpile", "lagos_delivery"]).optional(),
        fullName: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        shippingFee: z.number().optional(),
      })
      .parse(req.body);

    try {
      const order = await prisma.order.update({
        where: { id: String(req.params.id) },
        data: { shipping: shipping as Prisma.InputJsonValue },
      });
      res.json({ order: toOrderView(order) });
    } catch {
      throw new AppError(404, "Order not found");
    }
  })
);

export default router;

