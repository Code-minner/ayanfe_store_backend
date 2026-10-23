import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { AppError } from "../utils/AppError.js";
import { sendOtpEmail } from "./mail.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function makeCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function issueEmailOtp(opts: {
  email: string;
  purpose?: "signup" | "reset";
}) {
  const email = opts.email.trim().toLowerCase();
  const purpose = opts.purpose ?? "signup";
  const code = makeCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.emailOtp.deleteMany({ where: { email, purpose } });
  await prisma.emailOtp.create({
    data: { email, purpose, codeHash, expiresAt },
  });

  const mail = await sendOtpEmail({ to: email, code, purpose });
  if (mail.mode === "console") {
    console.log(`[otp:${purpose}] ${email} => ${code}`);
  }
  return {
    email,
    expiresIn: Math.floor(OTP_TTL_MS / 1000),
    mode: mail.mode,
    // Only when mail fell back to console (dev / invalid ZeptoMail token)
    previewCode: mail.mode === "console" ? code : undefined,
  };
}

export async function consumeEmailOtp(opts: {
  email: string;
  code: string;
  purpose?: "signup" | "reset";
}) {
  const email = opts.email.trim().toLowerCase();
  const purpose = opts.purpose ?? "signup";
  const code = opts.code.trim();

  const row = await prisma.emailOtp.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });

  if (!row) throw new AppError(400, "No verification code found. Request a new one.");
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.emailOtp.deleteMany({ where: { email, purpose } });
    throw new AppError(400, "Verification code expired. Request a new one.");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.emailOtp.deleteMany({ where: { email, purpose } });
    throw new AppError(400, "Too many attempts. Request a new code.");
  }

  const ok = await bcrypt.compare(code, row.codeHash);
  if (!ok) {
    await prisma.emailOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, "Incorrect verification code.");
  }

  await prisma.emailOtp.deleteMany({ where: { email, purpose } });
  return { email, purpose };
}
