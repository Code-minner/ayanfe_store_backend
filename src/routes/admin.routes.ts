import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma, withId } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import {
  requireAuth,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  type StaffRole,
} from "../middleware/auth.js";
import { sendAdminInviteEmail } from "../services/mail.js";
import { toOrderView } from "../types/order.js";

const router = Router();

router.use(requireAuth, requireStaff);

const STAFF_ROLES = ["support", "admin", "super_admin"] as const;

const ROLE_LABEL: Record<string, string> = {
  support: "Customer Care",
  admin: "Admin",
  super_admin: "Super Admin",
};

function publicCustomer(user: {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  active: boolean;
  createdAt: Date;
  _count?: { orders: number };
}) {
  const firstName = user.firstName || user.name.split(/\s+/)[0] || "";
  const lastName = user.lastName || user.name.split(/\s+/).slice(1).join(" ") || "";
  return withId({
    id: user.id,
    name: user.name,
    firstName,
    lastName,
    email: user.email,
    phone: user.phone || "",
    avatarUrl: user.avatarUrl,
    registeredAt: user.createdAt,
    orders: user._count?.orders ?? 0,
    status: user.active ? "Active" : "Suspended",
    active: user.active,
  });
}

function publicAdmin(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return withId({
    id: user.id,
    name: user.name,
    email: user.email,
    role: ROLE_LABEL[user.role] || user.role,
    roleKey: user.role,
    dateAdded: user.createdAt,
    lastActive: user.updatedAt,
    status: user.active ? "Active" : "Inactive",
    active: user.active,
  });
}

router.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const customers = await prisma.user.findMany({
      where: {
        role: "customer",
        ...(status === "active" ? { active: true } : {}),
        ...(status === "inactive" || status === "suspended" ? { active: false } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ customers: customers.map(publicCustomer) });
  })
);

router.get(
  "/customers/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: String(req.params.id), role: "customer" },
      include: {
        _count: { select: { orders: true } },
        orders: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!user) throw new AppError(404, "Customer not found");
    res.json({
      customer: publicCustomer(user),
      orders: user.orders.map(toOrderView),
    });
  })
);

router.patch(
  "/customers/:id/status",
  asyncHandler(async (req, res) => {
    const body = z.object({ active: z.boolean() }).parse(req.body);
    const existing = await prisma.user.findFirst({
      where: { id: String(req.params.id), role: "customer" },
    });
    if (!existing) throw new AppError(404, "Customer not found");

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { active: body.active },
      include: { _count: { select: { orders: true } } },
    });
    res.json({ customer: publicCustomer(user) });
  })
);

const PAID_STATUSES = ["paid", "processing", "shipped"] as const;
const PENDING_PAY_STATUSES = ["pending", "pending_verification", "on_hold"] as const;

