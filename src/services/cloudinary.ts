import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

let configured = false;

function ensureCloudinary() {
  if (configured) return;
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new AppError(
      503,
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
  configured = true;
}

async function uploadImageBuffer(buffer: Buffer, filename: string, folder: string) {
  ensureCloudinary();

  return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `${Date.now()}-${filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")}`,
        resource_type: "image",
      },
      (err, result) => {
        if (err || !result?.secure_url) {
          reject(err ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function uploadReceiptBuffer(buffer: Buffer, filename: string) {
  return uploadImageBuffer(buffer, filename, "ayanfe/receipts");
}

export async function uploadAvatarBuffer(buffer: Buffer, filename: string) {
  return uploadImageBuffer(buffer, filename, "ayanfe/avatars");
}

/** Upload a remote image URL into Cloudinary (used by product import). */
export async function uploadProductImageFromUrl(imageUrl: string, publicId: string) {
  ensureCloudinary();

  const result = await cloudinary.uploader.upload(imageUrl, {
    folder: "ayanfe/products",
    public_id: publicId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120),
    overwrite: true,
    resource_type: "image",
  });

  if (!result?.secure_url) {
    throw new Error(`Cloudinary upload failed for ${imageUrl}`);
  }

  return { url: result.secure_url, publicId: result.public_id };
}

/** Upload a local image buffer into Cloudinary (preferred for scraped media). */
export async function uploadProductImageBuffer(buffer: Buffer, publicId: string) {
  ensureCloudinary();

  return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "ayanfe/products",
        public_id: publicId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120),
        overwrite: true,
        resource_type: "image",
      },
      (err, result) => {
        if (err || !result?.secure_url) {
          reject(err ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export function isCloudinaryConfigured() {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}
