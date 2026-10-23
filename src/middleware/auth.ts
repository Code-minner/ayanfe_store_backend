import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../db.js";

export interface AuthUser {
  id: string;
  email: string;
  role: "customer" | "admin";
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] }
  );
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Authentication required"));
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    const exists = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true },
    });
    if (!exists) return next(new AppError(401, "User no longer exists"));
    req.user = payload;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, "Authentication required"));
  if (req.user.role !== "admin") return next(new AppError(403, "Admin access required"));
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, env.jwtSecret) as AuthUser;
  } catch {
    /* ignore invalid optional token */
  }
  next();
}
