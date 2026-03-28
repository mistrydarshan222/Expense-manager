import { z } from "zod";

export const processReceiptSchema = z.object({
  categoryId: z.string().uuid("Category is required"),
  expenseDate: z.string().optional().default(""),
  title: z.string().trim().optional().default(""),
  merchantName: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  paymentMethod: z.string().trim().optional().default(""),
  rawText: z.string().trim().optional().default(""),
});

export type ProcessReceiptInput = z.infer<typeof processReceiptSchema>;
