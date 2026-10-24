import { prisma } from "../db.js";
import { toSettingsView } from "../types/order.js";

const DEFAULT_STORE_NAME = "Ayanfe T.T.O Gracious";
const DEFAULT_STORE_ADDRESS =
  "4b Fadipe street, (by Phidel Group of Schools, Seliat branch) 3rd building before Green Field hotel, seliat bus stop, Egbeda, Lagos.";

export async function getStoreSettings() {
  let settings = await prisma.settings.findUnique({ where: { key: "store" } });
  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        key: "store",
        storeName: DEFAULT_STORE_NAME,
        storeAddress: DEFAULT_STORE_ADDRESS,
      },
    });
    return settings;
  }

  // Backfill empty identity fields so printed invoices match the store paper.
  if (!settings.storeAddress?.trim() || !settings.storeName?.trim()) {
    settings = await prisma.settings.update({
      where: { key: "store" },
      data: {
        storeName: settings.storeName?.trim() || DEFAULT_STORE_NAME,
        storeAddress: settings.storeAddress?.trim() || DEFAULT_STORE_ADDRESS,
      },
    });
  }
  return settings;
}

export async function getStoreSettingsView() {
  return toSettingsView(await getStoreSettings());
}
