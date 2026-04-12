import { z } from "zod";

export const createPaymentMethodSchema = z.object({
  name: z.string().trim().min(2, "Payment method name must be at least 2 characters long"),
  lastFour: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => value === "" || /^\d{4}$/.test(value), "Last 4 digits must be exactly 4 numbers"),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
export const updatePaymentMethodSchema = createPaymentMethodSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;
