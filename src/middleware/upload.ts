import multer from "multer";
import { AppError } from "../utils/AppError.js";

function imageFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.mimetype);
  if (!ok) return cb(new AppError(400, "Only PNG, JPG, or WEBP images are allowed"));
  cb(null, true);
}

const memory = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

export const uploadReceipt = memory.single("receipt");
export const uploadAvatar = memory.single("avatar");
export const uploadProductImage = memory.single("image");
export const uploadProductImages = memory.array("images", 8);
