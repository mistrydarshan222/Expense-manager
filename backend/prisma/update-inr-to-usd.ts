import { prisma } from "../src/config/db";

async function main() {
  const result = await prisma.expense.updateMany({
    where: {
      currency: "INR",
    },
    data: {
      currency: "USD",
    },
  });

  console.log(`Updated ${result.count} expense record(s) from INR to USD.`);
}

main()
  .catch((error) => {
    console.error("Currency update failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
