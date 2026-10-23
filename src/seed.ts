import bcrypt from "bcryptjs";
import { prisma } from "./db.js";

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
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.settings.deleteMany();

  await prisma.category.createMany({ data: categories });

  const products = categories.flatMap((cat) =>
    Array.from({ length: 4 }, (_, i) => ({
      name: "Wally sport Mesh",
      slug: `${cat.slug}-wally-${i + 1}`,
      description: cat.description,
      image: "/assets/ProductImage.png",
      price: 290000,
      categorySlug: cat.slug,
      category: cat.name,
      colors: ["#000000", "#555555"],
      stock: 50,
      isFeatured: i < 2,
      isNewArrival: i === 0,
      active: true,
    }))
  );

  await prisma.product.createMany({ data: products });

  await prisma.settings.create({
    data: {
      key: "store",
      paystackEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
      storeName: "Ayanfe Stores",
      adminNotifyEmail: process.env.ADMIN_EMAIL ?? "ayanfewholesaledev@gmail.com",
    },
  });

  const adminEmail = "admin@ayanfestore.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "Ayanfe Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash("admin1234", 10),
        role: "admin",
      },
    });
  }

  console.log("Seed complete");
  console.log("Admin login: admin@ayanfestore.com / admin1234");
  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

