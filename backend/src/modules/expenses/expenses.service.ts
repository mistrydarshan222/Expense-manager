import { prisma } from "../../config/db";
import { CreateExpenseInput, UpdateExpenseInput } from "./expenses.validation";

function parseExpenseDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    throw new Error("Expense date is invalid");
  }

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

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
      expenseDate: parseExpenseDate(input.expenseDate),
      finalAmount: input.finalAmount,
      total: input.finalAmount,
      currency: input.currency,
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
      expenseDate: input.expenseDate ? parseExpenseDate(input.expenseDate) : undefined,
      finalAmount: input.finalAmount,
      total: input.finalAmount,
      currency: input.currency,
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
