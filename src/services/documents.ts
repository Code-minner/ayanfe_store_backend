import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderItem, OrderView, SettingsView } from "../types/order.js";
import { shippingLabel, STOCKPILE_DISCLAIMER } from "./shippingFees.js";

const DEFAULT_STORE_NAME = "Ayanfe T.T.O Gracious";
const DEFAULT_STORE_ADDRESS =
  "4b Fadipe street, (by Phidel Group of Schools, Seliat branch) 3rd building before Green Field hotel, seliat bus stop, Egbeda, Lagos.";

function money(n: number) {
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function formatLongDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Prefer PNG asset; fall back to inline SVG mark so print always has a logo. */
function logoHtml() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pngPath = join(here, "../../assets/attog-logo.png");
    const buf = readFileSync(pngPath);
    const src = `data:image/png;base64,${buf.toString("base64")}`;
    return `<img class="logo" src="${src}" alt="Attog Store" width="180" height="40" />`;
  } catch {
    return `<svg class="logo" viewBox="0 0 218 40" xmlns="http://www.w3.org/2000/svg" aria-label="Attog Store">
      <path d="M19.9273 0H33.2121L49.8182 39.8784H35.1247L33.9909 36.8748H24.4052L27.1881 26.9691H30.2803L19.9273 0ZM18.2208 39.8784H0L16.6061 0L23.3745 22.5594L18.2208 39.8784Z" fill="#8400A8"/>
      <path d="M59.8182 34.4107L62.6133 5.47284H72.4291L75.175 34.4107H69.6998L69.2887 29.7412H65.803L65.4413 34.4107H59.8182ZM66.2141 25.121H68.8448L67.5788 10.4054H67.3157L66.2141 25.121Z" fill="#8400A8"/>
      <path d="M79.0059 34.4107V11.0302H75.5695V5.47284H88.2298V11.0302H84.7934V34.4107H79.0059Z" fill="#8400A8"/>
      <path d="M92.3239 34.4107V11.0302H88.8875V5.47284H101.548V11.0302H98.1114V34.4107H92.3239Z" fill="#8400A8"/>
      <path d="M110.065 34.6712C107.752 34.6712 105.982 33.9752 104.754 32.5831C103.537 31.18 102.929 29.1577 102.929 26.516V12.7705C102.929 10.2933 103.532 8.4134 104.738 7.13092C105.954 5.84845 107.73 5.20721 110.065 5.20721C112.4 5.20721 114.17 5.84845 115.376 7.13092C116.592 8.4134 117.201 10.2933 117.201 12.7705V26.516C117.201 29.1577 116.587 31.18 115.359 32.5831C114.142 33.9752 112.378 34.6712 110.065 34.6712ZM110.114 29.344C110.991 29.344 111.43 28.4945 111.43 26.7955V12.6719C111.43 11.2469 111.002 10.5344 110.147 10.5344C109.182 10.5344 108.7 11.2633 108.7 12.7212V26.8284C108.7 27.7272 108.81 28.3739 109.029 28.7685C109.248 29.1522 109.61 29.344 110.114 29.344Z" fill="#8400A8"/>
      <path d="M125.504 34.6712C121.371 34.6712 119.305 31.7117 119.305 25.7925V13.3131C119.305 7.90918 121.673 5.20721 126.408 5.20721C128.359 5.20721 129.855 5.60182 130.897 6.39104C131.938 7.16929 132.656 8.30926 133.051 9.81096C133.445 11.3127 133.642 13.1432 133.642 15.3026H127.986V12.7376C127.986 12.1128 127.899 11.5922 127.723 11.1756C127.559 10.7482 127.208 10.5344 126.671 10.5344C126.002 10.5344 125.559 10.7591 125.339 11.2085C125.131 11.6579 125.027 12.1512 125.027 12.6883V26.7133C125.027 27.4916 125.126 28.1273 125.323 28.6206C125.531 29.1029 125.931 29.344 126.523 29.344C127.137 29.344 127.543 29.1029 127.74 28.6206C127.948 28.1273 128.052 27.4806 128.052 26.6804V22.5535H126.507V17.5551H133.577V34.4081H131.258L130.272 31.9747C129.263 33.7724 127.674 34.6712 125.504 34.6712Z" fill="#8400A8"/>
      <path d="M150.644 34.6712C148.002 34.6712 146.095 34.0135 144.922 32.6982C143.76 31.3828 143.179 29.2892 143.179 26.4173V23.5893H148.901V27.2066C148.901 27.8752 148.999 28.4013 149.197 28.785C149.405 29.1577 149.761 29.344 150.265 29.344C150.792 29.344 151.153 29.1906 151.351 28.8836C151.559 28.5767 151.663 28.0725 151.663 27.371C151.663 26.4831 151.575 25.7432 151.4 25.1513C151.224 24.5484 150.918 23.9784 150.479 23.4413C150.052 22.8933 149.454 22.2575 148.687 21.5341L146.089 19.0678C144.149 17.2372 143.179 15.1436 143.179 12.787C143.179 10.3207 143.749 8.4408 144.889 7.14737C146.04 5.85393 147.7 5.20721 149.871 5.20721C152.523 5.20721 154.403 5.91422 155.51 7.32823C156.628 8.74224 157.187 10.8907 157.187 13.7735H151.301V11.784C151.301 11.3894 151.186 11.0825 150.956 10.8633C150.737 10.644 150.435 10.5344 150.052 10.5344C149.591 10.5344 149.251 10.6659 149.032 10.929C148.824 11.1811 148.72 11.51 148.72 11.9155C148.72 12.3211 148.829 12.7596 149.049 13.2309C149.268 13.7022 149.701 14.2448 150.348 14.8586L153.685 18.0648C154.354 18.7006 154.968 19.3747 155.527 20.0872C156.086 20.7887 156.535 21.6108 156.875 22.5535C157.215 23.4852 157.385 24.6252 157.385 25.9734C157.385 28.6918 156.881 30.8238 155.872 32.3693C154.875 33.9039 153.132 34.6712 150.644 34.6712Z" fill="#8400A8"/>
      <path d="M161.808 34.4107V11.0302H158.371V5.47284H171.032V11.0302H167.595V34.4107H161.808Z" fill="#8400A8"/>
      <path d="M179.548 34.6712C177.236 34.6712 175.465 33.9752 174.238 32.5831C173.021 31.18 172.413 29.1577 172.413 26.516V12.7705C172.413 10.2933 173.016 8.4134 174.221 7.13092C175.438 5.84845 177.214 5.20721 179.548 5.20721C181.883 5.20721 183.653 5.84845 184.859 7.13092C186.076 8.4134 186.684 10.2933 186.684 12.7705V26.516C186.684 29.1577 186.07 31.18 184.843 32.5831C183.626 33.9752 181.861 34.6712 179.548 34.6712ZM179.598 29.344C180.475 29.344 180.913 28.4945 180.913 26.7955V12.6719C180.913 11.2469 180.486 10.5344 179.631 10.5344C178.666 10.5344 178.184 11.2633 178.184 12.7212V26.8284C178.184 27.7272 178.293 28.3739 178.513 28.7685C178.732 29.1522 179.094 29.344 179.598 29.344Z" fill="#8400A8"/>
      <path d="M189.019 34.4107V5.47284H197.898C199.378 5.47284 200.496 5.81264 201.252 6.49224C202.008 7.16088 202.512 8.10355 202.765 9.32026C203.028 10.526 203.159 11.9455 203.159 13.5787C203.159 15.1572 202.956 16.4177 202.551 17.3604C202.156 18.303 201.405 18.9552 200.298 19.317C201.208 19.5033 201.844 19.9582 202.206 20.6817C202.578 21.3941 202.765 22.3204 202.765 23.4603V34.4107H197.059V23.0822C197.059 22.2382 196.884 21.7175 196.533 21.5202C196.193 21.3119 195.64 21.2078 194.872 21.2078V34.4107H189.019ZM194.905 16.193H196.303C197.103 16.193 197.503 15.3216 197.503 13.5787C197.503 12.4497 197.415 11.7098 197.24 11.3591C197.065 11.0083 196.736 10.8329 196.254 10.8329H194.905V16.193Z" fill="#8400A8"/>
      <path d="M205.066 34.4107V5.47284H216.642V11.0631H210.953V16.7027H216.411V22.145H210.953V28.7711H217.02V34.4107H205.066Z" fill="#8400A8"/>
    </svg>`;
  }
}

