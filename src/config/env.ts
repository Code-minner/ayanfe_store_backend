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
  checkoutFee: Number(process.env.CHECKOUT_FEE ?? 0),
  waybillFee: Number(process.env.WAYBILL_FEE ?? 500),
  stockpileFee: Number(process.env.STOCKPILE_FEE ?? 50),
  localPickupFee: Number(process.env.LOCAL_PICKUP_FEE ?? 50),
  lagosDeliveryFee: Number(process.env.LAGOS_DELIVERY_FEE ?? 50),

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
  /** Public storefront origin (for email logo / links). */
  storefrontUrl: (process.env.STOREFRONT_URL ?? "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\/$/, ""),
  /** Public admin origin. */
  adminAppUrl: (process.env.ADMIN_APP_URL ?? "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\/$/, ""),
  /**
   * Absolute HTTPS logo for emails. Gmail blocks data: URIs; product images work
   * because they are https://. Prefer a Cloudinary or site /brand/attog-logo.png URL.
   */
  emailLogoUrl: (process.env.EMAIL_LOGO_URL ?? "")
    .replace(/^["']|["']$/g, "")
    .trim(),

  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
};
