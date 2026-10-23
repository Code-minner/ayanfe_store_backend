/**
 * Import scraped WooCommerce products into Neon.
 *
 * Usage:
 *   npx tsx src/import-scraped-products.ts --dry-run
 *   npx tsx src/import-scraped-products.ts
 *
 * Safe: upserts by slug, never deletes users/orders/settings.
 * Deactivates placeholder "Wally" seed products after a successful write.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./db.js";
import {
  isCloudinaryConfigured,
  uploadProductImageFromUrl,
} from "./services/cloudinary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSON_PATH = resolve(ROOT, "ayanfet_products.json");

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_IMAGES = process.argv.includes("--skip-images");
const IMAGES_ONLY = process.argv.includes("--images-only");
const CONCURRENCY = 5;

function formatErr(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const o = err as { error?: { message?: string }; message?: string };
    return o.error?.message || o.message || JSON.stringify(err);
  }
  return String(err);
}

type ScrapedAttr = { name: string; options: string[] };
type ScrapedVariation = {
  id: number;
  price?: number | null;
  regular_price?: number | null;
  sale_price?: number | null;
  in_stock?: boolean;
  low_stock_remaining?: number | null;
  images?: string[];
};
type ScrapedProduct = {
  id: number;
  name: string;
  url: string;
  sku?: string;
  type?: string;
  price?: number | null;
  regular_price?: number | null;
  sale_price?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  on_sale?: boolean;
  in_stock?: boolean;
  categories?: string[];
  short_description?: string;
  description?: string;
  images?: string[];
  attributes?: ScrapedAttr[];
  variations?: ScrapedVariation[];
};

const CATEGORIES = [
  {
    slug: "ladies",
    name: "Ladies' footwears",
    description: "Discover stylish footwear for every occasion.",
    heroImage: "/assets/ladies.jpg",
    icon: "/assets/Featured1.png",
  },
  {
    slug: "men",
    name: "Men's footwears",
    description: "Discover stylish footwear for every occasion.",
    heroImage: "/assets/men.png",
    icon: "/assets/Featured2.png",
  },
  {
    slug: "unisex",
    name: "Unisex footwears -sneakers",
    description: "Shared styles that work for everyone.",
    heroImage: "/assets/unisex.png",
    icon: "/assets/Featured3.png",
  },
  {
    slug: "kids",
    name: "Kids' footwears",
    description: "Comfortable shoes made for little explorers.",
    heroImage: "/assets/kids.png",
    icon: "/assets/Featured4.png",
  },
  {
    slug: "clothing",
    name: "Clothing/materials",
    description: "Fabrics and ready-to-wear pieces for every day.",
    heroImage: "/assets/clothing.png",
    icon: "/assets/Featured5.png",
  },
  {
    slug: "household",
    name: "House hold",
    description: "Useful finds for home and living.",
    heroImage: "/assets/hero8.png",
    icon: "/assets/Featured6.png",
  },
  {
    slug: "gadgets",
    name: "Gadgets",
    description: "Everyday tech and accessories.",
    heroImage: "/assets/gadgets.png",
    icon: "/assets/Featured7.png",
  },
  {
    slug: "personal-care",
    name: "Personal care",
    description: "Care essentials for your routine.",
    heroImage: "/assets/personal.png",
    icon: "/assets/Featured8.png",
  },
  {
    slug: "souvenirs",
    name: "Souvenirs",
    description: "Thoughtful gifts and keepsakes.",
    heroImage: "/assets/souvenirs.png",
    icon: "/assets/Featured9.png",
  },
] as const;

const CATEGORY_MAP: Record<string, string> = {
  "men's footwear": "men",
  "ladies footwear": "ladies",
  "household items": "household",
  gadgets: "gadgets",
  essentials: "personal-care",
};

const COLOR_HEX: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  brown: "#8B4513",
  "coffee-brown": "#6F4E37",
  coffee: "#6F4E37",
  ash: "#B2BEB5",
  grey: "#808080",
  gray: "#808080",
  red: "#C41E3A",
  blue: "#1E3A8A",
  navy: "#000080",
  green: "#228B22",
  pink: "#FFC0CB",
  gold: "#D4AF37",
  silver: "#C0C0C0",
  beige: "#F5F5DC",
  cream: "#FFFDD0",
  nude: "#E3BC9A",
  yellow: "#FFD700",
  orange: "#FF8C00",
  purple: "#6B3FA0",
  wine: "#722F37",
  burgundy: "#800020",
  tan: "#D2B48C",
  khaki: "#C3B091",
  multi: "#888888",
  multicolor: "#888888",
};

function slugFromUrl(url: string): string {
  const m = url.match(/\/product\/([^/?#]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]).replace(/\/+$/, "").toLowerCase();
  return "";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickPrice(p: ScrapedProduct): {
  price: number;
  originalPrice?: number;
  discountPercent?: number;
} {
  const variationPrices = (p.variations ?? [])
    .map((v) => num(v.sale_price) ?? num(v.price) ?? num(v.regular_price))
    .filter((n): n is number => n !== null);

  const price =
    num(p.sale_price) ??
    num(p.price) ??
    num(p.regular_price) ??
    num(p.price_min) ??
    (variationPrices.length ? Math.min(...variationPrices) : 0);

  const regular =
    num(p.regular_price) ??
    (variationPrices.length ? Math.max(...variationPrices) : null);

  if (regular && price > 0 && regular > price) {
    const discountPercent = Math.round(((regular - price) / regular) * 100);
    return { price, originalPrice: regular, discountPercent };
  }
  return { price };
}

function mapColors(attrs: ScrapedAttr[] | undefined): string[] {
  const colorAttr = attrs?.find((a) => /^colou?r$/i.test(a.name));
  if (!colorAttr?.options?.length) return [];
  return colorAttr.options.map((opt) => {
    const key = opt.trim().toLowerCase();
    return COLOR_HEX[key] ?? opt.trim();
  });
}

function sizeSubtitle(attrs: ScrapedAttr[] | undefined): string | undefined {
  const sizeAttr = attrs?.find((a) => /^size$/i.test(a.name));
  if (!sizeAttr?.options?.length) return undefined;
  return `Sizes: ${sizeAttr.options.join(", ")}`;
}

function estimateStock(p: ScrapedProduct): number {
  const lows = (p.variations ?? [])
    .map((v) => v.low_stock_remaining)
    .filter((n): n is number => typeof n === "number" && n >= 0);
  if (lows.length) return lows.reduce((a, b) => a + b, 0);
  if (p.in_stock === false) return 0;
  return 50;
}

function inferCategorySlug(p: ScrapedProduct): {
  slug: string;
  source: "mapped" | "multi" | "inferred" | "fallback";
  note?: string;
} {
  const cats = (p.categories ?? []).map((c) => c.trim());
  const mapped = cats
    .map((c) => CATEGORY_MAP[c.toLowerCase()])
    .filter(Boolean) as string[];

  const unique = [...new Set(mapped)];
  if (unique.length === 1) return { slug: unique[0], source: "mapped" };
  if (unique.includes("ladies") && unique.includes("men")) {
    return { slug: "unisex", source: "multi", note: cats.join(" + ") };
  }
  if (unique.length > 1) {
    return { slug: unique[0], source: "multi", note: cats.join(" + ") };
  }

  const t = `${p.name} ${p.url}`.toLowerCase();
  if (/child|kid|girl|boy|children|princess|school shoe|skirt/.test(t)) {
    return { slug: "kids", source: "inferred" };
  }
  if (/unisex|boyfriend/.test(t)) return { slug: "unisex", source: "inferred" };
  if (/heel|wedge|lad(y|ies)|woman|female|sandal|slipper|boot|cooperate/.test(t)) {
    return { slug: "ladies", source: "inferred" };
  }
  if (/men['’]?s?|male|odogwu|billionaire|louis|abraham|radiance loafers|prince charles/.test(t)) {
    return { slug: "men", source: "inferred" };
  }
  if (/towel|diffuser|rack|kitchen|bonnet|night|tight|glue|bag|scraper|plate/.test(t)) {
    return { slug: "household", source: "inferred" };
  }
  if (/gadget|charger|cable|earbud|phone/.test(t)) {
    return { slug: "gadgets", source: "inferred" };
  }
  if (/care|cream|soap|lotion|scraper/.test(t)) {
    return { slug: "personal-care", source: "inferred" };
  }
  if (/cloth|fabric|gown|wear|skirt/.test(t)) {
    return { slug: "clothing", source: "inferred" };
  }

  return { slug: "household", source: "fallback", note: "uncategorized → household" };
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function ensureCategories() {
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: {
        name: cat.name,
        description: cat.description,
        heroImage: cat.heroImage,
        icon: cat.icon,
      },
    });
  }
}

async function uploadImages(
  slug: string,
  sourceUrls: string[],
  existing?: { image: string; images: string[] }
): Promise<{ image: string; images: string[]; uploaded: number; reused: number }> {
  if (!sourceUrls.length) {
    return {
      image: existing?.image || "/assets/ProductImage.png",
      images: existing?.images?.length ? existing.images : [],
      uploaded: 0,
      reused: 0,
    };
  }

  if (SKIP_IMAGES || DRY_RUN) {
    return { image: sourceUrls[0], images: sourceUrls, uploaded: 0, reused: 0 };
  }

  // Reuse Cloudinary URLs already stored for this product
  if (
    existing?.image?.includes("res.cloudinary.com") &&
    existing.images?.length &&
    existing.images.every((u) => u.includes("res.cloudinary.com"))
  ) {
    return { image: existing.image, images: existing.images, uploaded: 0, reused: existing.images.length };
  }

  const uploaded = await mapPool(sourceUrls, CONCURRENCY, async (url, i) => {
    const { url: cloudUrl } = await uploadProductImageFromUrl(url, `${slug}-${i + 1}`);
    return cloudUrl;
  });

  return {
    image: uploaded[0],
    images: uploaded,
    uploaded: uploaded.length,
    reused: 0,
  };
}

async function main() {
  console.log(
    `\nAyanfe product import ${DRY_RUN ? "(DRY RUN)" : "(WRITE)"}${IMAGES_ONLY ? " [images-only]" : ""}`
  );
  console.log(`Source: ${JSON_PATH}`);
  if (!DRY_RUN && !SKIP_IMAGES && !isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_* env vars.");
  }

  const raw = JSON.parse(readFileSync(JSON_PATH, "utf8")) as ScrapedProduct[];
  console.log(`Loaded ${raw.length} scraped products`);

  if (!DRY_RUN) {
    await ensureCategories();
    console.log(`Upserted ${CATEGORIES.length} categories`);
  }

  const usedSlugs = new Set<string>();
  const report = {
    created: 0,
    updated: 0,
    inactive: 0,
    noPrice: 0,
    inferredCategory: 0,
    fallbackCategory: 0,
    imagesUploaded: 0,
    imagesReused: 0,
    imageErrors: 0,
    skipped: 0,
    issues: [] as string[],
  };

  const categoryBySlug = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.name]));

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    let slug = slugFromUrl(p.url) || slugify(p.name) || `product-${p.id}`;
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${p.id}`;
      report.issues.push(`duplicate slug → ${slug} (${p.name})`);
    }
    usedSlugs.add(slug);

    const { slug: categorySlug, source, note } = inferCategorySlug(p);
    if (source === "inferred") report.inferredCategory++;
    if (source === "fallback") {
      report.fallbackCategory++;
      report.issues.push(`fallback category for ${slug}: ${note ?? ""}`);
    }

    const pricing = pickPrice(p);
    const colors = mapColors(p.attributes);
    const subtitle = sizeSubtitle(p.attributes);
    const stock = estimateStock(p);
    const description =
      stripHtml(p.description || "") ||
      stripHtml(p.short_description || "") ||
      "";

    const active = pricing.price > 0 && p.in_stock !== false;
    if (pricing.price <= 0) {
      report.noPrice++;
      report.inactive++;
      report.issues.push(`no price → inactive: ${slug}`);
    } else if (!active) {
      report.inactive++;
    }

    const sourceImages = [
      ...new Set([...(p.images ?? []), ...(p.variations ?? []).flatMap((v) => v.images ?? [])]),
    ].filter(Boolean);

    const existing = DRY_RUN
      ? null
      : await prisma.product.findUnique({ where: { slug } });

    let image = sourceImages[0] || "/assets/ProductImage.png";
    let images = sourceImages;

    try {
      const uploaded = await uploadImages(
        slug,
        sourceImages,
        existing ? { image: existing.image, images: existing.images } : undefined
      );
      image = uploaded.image;
      images = uploaded.images;
      report.imagesUploaded += uploaded.uploaded;
      report.imagesReused += uploaded.reused;
    } catch (err) {
      report.imageErrors++;
      report.issues.push(`image upload failed for ${slug}: ${formatErr(err)}`);
      // Keep source URLs rather than dropping the product
      image = sourceImages[0] || existing?.image || "/assets/ProductImage.png";
      images = sourceImages.length ? sourceImages : existing?.images ?? [];
    }

    if (IMAGES_ONLY) {
      if (DRY_RUN) {
        report.updated++;
        continue;
      }
      if (!existing) {
        report.skipped++;
        report.issues.push(`images-only skip (not in db): ${slug}`);
        continue;
      }
      // Only rewrite image fields on images-only pass
      if (image.includes("res.cloudinary.com")) {
        await prisma.product.update({
          where: { slug },
          data: { image, images },
        });
        report.updated++;
      } else {
        report.skipped++;
      }
      if ((i + 1) % 25 === 0 || i === raw.length - 1) {
        console.log(`… ${i + 1}/${raw.length} (updated ${report.updated}, image errors ${report.imageErrors})`);
      }
      continue;
    }

    const data = {
      name: p.name.trim(),
      slug,
      description,
      image,
      images,
      price: pricing.price,
      originalPrice: pricing.originalPrice ?? null,
      discountPercent: pricing.discountPercent ?? null,
      categorySlug,
      category: categoryBySlug[categorySlug] ?? categorySlug,
      colors,
      badge: p.on_sale ? "Sale" : null,
      subtitle: subtitle ?? null,
      stock,
      isFeatured: false,
      isNewArrival: false,
      active,
    };

    if (DRY_RUN) {
      if (i < 5 || !active || source !== "mapped") {
        console.log(
          `[dry] ${slug} | ${categorySlug}(${source}) | ₦${data.price} | imgs=${images.length} | active=${active}`
        );
      }
      report.created++;
      continue;
    }

    if (existing) {
      await prisma.product.update({ where: { slug }, data });
      report.updated++;
    } else {
      await prisma.product.create({ data });
      report.created++;
    }

    if ((i + 1) % 25 === 0 || i === raw.length - 1) {
      console.log(`… ${i + 1}/${raw.length} (created ${report.created}, updated ${report.updated})`);
    }
  }

  let deactivatedWally = 0;
  if (!DRY_RUN) {
    const result = await prisma.product.updateMany({
      where: { slug: { contains: "-wally-" }, active: true },
      data: { active: false },
    });
    deactivatedWally = result.count;
  }

  const totalInDb = DRY_RUN ? null : await prisma.product.count();
  const activeInDb = DRY_RUN ? null : await prisma.product.count({ where: { active: true } });

  console.log("\n── Import report ──");
  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        skipImages: SKIP_IMAGES,
        scraped: raw.length,
        uniqueSlugs: usedSlugs.size,
        ...report,
        issuesPreview: report.issues.slice(0, 40),
        issueCount: report.issues.length,
        deactivatedWally,
        totalInDb,
        activeInDb,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