function storeIdentity(settings: SettingsView) {
  const name = settings.storeName?.trim() || DEFAULT_STORE_NAME;
  const address = settings.storeAddress?.trim() || DEFAULT_STORE_ADDRESS;
  const phone = settings.storePhone?.trim() || "";
  return { name, address, phone };
}

function productCell(item: OrderItem) {
  const titleBits = [item.color, item.size].filter(Boolean) as string[];
  const titleSuffix = titleBits.length ? ` - ${titleBits.join(", ")}` : "";
  const lines: string[] = [
    `<div class="pname">${escapeHtml(item.name)}${escapeHtml(titleSuffix)}</div>`,
  ];
  if (item.color) {
    lines.push(`<div class="psub">Color: ${escapeHtml(item.color)}</div>`);
  }
  if (item.size) {
    lines.push(`<div class="psub">Size: ${escapeHtml(item.size)}</div>`);
  }
  if (item.brand) {
    lines.push(`<div class="psub">Brand: ${escapeHtml(item.brand)}</div>`);
  }
  return lines.join("");
}

function customerBlock(order: OrderView) {
  const s = order.shipping;
  const name =
    s?.fullName ||
    [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim() ||
    "Customer";
  const addressParts = [s?.address, s?.city, s?.state, s?.country].filter(Boolean);
  const email = s?.email || order.email || "";
  const phone = s?.phone || "";

  return `
    <p class="cust-name">${escapeHtml(name)}</p>
    ${
      addressParts.length
        ? `<p class="cust-line">${escapeHtml(addressParts.join(", "))}</p>`
        : ""
    }
    ${email ? `<p class="cust-line">${escapeHtml(email)}</p>` : ""}
    ${phone ? `<p class="cust-line">${escapeHtml(phone)}</p>` : ""}
  `;
}

function invoicePage(order: OrderView, settings: SettingsView) {
  const inv = order.invoiceNumber || order.id;
  const method = order.shipping?.method;
  const shippingFee = order.shipping?.shippingFee ?? 0;
  const dateStr = formatLongDate(order.createdAt);
  const store = storeIdentity(settings);

  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td>${productCell(i)}</td>
        <td class="num">${i.quantity}</td>
        <td class="num">${money(i.price)}</td>
      </tr>`
    )
    .join("");

  const stockpileNote =
    method === "stockpile"
      ? `<p class="disclaimer"><strong>Stockpile:</strong> ${escapeHtml(STOCKPILE_DISCLAIMER)}</p>`
      : "";
  const lagosNote =
    method === "lagos_delivery"
      ? `<p class="disclaimer"><strong>Lagos delivery:</strong> Our rider will contact you for charges. Base fee ${money(50)}.</p>`
      : "";

  return `
  <section class="sheet">
    <header class="masthead">
      <div class="mast-left">${logoHtml()}</div>
      <div class="mast-right">
        <p class="store-name">${escapeHtml(store.name)}</p>
        <p class="store-address">${escapeHtml(store.address)}</p>
        ${store.phone ? `<p class="store-address">${escapeHtml(store.phone)}</p>` : ""}
      </div>
    </header>

    <h1 class="doc-title">INVOICE</h1>

    <div class="meta-row">
      <div class="bill-to">${customerBlock(order)}</div>
      <table class="meta">
        <tr><td>Invoice Number</td><td>${escapeHtml(inv)}</td></tr>
        <tr><td>Invoice Date</td><td>${escapeHtml(dateStr)}</td></tr>
        <tr><td>Order Number</td><td>${escapeHtml(inv)}</td></tr>
        <tr><td>Order Date</td><td>${escapeHtml(dateStr)}</td></tr>
        <tr><td>Payment Method</td><td>${escapeHtml(paymentLabel(order.paymentMethod))}</td></tr>
      </table>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Product</th>
          <th class="num">Quantity</th>
          <th class="num">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="tot-line"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      <div class="tot-line"><span>Delivery (${escapeHtml(shippingLabel(method))})</span><span>${money(shippingFee)}</span></div>
      <div class="tot-line grand"><span>Total</span><span>${money(order.total)}</span></div>
    </div>

    ${order.customerNote ? `<p class="note"><strong>Note:</strong> ${escapeHtml(order.customerNote)}</p>` : ""}
    ${stockpileNote}
    ${lagosNote}
  </section>`;
}

function waybillPage(order: OrderView, settings: SettingsView) {
  const wb = order.waybillNumber || order.invoiceNumber || order.id;
  const store = storeIdentity(settings);
  const itemSummary = order.items
    .map((i) => {
      const bits = [i.color, i.size].filter(Boolean).join(", ");
      return `${i.quantity}x ${i.name}${bits ? ` (${bits})` : ""}`;
    })
    .join(", ");

  return `
  <section class="sheet waybill">
    <header class="masthead">
      <div class="mast-left">${logoHtml()}</div>
      <div class="mast-right">
        <p class="store-name">${escapeHtml(store.name)}</p>
        <p class="store-address">${escapeHtml(store.address)}</p>
      </div>
    </header>
    <h1 class="doc-title">WAYBILL</h1>
    <p class="wb-id">${escapeHtml(wb)} &nbsp;|&nbsp; Invoice ${escapeHtml(order.invoiceNumber || order.id)}</p>
    <div class="meta-row">
      <div class="bill-to">
        <p class="section-label">From</p>
        <p class="cust-name">${escapeHtml(store.name)}</p>
        <p class="cust-line">${escapeHtml(store.address)}</p>
        ${store.phone ? `<p class="cust-line">${escapeHtml(store.phone)}</p>` : ""}
      </div>
      <div class="bill-to">
        <p class="section-label">Ship to</p>
        ${customerBlock(order)}
      </div>
    </div>
    <div class="contents">
      <p class="section-label">Contents</p>
      <p class="cust-line">${escapeHtml(itemSummary)}</p>
      <p class="cust-line"><strong>Packages:</strong> 1 &nbsp;&nbsp; <strong>Order total:</strong> ${money(order.total)}</p>
    </div>
    <div class="sign">
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
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      margin: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 2;
      background: #111; color: #fff;
      padding: 12px 16px;
      display: flex; gap: 12px; align-items: center;
    }
    .toolbar button {
      border: 0; background: #fff; color: #111;
      padding: 8px 14px; border-radius: 6px;
      cursor: pointer; font-weight: 600;
    }
    .wrap { padding: 0; }
    .sheet {
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 36px 40px 48px;
      border: 0;
      box-shadow: none;
    }
    .masthead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 32px;
    }
    .logo { display: block; height: 40px; width: auto; max-width: 200px; }
    .mast-right { text-align: right; max-width: 340px; }
    .store-name {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 700;
      color: #111;
    }
    .store-address {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      color: #333;
    }
    .doc-title {
      margin: 28px 0 20px;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 40px;
      align-items: flex-start;
      margin-bottom: 28px;
    }
    .bill-to { flex: 1; min-width: 0; }
    .cust-name { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
    .cust-line { margin: 0 0 3px; font-size: 13px; line-height: 1.4; color: #222; }
    .meta {
      border-collapse: collapse;
      font-size: 13px;
      flex-shrink: 0;
    }
    .meta td { padding: 3px 0 3px 16px; vertical-align: top; }
    .meta td:first-child {
      color: #555;
      padding-left: 0;
      text-align: right;
      white-space: nowrap;
    }
    .meta td:last-child { font-weight: 600; text-align: left; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    table.items th {
      background: #000;
      color: #fff;
      text-align: left;
      padding: 11px 14px;
      font-size: 13px;
      font-weight: 600;
      border: 0;
    }
    table.items th.num,
    table.items td.num { text-align: right; white-space: nowrap; }
    table.items td {
      padding: 14px;
      border-bottom: 1px solid #ddd;
      font-size: 14px;
      vertical-align: top;
    }
    .pname { font-weight: 600; }
    .psub { margin-top: 3px; font-size: 12px; color: #444; font-weight: 400; }
    .totals {
      margin-top: 20px;
      margin-left: auto;
      width: 280px;
      font-size: 14px;
    }
    .tot-line {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin: 6px 0;
    }
    .grand {
      font-size: 16px;
      font-weight: 700;
      border-top: 1px solid #111;
      padding-top: 8px;
      margin-top: 10px;
    }
    .note, .disclaimer { margin-top: 18px; font-size: 13px; line-height: 1.45; }
    .disclaimer { color: #444; }
    .section-label {
      margin: 0 0 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #666;
      font-weight: 700;
    }
    .wb-id { margin: -8px 0 20px; font-size: 13px; color: #444; }
    .contents { margin-top: 8px; padding-top: 16px; border-top: 1px solid #ddd; }
    .sign { margin-top: 48px; display: flex; gap: 48px; font-size: 14px; }
    .break { page-break-after: always; height: 0; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .wrap { padding: 0; }
      .sheet { padding: 16px 20px; max-width: none; box-shadow: none; border: 0; }
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
