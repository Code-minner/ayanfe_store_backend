import { env } from "../config/env.js";
import { getStoreSettings } from "./settings.js";
import type { OrderView } from "../types/order.js";

function money(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function itemsHtml(order: OrderView) {
  return order.items
    .map(
      (i) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.name} × ${i.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(i.price * i.quantity)}</td></tr>`
    )
    .join("");
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
      ...opts,
    });
    return { queued: false, mode: "console" as const };
  }

  const auth = token.startsWith("Zoho-") ? token : `Zoho-enczapikey ${token}`;
  const res = await fetch(zeptoEndpoint(), {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: {
        address: env.zeptomailFromEmail,
        name: env.zeptomailFromName,
      },
      to: [{ email_address: { address: opts.to, name: opts.to } }],
      subject: opts.subject,
      htmlbody: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[mail:zepto-failed] ${res.status}`, body);
    // Keep local signup usable while ZeptoMail token/domain is fixed
    if (env.nodeEnv !== "production") {
      console.log("[mail:dev-fallback]", {
        from: `${env.zeptomailFromName} <${env.zeptomailFromEmail}>`,
        ...opts,
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
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 8px">${store}</h2>
        <p>Thanks for your order. We’ve received it and will update you shortly.</p>
        <p><strong>Order / Invoice:</strong> ${inv}</p>
        <p><strong>Payment:</strong> ${order.paymentMethod.replace("_", " ")} · <strong>Status:</strong> ${order.status}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml(order)}</table>
        <p style="text-align:right"><strong>Total: ${money(order.total)}</strong></p>
        <p style="color:#666;font-size:13px">If you paid by bank transfer, we’ll confirm once your receipt is verified.</p>
      </div>
    `,
  });

  const adminTo = settings.adminNotifyEmail || env.adminEmail;
  if (adminTo) {
    await sendMail({
      to: adminTo,
      subject: `${store}: new order ${inv}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h2 style="margin:0 0 8px">New order — ${inv}</h2>
          <p><strong>Customer:</strong> ${order.email}</p>
          <p><strong>Payment:</strong> ${order.paymentMethod} · <strong>Status:</strong> ${order.status}</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml(order)}</table>
          <p style="text-align:right"><strong>Total: ${money(order.total)}</strong></p>
          ${order.receiptUrl ? `<p>Receipt: ${order.receiptUrl}</p>` : ""}
        </div>
      `,
    });
  }
}

export async function sendOrderStatusEmail(order: OrderView, previousStatus: string) {
  if (previousStatus === order.status) return;
  const settings = await getStoreSettings();
  const store = settings.storeName || env.zeptomailFromName;
  const inv = order.invoiceNumber || order.id;
  const ship = order.shipping;
  const paid = order.status === "paid";

  if (paid) {
    await sendMail({
      to: order.email,
      subject: `${store}: payment confirmed for order ${inv}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111;line-height:1.5">
          <h2 style="margin:0 0 8px;color:#4B0A6B">${store}</h2>
          <p>Great news. Your payment for order <strong>${inv}</strong> has been confirmed.</p>
          <p>We are preparing your items for fulfilment.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml(order)}</table>
          <p style="text-align:right;margin:0"><strong>Total paid: ${money(order.total)}</strong></p>
          ${
            ship?.fullName || ship?.address
              ? `<p style="margin-top:16px;color:#555;font-size:14px"><strong>Delivery:</strong> ${[
                  ship.fullName,
                  ship.phone,
                  ship.address,
                  ship.city,
                  ship.state,
                ]
                  .filter(Boolean)
                  .join(", ")}</p>`
              : ""
          }
          <p style="margin-top:20px;color:#666;font-size:13px">You can track this order anytime in your account order history.</p>
        </div>
      `,
    });

    const adminTo = settings.adminNotifyEmail || env.adminEmail;
    if (adminTo) {
      await sendMail({
        to: adminTo,
        subject: `${store}: payment approved ${inv}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <h2 style="margin:0 0 8px">Payment approved — ${inv}</h2>
            <p><strong>Customer:</strong> ${order.email}${ship?.fullName ? ` (${ship.fullName})` : ""}</p>
            <p><strong>Method:</strong> ${order.paymentMethod.replace("_", " ")}</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml(order)}</table>
            <p style="text-align:right"><strong>Total: ${money(order.total)}</strong></p>
          </div>
        `,
      });
    }
    return;
  }

  await sendMail({
    to: order.email,
    subject: `${store}: order ${inv} is now ${order.status.replace(/_/g, " ")}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="color:#4B0A6B">${store}</h2>
        <p>Your order <strong>${inv}</strong> status changed from <em>${previousStatus.replace(/_/g, " ")}</em> to <strong>${order.status.replace(/_/g, " ")}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemsHtml(order)}</table>
        <p style="text-align:right"><strong>Total: ${money(order.total)}</strong></p>
      </div>
    `,
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
  const adminUrl = process.env.ADMIN_APP_URL || "http://localhost:3001";

  return sendMail({
    to: opts.to,
    subject: `${store}: you have been invited as an admin`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111;line-height:1.5">
        <h2 style="margin:0 0 12px;color:#4B0A6B">${store} Admin</h2>
        <p>Hi ${opts.name},</p>
        <p><strong>${opts.invitedBy}</strong> invited you to manage ${store}.</p>
        <p>Sign in with:</p>
        <p style="margin:12px 0"><strong>Email:</strong> ${opts.to}<br/><strong>Temporary password:</strong> <code style="font-size:16px;letter-spacing:1px">${opts.tempPassword}</code></p>
        <p><a href="${adminUrl}/login" style="display:inline-block;background:#4B0A6B;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px">Open admin login</a></p>
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
        <h2 style="margin:0 0 12px;color:#4B0A6B">${store}</h2>
        <p style="margin:0 0 16px">Use this code to continue your ${purposeLabel}:</p>
        <p style="margin:0 0 20px;font-size:32px;letter-spacing:8px;font-weight:700;color:#4B0A6B">${opts.code}</p>
        <p style="margin:0 0 8px;color:#555;font-size:14px">This code expires in 10 minutes.</p>
        <p style="margin:0;color:#888;font-size:13px">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}
