import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../db.js";

export type StaffRole = "support" | "admin" | "super_admin";
export type AppRole = "customer" | StaffRole;

export interface AuthUser {
  id: string;
  email: string;
  role: AppRole;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const STAFF_ROLES: StaffRole[] = ["support", "admin", "super_admin"];

export function isStaffRole(role: string): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

export function signToken(user: AuthUser) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] }
  );
}

async function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      active: true,
    },
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Authentication required"));
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    const exists = await loadUser(payload.id);
    if (!exists) return next(new AppError(401, "User no longer exists"));
    if (!exists.active) return next(new AppError(403, "Account is suspended"));
    req.user = {
      id: exists.id,
      email: exists.email,
      role: exists.role as AppRole,
      name: exists.name,
    };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
}

/** Any back-office role (support, admin, super_admin). */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, "Authentication required"));
  if (!isStaffRole(req.user.role)) {
    return next(new AppError(403, "Staff access required"));
  }
  next();
}

/** Admin or super admin (not customer care). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, "Authentication required"));
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return next(new AppError(403, "Admin access required"));
  }
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, "Authentication required"));
  if (req.user.role !== "super_admin") {
    return next(new AppError(403, "Super admin access required"));
  }
  next();
}

/** @deprecated use requireStaff or requireAdmin */
export const requireAdminLegacy = requireAdmin;

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = payload;
  } catch {
    /* ignore invalid optional token */
  }
  next();
}
