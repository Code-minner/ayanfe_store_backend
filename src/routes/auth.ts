import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, withId } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth, signToken, type AuthUser } from "../middleware/auth.js";
import { uploadAvatar } from "../middleware/upload.js";
import { uploadAvatarBuffer } from "../services/cloudinary.js";
import { consumeEmailOtp, issueEmailOtp } from "../services/otp.js";

const router = Router();

function publicUser(user: {
  id: string;
  email: string;
  role: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}) {
  const firstName = user.firstName || user.name.split(/\s+/)[0] || "";
  const lastName =
    user.lastName || user.name.split(/\s+/).slice(1).join(" ") || "";
  return withId({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    firstName,
    lastName,
    phone: user.phone || "",
    avatarUrl: user.avatarUrl || null,
  });
}

function tokenUser(user: { id: string; email: string; role: string; name: string }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role as "customer" | "admin",
    name: user.name,
  };
}

const registerSchema = z.object({
  name: z.string().min(2).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  otp: z.string().regex(/^\d{4}$/, "Enter the 4-digit code from your email"),
});

router.post(
  "/otp/send",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        purpose: z.enum(["signup", "reset"]).optional(),
      })
      .parse(req.body);

    const email = body.email.toLowerCase();
    const purpose = body.purpose ?? "signup";

    if (purpose === "signup") {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) throw new AppError(409, "Email already registered");
    }

    const result = await issueEmailOtp({ email, purpose });
    res.json({
      message:
        result.mode === "console"
          ? "Verification code generated (email provider unavailable — use preview code)"
          : "Verification code sent to your email",
      email: result.email,
      expiresIn: result.expiresIn,
      delivered: result.mode === "zeptomail",
      ...(result.previewCode ? { previewCode: result.previewCode } : {}),
    });
  })
);

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const firstName = body.firstName?.trim() || "";
    const lastName = body.lastName?.trim() || "";
    const name = (body.name?.trim() || `${firstName} ${lastName}`.trim()).trim();
    if (!name) throw new AppError(400, "Name is required");

    const email = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new AppError(409, "Email already registered");

    await consumeEmailOtp({ email, code: body.otp, purpose: "signup" });

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        firstName: firstName || name.split(/\s+/)[0] || "",
        lastName: lastName || name.split(/\s+/).slice(1).join(" ") || "",
        email,
        phone: body.phone?.trim() || "",
        passwordHash,
        role: "customer",
      },
    });

    const auth = tokenUser(user);
    res.status(201).json({ user: publicUser(user), token: signToken(auth) });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(6) })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) throw new AppError(401, "Invalid email or password");

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new AppError(401, "Invalid email or password");
    if (user.active === false) throw new AppError(403, "This account has been suspended");

    const auth = tokenUser(user);
    res.json({ user: publicUser(user), token: signToken(auth) });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, "User not found");
    res.json({ user: publicUser(user) });
  })
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })
      .parse(req.body);

    if (body.email) {
      const taken = await prisma.user.findFirst({
        where: { email: body.email.toLowerCase(), NOT: { id: req.user!.id } },
      });
      if (taken) throw new AppError(409, "Email already in use");
    }

    const current = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!current) throw new AppError(404, "User not found");

    const firstName = body.firstName ?? current.firstName;
    const lastName = body.lastName ?? current.lastName;
    const name = `${firstName} ${lastName}`.trim() || current.name;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        firstName,
        lastName,
        name,
        email: body.email?.toLowerCase() ?? current.email,
        phone: body.phone ?? current.phone,
      },
    });

    res.json({ user: publicUser(user) });
  })
);

router.patch(
  "/me/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        oldPassword: z.string().min(6),
        newPassword: z.string().min(6),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, "User not found");

    const ok = await bcrypt.compare(body.oldPassword, user.passwordHash);
    if (!ok) throw new AppError(400, "Old password is incorrect");

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
    });

    res.json({ message: "Password updated" });
  })
);

router.post(
  "/me/avatar",
  requireAuth,
  (req, res, next) => {
    uploadAvatar(req, res, (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(400, "Upload failed"));
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, "Please upload an avatar image");
    const uploaded = await uploadAvatarBuffer(req.file.buffer, req.file.originalname);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: uploaded.url },
    });
    res.json({ user: publicUser(user) });
  })
);

export default router;
