import { prisma } from "../src/db.js";

await prisma.settings.updateMany({
  data: { storeName: "Attog Store" },
});
console.log("storeName set to Attog Store");
await prisma.$disconnect();
