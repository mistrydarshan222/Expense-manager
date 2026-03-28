import { Response } from "express";
import { ZodError } from "zod";

import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import { createCategory, listCategories } from "./categories.service";
import { createCategorySchema } from "./categories.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function getCategories(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const categories = await listCategories(userId);

    return res.status(200).json({ categories });
  } catch {
    return res.status(500).json({ message: "Failed to fetch categories" });
  }
}

export async function postCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = createCategorySchema.parse(req.body);
    const category = await createCategory(userId, input);

    return res.status(201).json({
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to create category",
    });
  }
}
