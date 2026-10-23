import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./config/env.js";

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });

/** Keep `_id` on API responses for storefront compatibility. */
export function withId<T extends { id: string }>(row: T) {
  return { ...row, _id: row.id };
}

export function withIds<T extends { id: string }>(rows: T[]) {
  return rows.map(withId);
}

