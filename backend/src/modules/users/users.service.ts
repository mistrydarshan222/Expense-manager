import bcrypt from "bcrypt";

import { prisma } from "../../config/db";
import { UpdatePreferencesInput, UpdateProfileInput } from "./users.validation";

export async function updateUserPreferences(userId: string, input: UpdatePreferencesInput) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      preferredCurrency: input.preferredCurrency,
    },
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

export async function updateUserProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (input.email && input.email !== user.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new Error("An account with this email already exists");
    }
  }

  let passwordHash: string | undefined;

  if (input.newPassword && input.currentPassword) {
    const isPasswordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    passwordHash = await bcrypt.hash(input.newPassword, 10);
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      email: input.email,
      preferredCurrency: input.preferredCurrency,
      passwordHash,
    },
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