function monthWindow(ref = new Date()) {
  const startThis = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const startNext = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  const startPrev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return { startThis, startNext, startPrev };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function sumOrders(where: {
  createdAt?: { gte?: Date; lt?: Date };
  status?: { in: string[] };
}) {
  const agg = await prisma.order.aggregate({
    where: where as never,
    _sum: { total: true },
    _count: true,
  });
  return { sum: agg._sum.total ?? 0, count: agg._count };
}

router.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { startThis, startNext, startPrev } = monthWindow();
    const nowYear = new Date().getFullYear();
    const yearRaw = Number(req.query.year);
    const year =
      Number.isFinite(yearRaw) && yearRaw >= 2020 && yearRaw <= nowYear + 1
        ? Math.floor(yearRaw)
        : nowYear;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [
      customers,
      customersThis,
      customersPrev,
      staff,
      activeProducts,
      totalProducts,
      ordersTotal,
      ordersThis,
      ordersPrev,
      paidAll,
      paidThis,
      paidPrev,
      pendingPay,
      pendingPayThis,
      pendingPayPrev,
      inflowAll,
      inflowThis,
      inflowPrev,
      statusGroups,
      methodGroups,
      customersByMonth,
      firstCustomer,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "customer" } }),
      prisma.user.count({
        where: { role: "customer", createdAt: { gte: startThis, lt: startNext } },
      }),
      prisma.user.count({
        where: { role: "customer", createdAt: { gte: startPrev, lt: startThis } },
      }),
      prisma.user.count({ where: { role: { in: [...STAFF_ROLES] } } }),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: startThis, lt: startNext } } }),
      prisma.order.count({ where: { createdAt: { gte: startPrev, lt: startThis } } }),
      sumOrders({ status: { in: [...PAID_STATUSES] } }),
      sumOrders({
        status: { in: [...PAID_STATUSES] },
        createdAt: { gte: startThis, lt: startNext },
      }),
      sumOrders({
        status: { in: [...PAID_STATUSES] },
        createdAt: { gte: startPrev, lt: startThis },
      }),
      sumOrders({ status: { in: [...PENDING_PAY_STATUSES] } }),
      sumOrders({
        status: { in: [...PENDING_PAY_STATUSES] },
        createdAt: { gte: startThis, lt: startNext },
      }),
      sumOrders({
        status: { in: [...PENDING_PAY_STATUSES] },
        createdAt: { gte: startPrev, lt: startThis },
      }),
      sumOrders({}),
      sumOrders({ createdAt: { gte: startThis, lt: startNext } }),
      sumOrders({ createdAt: { gte: startPrev, lt: startThis } }),
      prisma.order.groupBy({ by: ["status"], _count: true, _sum: { total: true } }),
      prisma.order.groupBy({ by: ["paymentMethod"], _count: true, _sum: { total: true } }),
      prisma.user.findMany({
        where: { role: "customer", createdAt: { gte: yearStart, lt: yearEnd } },
        select: { createdAt: true },
      }),
      prisma.user.findFirst({
        where: { role: "customer" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

    const customersChart = Array.from({ length: 12 }, () => 0);
    for (const u of customersByMonth) {
      customersChart[u.createdAt.getMonth()] += 1;
    }

    const startYear = firstCustomer?.createdAt
      ? firstCustomer.createdAt.getFullYear()
      : year;
    const chartYears: number[] = [];
    for (let y = startYear; y <= nowYear; y++) chartYears.push(y);
    if (!chartYears.includes(year)) chartYears.push(year);
    chartYears.sort((a, b) => a - b);

    const byStatus: Record<string, { count: number; total: number }> = {};
    for (const row of statusGroups) {
      byStatus[row.status] = {
        count: row._count,
        total: row._sum.total ?? 0,
      };
    }

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const row of methodGroups) {
      byMethod[row.paymentMethod] = {
        count: row._count,
        total: row._sum.total ?? 0,
      };
    }

    const pendingOrders =
      (byStatus.pending?.count ?? 0) +
      (byStatus.pending_verification?.count ?? 0) +
      (byStatus.on_hold?.count ?? 0);
    const completedOrders =
      (byStatus.paid?.count ?? 0) +
      (byStatus.processing?.count ?? 0) +
      (byStatus.shipped?.count ?? 0);
    const canceledOrders =
      (byStatus.failed?.count ?? 0) + (byStatus.cancelled?.count ?? 0);

    res.json({
      stats: {
        customers,
        customersChangePct: pctChange(customersThis, customersPrev),
        staff,
        activeProducts,
        totalProducts,
        inactiveProducts: Math.max(0, totalProducts - activeProducts),
        ordersTotal,
        ordersChangePct: pctChange(ordersThis, ordersPrev),
        ordersPending: pendingOrders,
        ordersCompleted: completedOrders,
        ordersCanceled: canceledOrders,
        revenueConfirmed: paidAll.sum,
        revenueConfirmedChangePct: pctChange(paidThis.sum, paidPrev.sum),
        revenueInflow: inflowAll.sum,
        revenueInflowChangePct: pctChange(inflowThis.sum, inflowPrev.sum),
        revenuePending: pendingPay.sum,
        revenuePendingChangePct: pctChange(pendingPayThis.sum, pendingPayPrev.sum),
        paidCount: paidAll.count,
        pendingPayCount: pendingPay.count,
        byStatus,
        byMethod,
        customersChart,
        chartYear: year,
        chartYears,
        customersInChartYear: customersByMonth.length,
      },
    });
  })
);

