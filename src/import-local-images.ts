/**
 * Upload scraped-media/{slug}/* to Cloudinary and patch product image fields.
 * Skips products with price <= 0 / inactive no-price rows.
 *
 * Usage:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED='0'
 *   npx tsx src/import-local-images.ts
 *   npx tsx src/import-local-images.ts --dry-run
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./db.js";
import {
  isCloudinaryConfigured,
  uploadProductImageBuffer,
} from "./services/cloudinary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MEDIA_DIR = resolve(ROOT, "scraped-media");
const MANIFEST_PATH = resolve(MEDIA_DIR, "manifest.json");

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 4;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

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

function listLocalFiles(slug: string): string[] {
  const dir = resolve(MEDIA_DIR, slug);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .sort((a, b) => {
      const na = Number.parseInt(basename(a), 10);
      const nb = Number.parseInt(basename(b), 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .map((f) => resolve(dir, f));
}

async function main() {
  console.log(`\nLocal image → Cloudinary ${DRY_RUN ? "(DRY RUN)" : "(WRITE)"}`);
  console.log(`Media: ${MEDIA_DIR}`);

  if (!existsSync(MEDIA_DIR)) {
    throw new Error(`Missing ${MEDIA_DIR}. Run: python download_product_images.py`);
  }
  if (!DRY_RUN && !isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured.");
  }

  let slugs: string[] = [];
  if (existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<
      string,
      { files?: string[] }
    >;
    slugs = Object.keys(manifest);
  } else {
    slugs = readdirSync(MEDIA_DIR).filter((name) => {
      const p = resolve(MEDIA_DIR, name);
      return statSync(p).isDirectory();
    });
  }

  console.log(`Slugs in media: ${slugs.length}`);

  const report = {
    updated: 0,
    skippedNoPrice: 0,
    skippedMissingProduct: 0,
    skippedNoFiles: 0,
    reusedCloudinary: 0,
    uploaded: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) {
      report.skippedMissingProduct++;
      continue;
    }
    if (!product.price || product.price <= 0) {
      report.skippedNoPrice++;
      continue;
    }

    const files = listLocalFiles(slug);
    if (!files.length) {
      report.skippedNoFiles++;
      continue;
    }

    if (
      product.image.includes("res.cloudinary.com") &&
      product.images.length >= files.length &&
      product.images.every((u) => u.includes("res.cloudinary.com"))
    ) {
      report.reusedCloudinary++;
      report.updated++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry] ${slug} → ${files.length} files`);
      report.updated++;
      continue;
    }

    try {
      const urls = await mapPool(files, CONCURRENCY, async (filePath, idx) => {
        const buf = readFileSync(filePath);
        const { url } = await uploadProductImageBuffer(buf, `${slug}-${idx + 1}`);
        report.uploaded++;
        return url;
      });

      await prisma.product.update({
        where: { slug },
        data: {
          image: urls[0],
          images: urls,
          active: true,
        },
      });
      report.updated++;
    } catch (err) {
      report.errors.push(`${slug}: ${formatErr(err)}`);
    }

    if ((i + 1) % 20 === 0 || i === slugs.length - 1) {
      console.log(`… ${i + 1}/${slugs.length} (updated ${report.updated}, uploaded ${report.uploaded})`);
    }
  }

  // Promote a real catalog slice for home sections (skip placeholders)
  if (!DRY_RUN) {
    const priced = await prisma.product.findMany({
      where: {
        active: true,
        price: { gt: 0 },
        slug: { not: { contains: "-wally-" } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    await prisma.product.updateMany({
      where: { slug: { not: { contains: "-wally-" } } },
      data: { isFeatured: false, isNewArrival: false },
    });

    const featuredIds = priced.slice(0, 48).map((p) => p.id);
    const newIds = priced.slice(0, 16).map((p) => p.id);

    if (featuredIds.length) {
      await prisma.product.updateMany({
        where: { id: { in: featuredIds } },
        data: { isFeatured: true },
      });
    }
    if (newIds.length) {
      await prisma.product.updateMany({
        where: { id: { in: newIds } },
        data: { isNewArrival: true },
      });
    }

    console.log(`Flagged featured=${featuredIds.length}, newArrival=${newIds.length}`);
  }

  const cloudinaryCount = await prisma.product.count({
    where: { image: { contains: "res.cloudinary.com" } },
  });

  console.log("\n── Local image import report ──");
  console.log(JSON.stringify({ ...report, errorCount: report.errors.length, cloudinaryCount }, null, 2));
  if (report.errors.length) {
    console.log("Errors preview:", report.errors.slice(0, 20));
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
