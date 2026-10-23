import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message || "Invalid request";
    res.status(400).json({ message });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}
