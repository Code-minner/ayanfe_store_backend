import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgresql://localhost:5432/ayanfe_store"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
  bank: {
    bankName: process.env.BANK_NAME ?? "First Bank",
    accountName: process.env.BANK_ACCOUNT_NAME ?? "ATTOG STORE",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER ?? "9182747839",
  },
  checkoutFee: Number(process.env.CHECKOUT_FEE ?? 3500),
  waybillFee: Number(process.env.WAYBILL_FEE ?? 500),

  // ZeptoMail
  zeptomailHost: process.env.ZEPTOMAIL_HOST ?? "api.zeptomail.com",
  zeptomailToken: (process.env.ZEPTOMAIL_TOKEN ?? "").replace(/^["']|["']$/g, "").trim(),
  zeptomailFromEmail: (process.env.ZEPTOMAIL_FROM_EMAIL ?? "noreply@ayanfewholesale.com")
    .replace(/^["']|["']$/g, "")
    .trim(),
  zeptomailFromName: (process.env.ZEPTOMAIL_FROM_NAME ?? "Attog Store")
    .replace(/^["']|["']$/g, "")
    .trim(),
  adminEmail: process.env.ADMIN_EMAIL ?? process.env.ADMIN_NOTIFY_EMAIL ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
};
