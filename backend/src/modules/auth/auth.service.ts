import bcrypt from "bcrypt";

import { prisma } from "../../config/db";
import { createDefaultCategoriesForUser } from "../categories/category-defaults";
import { createDefaultPaymentMethodForUser } from "../payment-methods/payment-methods.service";
import { LoginInput, RegisterInput } from "./auth.validation";

export async function registerUser(input: RegisterInput) {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      preferredCurrency: "USD",
    },
  });

  await createDefaultCategoriesForUser(user.id);
  await createDefaultPaymentMethodForUser(user.id);

  return user;
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  return user;
}

export async function getCurrentUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      preferredCurrency: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
