import { z } from "zod";

const amountField = z
  .union([z.string(), z.number()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value) && value >= 0, "Amount must be a valid non-negative number");

export const createExpenseSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters long"),
  categoryId: z.string().uuid("Category is required"),
  expenseDate: z.string().min(1, "Expense date is required"),
  finalAmount: amountField,
  currency: z.string().trim().length(3, "Currency must be a 3-letter code").transform((value) => value.toUpperCase()),
  merchantName: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  paymentMethod: z.string().trim().optional().default(""),
});

export const updateExpenseSchema = createExpenseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
