import { prisma } from "../../config/db";
import { CreatePaymentMethodInput, UpdatePaymentMethodInput } from "./payment-methods.validation";

export async function listPaymentMethods(userId: string) {
  return prisma.paymentMethod.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function createPaymentMethod(userId: string, input: CreatePaymentMethodInput) {
  return prisma.paymentMethod.create({
    data: {
      userId,
      name: input.name,
      lastFour: input.lastFour || null,
    },
  });
}

export async function deletePaymentMethod(userId: string, id: string) {
  const method = await prisma.paymentMethod.findFirst({
    where: { id, userId },
  });

  if (!method) {
    throw new Error("Payment method not found");
  }

  await prisma.paymentMethod.delete({
    where: { id },
  });
}

export async function updatePaymentMethod(userId: string, id: string, input: UpdatePaymentMethodInput) {
  const method = await prisma.paymentMethod.findFirst({
    where: { id, userId },
  });

  if (!method) {
    throw new Error("Payment method not found");
  }

  return prisma.paymentMethod.update({
    where: { id },
    data: {
      name: input.name,
      lastFour: input.lastFour === "" ? null : input.lastFour,
    },
  });
}

export async function createDefaultPaymentMethodForUser(userId: string) {
  const existing = await prisma.paymentMethod.findFirst({
    where: { userId, name: "Cash" },
  });

  if (existing) {
    return;
  }

  await prisma.paymentMethod.create({
    data: {
      userId,
      name: "Cash",
    },
  });
}
