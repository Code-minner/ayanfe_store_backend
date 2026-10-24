import bcrypt from "bcryptjs";
import { prisma } from "./db.js";

/**
 * Safe bootstrap only. Does NOT delete products, orders, or users.
 * For catalog restore use: npx tsx src/import-scraped-products.ts
 */
const categories = [
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
];

async function seed() {
  for (const cat of categories) {
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

  const existingSettings = await prisma.settings.findUnique({ where: { key: "store" } });
  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        key: "store",
        paystackEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
        storeName: "Ayanfe Stores",
        adminNotifyEmail: process.env.ADMIN_EMAIL ?? "ayanfewholesaledev@gmail.com",
      },
    });
  }

  const adminEmail = "admin@ayanfestore.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "Ayanfe Super Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash("admin1234", 10),
        role: "super_admin",
      },
    });
    console.log("Created super admin: admin@ayanfestore.com / admin1234");
  } else if (existingAdmin.role !== "super_admin") {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { role: "super_admin" },
    });
    console.log("Promoted existing admin to super_admin");
  } else {
    console.log("Super admin already present");
  }

  const productCount = await prisma.product.count();
  console.log(`Seed complete (safe). Products in DB: ${productCount}`);
  if (productCount === 0) {
    console.log("No products found. Restore with: npx tsx src/import-scraped-products.ts");
  }

  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
