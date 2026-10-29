import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { getStoreSettings } from "./settings.js";
import { shippingLabel } from "./shippingFees.js";
import type { OrderItem, OrderView, SettingsView } from "../types/order.js";

/** Brand colors (match admin + invoice). */
const BRAND = {
  primary: "#4B0A6B",
  logo: "#8400A8",
  soft: "#F8F1FA",
  softBorder: "#E8D5EF",
} as const;

function money(n: number) {
  return `₦${Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paymentLabel(method: string) {
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "paystack") return "Paystack";
  return method.replace(/_/g, " ");
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function formatLongDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function looksLikeSizeLabel(value: string) {
  const t = value.trim();
  return (
    /^\d{2,3}$/.test(t) ||
    /^age\s*\d+/i.test(t) ||
    /^(xxs|xs|s|m|l|xl|xxl|xxxl)$/i.test(t)
  );
}

function absoluteImageUrl(src: string | undefined | null): string | null {
  if (!src || typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return null;
}

const LOGO_CID = "attog-logo";

function readLogoPng(): Buffer | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../assets/attog-logo.png"),
    join(here, "../../../ayanfe_store_admin/public/brand/attog-logo.png"),
    join(here, "../../../ayanfe_store_frontend/public/brand/attog-logo.png"),
  ];
  for (const pngPath of candidates) {
    try {
      return readFileSync(pngPath);
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Public https:// logo URL. Gmail strips data:image base64 embeds;
 * product photos show because they are https:// (Cloudinary).
 */
function resolveEmailLogoUrl(): string | null {
  if (env.emailLogoUrl && /^https:\/\//i.test(env.emailLogoUrl)) {
    return env.emailLogoUrl;
  }
  if (env.storefrontUrl && /^https:\/\//i.test(env.storefrontUrl)) {
    return `${env.storefrontUrl}/brand/attog-logo.png`;
  }
  if (env.adminAppUrl && /^https:\/\//i.test(env.adminAppUrl)) {
    return `${env.adminAppUrl}/brand/attog-logo.png`;
  }
  const httpsOrigin = env.corsOrigin.find((o) => /^https:\/\//i.test(o));
  if (httpsOrigin) {
    return `${httpsOrigin.replace(/\/$/, "")}/brand/attog-logo.png`;
  }
  return null;
}

/**
 * Email-safe logo.
 * Prefer a public https:// URL first (same reason product images show in Gmail).
 * If no public URL is configured, use ZeptoMail CID inline attachment.
 * Never use data:image base64 (Gmail strips it).
 */
function emailLogoHtml() {
  const remote = resolveEmailLogoUrl();
  if (remote) {
    return `<img src="${escapeHtml(remote)}" alt="Attog Store" width="160" height="36" style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none" />`;
  }
  if (readLogoPng()) {
    return `<img src="cid:${LOGO_CID}" alt="Attog Store" width="160" height="36" style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none" />`;
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:0.08em;color:${BRAND.logo};line-height:1">ATTOG</div>`;
}

