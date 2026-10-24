import type { OrderView, SettingsView } from "../types/order.js";

function money(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shipBlock(order: OrderView) {
  const s = order.shipping;
  if (!s?.fullName && !s?.address) {
    return `<p class="muted">No shipping details on file.</p>`;
  }
  return `
    <p><strong>${escapeHtml(s.fullName || "—")}</strong><br/>
    ${escapeHtml(s.phone || "")}<br/>
    ${escapeHtml(s.address || "")}<br/>
    ${escapeHtml([s.city, s.state, s.country].filter(Boolean).join(", "))}</p>
  `;
}

function invoicePage(order: OrderView, settings: SettingsView) {
  const inv = order.invoiceNumber || order.id;
  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.name)}${i.color ? ` <span class="muted">(${escapeHtml(i.color)})</span>` : ""}</td>
        <td class="num">${i.quantity}</td>
        <td class="num">${money(i.price)}</td>
        <td class="num">${money(i.price * i.quantity)}</td>
      </tr>`
    )
    .join("");

  return `
  <section class="sheet">
    <header class="row">
      <div>
        <h1>${escapeHtml(settings.storeName || "Attog Store")}</h1>
        <p class="muted">${escapeHtml(settings.storeAddress || "")}<br/>${escapeHtml(settings.storePhone || "")}</p>
      </div>
      <div class="right">
        <h2>INVOICE</h2>
        <p><strong>${escapeHtml(inv)}</strong></p>
        <p class="muted">${new Date(order.createdAt).toLocaleString("en-NG")}</p>
      </div>
    </header>
    <div class="row block">
      <div>
        <h3>Bill to</h3>
        <p>${escapeHtml(order.email)}</p>
        ${shipBlock(order)}
      </div>
      <div class="right">
        <p>Payment: <strong>${escapeHtml(order.paymentMethod.replace("_", " "))}</strong></p>
        <p>Status: <strong>${escapeHtml(order.status.replace("_", " "))}</strong></p>
      </div>
    </div>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <p>Subtotal <span>${money(order.subtotal)}</span></p>
      <p>Fee <span>${money(order.fee)}</span></p>
      <p class="grand">Total <span>${money(order.total)}</span></p>
    </div>
    ${order.customerNote ? `<p class="note"><strong>Note:</strong> ${escapeHtml(order.customerNote)}</p>` : ""}
  </section>`;
}

function waybillPage(order: OrderView, settings: SettingsView) {
  const wb = order.waybillNumber || order.invoiceNumber || order.id;
  const itemSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ");

  return `
  <section class="sheet waybill">
    <header class="row">
      <div>
        <h1>${escapeHtml(settings.storeName || "Attog Store")}</h1>
        <p class="muted">WAYBILL</p>
      </div>
      <div class="right">
        <h2>${escapeHtml(wb)}</h2>
        <p class="muted">${new Date(order.createdAt).toLocaleDateString("en-NG")}</p>
      </div>
    </header>
    <div class="grid2">
      <div class="box">
        <h3>From</h3>
        <p><strong>${escapeHtml(settings.storeName || "Attog Store")}</strong><br/>
        ${escapeHtml(settings.storeAddress || "")}<br/>
        ${escapeHtml(settings.storePhone || "")}</p>
      </div>
      <div class="box">
        <h3>Ship to</h3>
        ${shipBlock(order)}
        <p class="muted">${escapeHtml(order.email)}</p>
      </div>
    </div>
    <div class="box">
      <h3>Contents</h3>
      <p>${escapeHtml(itemSummary)}</p>
      <p><strong>Packages:</strong> 1 &nbsp;·&nbsp; <strong>Order total:</strong> ${money(order.total)}</p>
    </div>
    <div class="sign row">
      <p>Sender sign: ________________</p>
      <p>Receiver sign: ________________</p>
    </div>
  </section>`;
}

export function renderPrintDocument(
  orders: OrderView[],
  settings: SettingsView,
  type: "invoice" | "waybill"
) {
  const pages = orders
    .map((o) => (type === "waybill" ? waybillPage(o, settings) : invoicePage(o, settings)))
    .join('<div class="break"></div>');

  const title = type === "waybill" ? "Waybills" : "Invoices";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Attog ${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 0; background: #f4f4f4; }
    .toolbar { position: sticky; top: 0; background: #111; color: #fff; padding: 12px 16px; display: flex; gap: 12px; align-items: center; font-family: system-ui, sans-serif; }
    .toolbar button { border: 0; background: #fff; color: #111; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    .wrap { padding: 24px; }
    .sheet { background: #fff; max-width: 800px; margin: 0 auto 24px; padding: 32px; border: 1px solid #ddd; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 0; letter-spacing: 0.04em; }
    h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; color: #555; }
    .muted { color: #666; font-size: 13px; }
    .row { display: flex; justify-content: space-between; gap: 24px; }
    .right { text-align: right; }
    .block { margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #e5e5e5; font-size: 14px; text-align: left; }
    th { font-size: 12px; text-transform: uppercase; color: #555; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 16px; margin-left: auto; width: 240px; font-size: 14px; }
    .totals p { display: flex; justify-content: space-between; margin: 6px 0; }
    .grand { font-size: 16px; font-weight: 700; border-top: 2px solid #111; padding-top: 8px; }
    .note { margin-top: 20px; font-size: 13px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
    .box { border: 1px solid #ddd; padding: 14px; min-height: 120px; }
    .sign { margin-top: 40px; font-size: 14px; }
    .break { page-break-after: always; height: 0; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .wrap { padding: 0; }
      .sheet { border: 0; margin: 0; max-width: none; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>${orders.length} ${title.toLowerCase()}</strong>
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <div class="wrap">${pages}</div>
</body>
</html>`;
}

export function makeDocNumber(prefix: string) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}
