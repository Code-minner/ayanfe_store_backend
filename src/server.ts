import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db.js";

async function main() {
  await prisma.$connect();
  console.log("Neon/Postgres connected");
  app.listen(env.port, () => {
    console.log(`Ayanfe API listening on http://localhost:${env.port}`);
  });
}

main().catch(async (err) => {
  console.error("Failed to start server", err);
  await prisma.$disconnect();
  process.exit(1);
});
