import { prisma } from "../../config/db";
import { CreateCategoryInput } from "./categories.validation";

export async function listCategories(userId: string) {
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
