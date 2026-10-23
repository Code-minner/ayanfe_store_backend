import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma, withId } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendAdminInviteEmail } from "../services/mail.js";
import { toOrderView } from "../types/order.js";

const router = Router();

router.use(requireAuth, requireAdmin);

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
    role: user.role === "admin" ? "Admin" : user.role,
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
    const customers = await prisma.user.findMany({
      where: {
        role: "customer",
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
    const body = z
      .object({ active: z.boolean() })
      .parse(req.body);
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

router.get(
  "/admins",
  asyncHandler(async (_req, res) => {
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ admins: admins.map(publicAdmin) });
  })
);

router.post(
  "/admins/invite",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
      })
      .parse(req.body);

    const email = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      if (exists.role === "admin") {
        throw new AppError(409, "This email is already an admin");
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
        role: "admin",
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
      message: "Invite sent. Temporary password emailed to the new admin.",
    });
  })
);

export default router;
