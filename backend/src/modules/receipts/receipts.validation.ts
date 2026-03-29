import { z } from "zod";

export const enqueueReceiptSchema = z.object({
  categoryId: z.string().uuid("Category is required"),
  expenseDate: z.string().optional().default(""),
  title: z.string().trim().optional().default(""),
  merchantName: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  paymentMethod: z.string().trim().optional().default(""),
  rawText: z.string().trim().optional().default(""),
});

export const createExpenseFromReceiptSchema = z.object({
  categoryId: z.string().uuid("Category is required"),
  expenseDate: z.string().min(1, "Expense date is required"),
  title: z.string().trim().min(2, "Title must be at least 2 characters long"),
  merchantName: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  paymentMethod: z.string().trim().optional().default(""),
});

export type EnqueueReceiptInput = z.infer<typeof enqueueReceiptSchema>;
export type CreateExpenseFromReceiptInput = z.infer<typeof createExpenseFromReceiptSchema>;
