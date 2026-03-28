import { Response } from "express";
import { ZodError } from "zod";

import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import { updateUserPreferences, updateUserProfile } from "./users.service";
import { updatePreferencesSchema, updateProfileSchema } from "./users.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function patchPreferences(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = updatePreferencesSchema.parse(req.body);
    const user = await updateUserPreferences(userId, input);

    return res.status(200).json({
      message: "Preferences updated successfully",
      user,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to update preferences",
    });
  }
}

export async function patchProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = updateProfileSchema.parse(req.body);
    const user = await updateUserProfile(userId, input);

    return res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to update profile",
    });
  }
}
