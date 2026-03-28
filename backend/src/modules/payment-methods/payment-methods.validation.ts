import { z } from "zod";

export const createPaymentMethodSchema = z.object({
  name: z.string().trim().min(2, "Payment method name must be at least 2 characters long"),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
