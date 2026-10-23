import { prisma } from "../db.js";
import { toSettingsView } from "../types/order.js";

export async function getStoreSettings() {
  let settings = await prisma.settings.findUnique({ where: { key: "store" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { key: "store" } });
  }
  return settings;
}

export async function getStoreSettingsView() {
  return toSettingsView(await getStoreSettings());
}
