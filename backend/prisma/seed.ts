import bcrypt from "bcrypt";

import { prisma } from "../src/config/db";

const DEFAULT_CATEGORIES = [
  "Bills",
  "Entertainment",
  "Food",
  "Health",
  "Other",
  "Shopping",
  "Travel",
] as const;

async function main() {
  const demoEmail = "demo@example.com";
  const demoPassword = "Demo@123";

  const existingUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        name: "Demo User",
        email: demoEmail,
        passwordHash,
      },
    }));

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((name) => ({
      name,
      userId: user.id,
    })),
    skipDuplicates: true,
  });

  console.log("Seed complete.");
  console.log(`Demo user email: ${demoEmail}`);
  console.log(`Demo user password: ${demoPassword}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
