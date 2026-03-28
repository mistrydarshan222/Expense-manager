import { z } from "zod";

export const updatePreferencesSchema = z.object({
  preferredCurrency: z
    .string()
    .trim()
    .length(3, "Preferred currency must be a 3-letter code")
    .transform((value) => value.toUpperCase()),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters long").optional(),
    email: z.email("Please enter a valid email address").trim().toLowerCase().optional(),
    preferredCurrency: z
      .string()
      .trim()
      .length(3, "Preferred currency must be a 3-letter code")
      .transform((value) => value.toUpperCase())
      .optional(),
    currentPassword: z.string().min(6, "Current password must be at least 6 characters long").optional(),
    newPassword: z.string().min(6, "New password must be at least 6 characters long").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .refine(
    (value) => (!value.newPassword && !value.currentPassword) || Boolean(value.newPassword && value.currentPassword),
    "Current password and new password are required together",
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