router.get(
  "/admins",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const admins = await prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ admins: admins.map(publicAdmin) });
  })
);

router.post(
  "/admins/invite",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(["support", "admin", "super_admin"]).default("admin"),
      })
      .parse(req.body);

    const inviteRole = body.role as StaffRole;
    if (inviteRole === "super_admin" && req.user!.role !== "super_admin") {
      throw new AppError(403, "Only a super admin can invite another super admin");
    }

    const email = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      if (STAFF_ROLES.includes(exists.role as (typeof STAFF_ROLES)[number])) {
        throw new AppError(409, "This email is already a staff account");
      }
      throw new AppError(409, "This email belongs to a customer account");
    }

    const tempPassword = randomBytes(5).toString("base64url").slice(0, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const parts = body.name.trim().split(/\s+/);
    const firstName = parts[0] || body.name;
    const lastName = parts.slice(1).join(" ");

    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        firstName,
        lastName,
        email,
        passwordHash,
        role: inviteRole,
        active: true,
      },
    });

    void sendAdminInviteEmail({
      to: email,
      name: user.name,
      tempPassword,
      invitedBy: req.user!.name || req.user!.email,
    }).catch((err) => console.error("admin invite email failed", err));

    res.status(201).json({
      admin: publicAdmin(user),
      message: `Invite sent. Temporary password emailed to the new ${ROLE_LABEL[inviteRole] || inviteRole}.`,
    });
  })
);

/** Promote / demote staff role. Super admin only. */
router.patch(
  "/admins/:id/role",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ role: z.enum(["support", "admin", "super_admin"]) })
      .parse(req.body);

    const existing = await prisma.user.findFirst({
      where: {
        id: String(req.params.id),
        role: { in: [...STAFF_ROLES] },
      },
    });
    if (!existing) throw new AppError(404, "Staff member not found");
    if (existing.id === req.user!.id && body.role !== "super_admin") {
      throw new AppError(400, "You cannot demote your own super admin account");
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { role: body.role },
    });
    res.json({ admin: publicAdmin(user) });
  })
);

/** Suspend / reactivate staff. Super admin only. Blocks login when inactive. */
router.patch(
  "/admins/:id/status",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ active: z.boolean() }).parse(req.body);
    const existing = await prisma.user.findFirst({
      where: {
        id: String(req.params.id),
        role: { in: [...STAFF_ROLES] },
      },
    });
    if (!existing) throw new AppError(404, "Staff member not found");
    if (existing.id === req.user!.id) {
      throw new AppError(400, "You cannot suspend your own account");
    }
    if (existing.role === "super_admin" && body.active === false) {
      const supers = await prisma.user.count({
        where: { role: "super_admin", active: true },
      });
      if (supers <= 1) {
        throw new AppError(400, "You cannot suspend the last active super admin");
      }
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { active: body.active },
    });
    res.json({ admin: publicAdmin(user) });
  })
);

/**
 * Delete staff (Customer Care or Admin). Super admin only.
 * Other super admins cannot be deleted here (demote/suspend first if needed).
 */
router.delete(
  "/admins/:id",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findFirst({
      where: {
        id: String(req.params.id),
        role: { in: [...STAFF_ROLES] },
      },
    });
    if (!existing) throw new AppError(404, "Staff member not found");
    if (existing.id === req.user!.id) {
      throw new AppError(400, "You cannot delete your own account");
    }
    if (existing.role === "super_admin") {
      throw new AppError(
        400,
        "You cannot delete a super admin. Demote or suspend them first."
      );
    }

    await prisma.user.delete({ where: { id: existing.id } });
    res.json({ ok: true, id: existing.id });
  })
);

export default router;
