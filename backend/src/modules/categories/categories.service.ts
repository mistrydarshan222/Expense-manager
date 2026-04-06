import { prisma } from "../../config/db";
import { createDefaultCategoriesForUser } from "./category-defaults";
import { CreateCategoryInput } from "./categories.validation";

export async function listCategories(userId: string) {
  await createDefaultCategoriesForUser(userId);

  return prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(userId: string, input: CreateCategoryInput) {
  return prisma.category.create({
    data: {
      userId,
      name: input.name,
    },
  });
}
