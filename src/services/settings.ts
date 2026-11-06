import { prisma } from "../db.js";
import { toSettingsView } from "../types/order.js";

const DEFAULT_STORE_NAME = "Ayanfe T.T.O Gracious";
const DEFAULT_STORE_ADDRESS =
  "4b Fadipe (3rd building before Greenlight hotel), Seliat, Egbeda, Lagos.";
const PREVIOUS_STORE_ADDRESSES = [
  "4b Fadipe street, (by Phidel Group of Schools, Seliat branch) 3rd building before Green Field hotel, seliat bus stop, Egbeda, Lagos.",
  "4b Fadipe street, (by Phidel Group of Schools, Seliat branch) 3rd building before Green light hotel, seliat bus stop, Egbeda, Lagos.",
];

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

  const currentAddress = settings.storeAddress?.trim() || "";
  const addressIsOld = PREVIOUS_STORE_ADDRESSES.includes(currentAddress);
  // Backfill empty or outdated identity fields so invoices match the store.
  if (!currentAddress || addressIsOld || !settings.storeName?.trim()) {
    settings = await prisma.settings.update({
      where: { key: "store" },
      data: {
        storeName: settings.storeName?.trim() || DEFAULT_STORE_NAME,
        storeAddress: !currentAddress || addressIsOld ? DEFAULT_STORE_ADDRESS : currentAddress,
      },
    });
  }
  return settings;
}

export async function getStoreSettingsView() {
  return toSettingsView(await getStoreSettings());
}
