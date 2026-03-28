import { Response } from "express";
import { ZodError } from "zod";

import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "./expenses.service";
import { createExpenseSchema, updateExpenseSchema } from "./expenses.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function getExpenses(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const expenses = await listExpenses(userId);

    return res.status(200).json({ expenses });
  } catch {
    return res.status(500).json({ message: "Failed to fetch expenses" });
  }
}

export async function postExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = createExpenseSchema.parse(req.body);
    const expense = await createExpense(userId, input);

    return res.status(201).json({
      message: "Expense created successfully",
      expense,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to create expense",
    });
  }
}

export async function putExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const expenseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!expenseId) {
      return res.status(400).json({ message: "Expense id is required" });
    }

    const input = updateExpenseSchema.parse(req.body);
    const expense = await updateExpense(userId, expenseId, input);

    return res.status(200).json({
      message: "Expense updated successfully",
      expense,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to update expense",
    });
  }
}

export async function removeExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const expenseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!expenseId) {
      return res.status(400).json({ message: "Expense id is required" });
    }

    await deleteExpense(userId, expenseId);

    return res.status(200).json({
      message: "Expense deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to delete expense",
    });
  }
}