function customerName(order: OrderView) {
  const s = order.shipping;
  return (
    s?.fullName ||
    [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim() ||
    "Customer"
  );
}

function addressLines(order: OrderView): string[] {
  const s = order.shipping;
  if (!s) return [];
  return [s.address, s.city, s.state, s.country].filter(
    (p): p is string => Boolean(p && String(p).trim())
  );
}

function itemMeta(item: OrderItem): string {
  const bits: string[] = [];
  if (item.brand?.trim()) bits.push(`Brand: ${escapeHtml(item.brand.trim())}`);
  if (item.size?.trim()) {
    const label = looksLikeSizeLabel(item.size) ? "Size" : "Option";
    bits.push(`${label}: ${escapeHtml(item.size.trim())}`);
  }
  if (item.color?.trim()) bits.push(`Color: ${escapeHtml(item.color.trim())}`);
  return bits.join(" · ");
}

function itemRowHtml(item: OrderItem) {
  const img = absoluteImageUrl(item.image);
  const meta = itemMeta(item);
  const line = item.price * item.quantity;
  return `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;vertical-align:top">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;padding-right:12px">
              ${
                img
                  ? `<img src="${escapeHtml(img)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:contain;border:1px solid #e5e5e5;border-radius:8px;background:#fff" />`
                  : `<div style="width:56px;height:56px;border:1px solid #e5e5e5;border-radius:8px;background:#f5f5f5"></div>`
              }
            </td>
            <td style="vertical-align:top">
              <div style="font-size:14px;font-weight:600;color:#111;line-height:1.35">${escapeHtml(item.name)}</div>
              ${meta ? `<div style="margin-top:4px;font-size:12px;color:#666;line-height:1.4">${meta}</div>` : ""}
              <div style="margin-top:4px;font-size:12px;color:#555">${money(item.price)} each</div>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:center;vertical-align:top;font-size:14px;color:#111;white-space:nowrap">${item.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;vertical-align:top;font-size:14px;font-weight:600;color:#111;white-space:nowrap">${money(line)}</td>
    </tr>`;
}

function receiptBlockHtml(order: OrderView, opts?: { forAdmin?: boolean }) {
  const url = absoluteImageUrl(order.receiptUrl);
  if (!url) return "";
  const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cloudinary");
  const label = opts?.forAdmin
    ? "Payment receipt uploaded by customer"
    : "Your payment receipt";
  return `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${BRAND.softBorder}">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${BRAND.primary};text-transform:uppercase;letter-spacing:0.04em">${label}</p>
      ${
        isImage
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block">
              <img src="${escapeHtml(url)}" alt="Payment receipt" width="280" style="display:block;max-width:100%;height:auto;border:1px solid ${BRAND.softBorder};border-radius:10px;background:#fff" />
            </a>`
          : ""
      }
      <p style="margin:10px 0 0;font-size:13px">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color:${BRAND.logo};font-weight:600">Open receipt</a>
      </p>
    </div>`;
}

type OrderEmailKind =
  | "placed_customer"
  | "placed_admin"
  | "paid_customer"
  | "paid_admin"
  | "status_customer";

function introCopy(kind: OrderEmailKind, order: OrderView, previousStatus?: string): string {
  const inv = escapeHtml(order.invoiceNumber || order.id);
  switch (kind) {
    case "placed_customer":
      return order.paymentMethod === "bank_transfer"
        ? `Thanks for your order <strong>${inv}</strong>. We received it and will confirm once your bank transfer receipt is verified.`
        : `Thanks for your order <strong>${inv}</strong>. We received it and will update you as it moves forward.`;
    case "placed_admin":
      return `A new order <strong>${inv}</strong> was placed and needs your attention.`;
    case "paid_customer":
      return `Great news. Payment for order <strong>${inv}</strong> has been confirmed. We are preparing your items for fulfilment.`;
    case "paid_admin":
      return `Payment for order <strong>${inv}</strong> has been approved.`;
    case "status_customer":
      return `Your order <strong>${inv}</strong> status changed from <em>${escapeHtml(statusLabel(previousStatus || ""))}</em> to <strong>${escapeHtml(statusLabel(order.status))}</strong>.`;
    default:
      return "";
  }
}

function buildOrderEmailHtml(opts: {
  order: OrderView;
  settings: SettingsView;
  kind: OrderEmailKind;
  previousStatus?: string;
}) {
  const { order, settings, kind, previousStatus } = opts;
  const storeName = settings.storeName?.trim() || env.zeptomailFromName || "Attog Store";
  const storeAddress = settings.storeAddress?.trim() || "";
  const storePhone = settings.storePhone?.trim() || "";
  const inv = order.invoiceNumber || order.id;
  const ship = order.shipping;
  const shippingFee = ship?.shippingFee ?? 0;
  const method = ship?.method;
  const forAdmin = kind === "placed_admin" || kind === "paid_admin";
  const showReceipt =
    Boolean(order.receiptUrl) &&
    (forAdmin ||
      order.paymentMethod === "bank_transfer" ||
      order.status === "pending_verification");

  const addr = addressLines(order);
  const phone = ship?.phone || "";
  const email = ship?.email || order.email || "";

  const title =
    kind === "placed_admin" || kind === "paid_admin"
      ? "ORDER SUMMARY"
      : "INVOICE";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(storeName)} ${escapeHtml(inv)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;color:#111">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    ${escapeHtml(storeName)} order ${escapeHtml(inv)} · ${money(order.total)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid ${BRAND.softBorder};border-radius:16px;overflow:hidden">
          <tr>
            <td style="height:6px;background:${BRAND.primary};font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:20px 24px 16px;background:${BRAND.soft};border-bottom:1px solid ${BRAND.softBorder}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:16px">${emailLogoHtml()}</td>
                  <td style="vertical-align:middle;text-align:right">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${BRAND.primary}">${escapeHtml(storeName)}</div>
                    ${storeAddress ? `<div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:#555">${escapeHtml(storeAddress)}</div>` : ""}
                    ${storePhone ? `<div style="margin-top:2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#555">${escapeHtml(storePhone)}</div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:${BRAND.logo}">${title}</p>
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${BRAND.primary}">${escapeHtml(inv)}</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#333">${introCopy(kind, order, previousStatus)}</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px">
                <tr>
                  <td style="width:50%;vertical-align:top;padding-right:10px">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:${BRAND.primary};text-transform:uppercase">${forAdmin ? "Customer" : "Bill to"}</p>
                    <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111">${escapeHtml(customerName(order))}</p>
                    ${addr.map((line) => `<p style="margin:0 0 2px;font-size:13px;color:#555;line-height:1.4">${escapeHtml(line)}</p>`).join("")}
                    ${email ? `<p style="margin:6px 0 0;font-size:13px;color:#555">${escapeHtml(email)}</p>` : ""}
                    ${phone ? `<p style="margin:2px 0 0;font-size:13px;color:#555">${escapeHtml(phone)}</p>` : ""}
                  </td>
                  <td style="width:50%;vertical-align:top;padding-left:10px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;color:#333">
                      <tr>
                        <td style="padding:3px 0;color:#777">Date</td>
                        <td style="padding:3px 0;text-align:right;font-weight:600">${escapeHtml(formatLongDate(order.createdAt))}</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;color:#777">Payment</td>
                        <td style="padding:3px 0;text-align:right;font-weight:600">${escapeHtml(paymentLabel(order.paymentMethod))}</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;color:#777">Status</td>
                        <td style="padding:3px 0;text-align:right;font-weight:600;text-transform:capitalize">${escapeHtml(statusLabel(order.status))}</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;color:#777">Delivery</td>
                        <td style="padding:3px 0;text-align:right;font-weight:600">${escapeHtml(shippingLabel(method))}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${BRAND.primary}">
                <thead>
                  <tr>
                    <th align="left" style="padding:10px 8px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};border-bottom:1px solid ${BRAND.softBorder}">Product</th>
                    <th align="center" style="padding:10px 8px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};border-bottom:1px solid ${BRAND.softBorder}">Qty</th>
                    <th align="right" style="padding:10px 8px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};border-bottom:1px solid ${BRAND.softBorder}">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(itemRowHtml).join("")}
                </tbody>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">
                <tr>
                  <td></td>
                  <td style="width:240px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px">
                      <tr>
                        <td style="padding:6px 0;color:#666">Subtotal</td>
                        <td style="padding:6px 0;text-align:right;font-weight:600">${money(order.subtotal)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666">Delivery (${escapeHtml(shippingLabel(method))})</td>
                        <td style="padding:6px 0;text-align:right;font-weight:600">${money(shippingFee)}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0 0;border-top:2px solid ${BRAND.primary};font-weight:700;color:${BRAND.primary}">Total</td>
                        <td style="padding:10px 0 0;border-top:2px solid ${BRAND.primary};text-align:right;font-weight:700;color:${BRAND.logo};font-size:16px">${money(order.total)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${
                order.customerNote
                  ? `<p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.soft};border:1px solid ${BRAND.softBorder};border-radius:10px;font-size:13px;color:#444;line-height:1.45"><strong style="color:${BRAND.primary}">Note:</strong> ${escapeHtml(order.customerNote)}</p>`
                  : ""
              }

              ${showReceipt ? receiptBlockHtml(order, { forAdmin }) : ""}

              <p style="margin:28px 0 0;font-size:12px;color:#888;line-height:1.5">
                This email is a copy of your order summary from ${escapeHtml(storeName)}.
                ${forAdmin ? "Open the admin app for full order actions." : "You can also view this order in your account order history."}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function zeptoEndpoint() {
  const host = env.zeptomailHost.replace(/^https?:\/\//, "");
  // CPaaS host from Zoho dashboard still uses the ZeptoMail email API path shape.
  if (host.includes("cpaas.zoho.com")) {
    return "https://api.zeptomail.com/v1.1/email";
  }
  if (host.includes("api.zeptomail.com")) {
    return "https://api.zeptomail.com/v1.1/email";
  }
  return `https://${host}/v1.1/email`;
}

async function sendMail(opts: { to: string; subject: string; html: string }) {
  const token = env.zeptomailToken.trim();
  if (!token) {
    console.log("[mail:dev]", {
      from: `${env.zeptomailFromName} <${env.zeptomailFromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      htmlBytes: opts.html.length,
      logoUrl: resolveEmailLogoUrl(),
    });
    return { queued: false, mode: "console" as const };
  }

  // Attach logo as ZeptoMail inline image (cid:attog-logo). Gmail blocks data: URIs
  // but shows CID inlines and remote https images (same as product photos).
  const logoBuf = readLogoPng();
  const inlineImages = logoBuf
    ? [
        {
          cid: LOGO_CID,
          name: "attog-logo.png",
          mime_type: "image/png",
          content: logoBuf.toString("base64"),
        },
      ]
    : undefined;

  const auth = token.startsWith("Zoho-") ? token : `Zoho-enczapikey ${token}`;
  const payload: Record<string, unknown> = {
    from: {
      address: env.zeptomailFromEmail,
      name: env.zeptomailFromName,
    },
    to: [{ email_address: { address: opts.to, name: opts.to } }],
    subject: opts.subject,
    htmlbody: opts.html,
  };
  if (inlineImages) payload.inline_images = inlineImages;

  const res = await fetch(zeptoEndpoint(), {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[mail:zepto-failed] ${res.status}`, body);
    // Keep local signup usable while ZeptoMail token/domain is fixed
    if (env.nodeEnv !== "production") {
      console.log("[mail:dev-fallback]", {
        from: `${env.zeptomailFromName} <${env.zeptomailFromEmail}>`,
        to: opts.to,
        subject: opts.subject,
        htmlBytes: opts.html.length,
      });
      return { queued: false, mode: "console" as const, error: body };
    }
    throw new Error(`ZeptoMail failed (${res.status}): ${body}`);
  }

  const okBody = await res.text();
  console.log("[mail:zepto-ok]", {
    to: opts.to,
    from: env.zeptomailFromEmail,
    status: res.status,
    body: okBody.slice(0, 500),
  });
  return { queued: true, mode: "zeptomail" as const };
}

export async function sendOrderPlacedEmails(order: OrderView) {
  const settings = await getStoreSettings();
  const store = settings.storeName || env.zeptomailFromName;
  const inv = order.invoiceNumber || order.id;

  await sendMail({
    to: order.email,
    subject: `${store}: order received (${inv})`,
    html: buildOrderEmailHtml({
      order,
      settings,
      kind: "placed_customer",
    }),
  });

  const adminTo = settings.adminNotifyEmail || env.adminEmail;
  if (adminTo) {
    await sendMail({
      to: adminTo,
      subject: `${store}: new order ${inv}`,
      html: buildOrderEmailHtml({
        order,
        settings,
        kind: "placed_admin",
      }),
    });
  }
}

export async function sendOrderStatusEmail(order: OrderView, previousStatus: string) {
  if (previousStatus === order.status) return;
  const settings = await getStoreSettings();
  const store = settings.storeName || env.zeptomailFromName;
  const inv = order.invoiceNumber || order.id;
  const paid = order.status === "paid";

  if (paid) {
    await sendMail({
      to: order.email,
      subject: `${store}: payment confirmed for order ${inv}`,
      html: buildOrderEmailHtml({
        order,
        settings,
        kind: "paid_customer",
        previousStatus,
      }),
    });

    const adminTo = settings.adminNotifyEmail || env.adminEmail;
    if (adminTo) {
      await sendMail({
        to: adminTo,
        subject: `${store}: payment approved ${inv}`,
        html: buildOrderEmailHtml({
          order,
          settings,
          kind: "paid_admin",
          previousStatus,
        }),
      });
    }
    return;
  }

  await sendMail({
    to: order.email,
    subject: `${store}: order ${inv} is now ${statusLabel(order.status)}`,
    html: buildOrderEmailHtml({
      order,
      settings,
      kind: "status_customer",
      previousStatus,
    }),
  });
}

export async function sendAdminInviteEmail(opts: {
  to: string;
  name: string;
  tempPassword: string;
  invitedBy: string;
}) {
  const settings = await getStoreSettings();
  const store = settings.storeName || env.zeptomailFromName;
  const adminUrl = env.adminAppUrl || "http://localhost:3001";

  return sendMail({
    to: opts.to,
    subject: `${store}: you have been invited as an admin`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111;line-height:1.5">
        <div style="margin:0 0 16px">${emailLogoHtml()}</div>
        <h2 style="margin:0 0 12px;color:${BRAND.primary}">${escapeHtml(store)} Admin</h2>
        <p>Hi ${escapeHtml(opts.name)},</p>
        <p><strong>${escapeHtml(opts.invitedBy)}</strong> invited you to manage ${escapeHtml(store)}.</p>
        <p>Sign in with:</p>
        <p style="margin:12px 0"><strong>Email:</strong> ${escapeHtml(opts.to)}<br/><strong>Temporary password:</strong> <code style="font-size:16px;letter-spacing:1px">${escapeHtml(opts.tempPassword)}</code></p>
        <p><a href="${escapeHtml(adminUrl)}/login" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px">Open admin login</a></p>
        <p style="color:#666;font-size:13px">Please change your password after signing in.</p>
      </div>
    `,
  });
}

export async function sendOtpEmail(opts: {
  to: string;
  code: string;
  purpose?: "signup" | "reset";
}) {
  const settings = await getStoreSettings();
  const store = settings.storeName || env.zeptomailFromName;
  const purposeLabel = opts.purpose === "reset" ? "password reset" : "sign up";

  return sendMail({
    to: opts.to,
    subject: `${store}: your verification code is ${opts.code}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;line-height:1.5">
        <div style="margin:0 0 16px">${emailLogoHtml()}</div>
        <h2 style="margin:0 0 12px;color:${BRAND.primary}">${escapeHtml(store)}</h2>
        <p style="margin:0 0 16px">Use this code to continue your ${purposeLabel}:</p>
        <p style="margin:0 0 20px;font-size:32px;letter-spacing:8px;font-weight:700;color:${BRAND.logo}">${escapeHtml(opts.code)}</p>
        <p style="margin:0 0 8px;color:#555;font-size:14px">This code expires in 10 minutes.</p>
        <p style="margin:0;color:#888;font-size:13px">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}
