import { prisma } from "../../config/db";
import { CreateExpenseInput, UpdateExpenseInput } from "./expenses.validation";

export async function listExpenses(userId: string) {
  return prisma.expense.findMany({
    where: { userId },
    include: {
      category: true,
    },
    orderBy: {
      expenseDate: "desc",
    },
  });
}

export async function createExpense(userId: string, input: CreateExpenseInput) {
  return prisma.expense.create({
    data: {
      userId,
      title: input.title,
      categoryId: input.categoryId,
      expenseDate: new Date(input.expenseDate),
      finalAmount: input.finalAmount,
      total: input.finalAmount,
      merchantName: input.merchantName || null,
      notes: input.notes || null,
      paymentMethod: input.paymentMethod || null,
    },
    include: {
      category: true,
    },
  });
}

export async function updateExpense(userId: string, expenseId: string, input: UpdateExpenseInput) {
  const existingExpense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
  });

  if (!existingExpense) {
    throw new Error("Expense not found");
  }

  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      title: input.title,
      categoryId: input.categoryId,
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : undefined,
      finalAmount: input.finalAmount,
      total: input.finalAmount,
      merchantName: input.merchantName === "" ? null : input.merchantName,
      notes: input.notes === "" ? null : input.notes,
      paymentMethod: input.paymentMethod === "" ? null : input.paymentMethod,
    },
    include: {
      category: true,
    },
  });
}

export async function deleteExpense(userId: string, expenseId: string) {
  const existingExpense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
  });

  if (!existingExpense) {
    throw new Error("Expense not found");
  }

  await prisma.expense.delete({
    where: { id: expenseId },
  });
}
