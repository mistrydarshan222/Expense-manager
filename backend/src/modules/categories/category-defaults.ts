import { prisma } from "../../config/db";

export const defaultCategoryNames = [
  "Food",
  "Travel",
  "Bills",
  "Shopping",
  "Health",
  "Entertainment",
  "Other",
] as const;

export async function createDefaultCategoriesForUser(userId: string) {
  const existingCategories = await prisma.category.findMany({
    where: { userId },
    select: { name: true },
  });

  const existingNames = new Set(existingCategories.map((category) => category.name));
  const categoriesToCreate = defaultCategoryNames
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      name,
      userId,
    }));

  if (categoriesToCreate.length === 0) {
    return;
  }

  await prisma.category.createMany({
    data: categoriesToCreate,
  });
}
