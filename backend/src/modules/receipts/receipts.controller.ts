import { Response } from "express";
import { ZodError } from "zod";

import { prisma } from "../../config/db";
import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import {
  createExpenseFromReceipt,
  enqueueReceipt,
  getReceipt,
  listReceipts,
} from "./receipts.service";
import {
  createExpenseFromReceiptSchema,
  enqueueReceiptSchema,
} from "./receipts.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function postEnqueueReceipt(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = enqueueReceiptSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredCurrency: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const receipt = await enqueueReceipt(userId, input, req.file, user.preferredCurrency);

    return res.status(202).json({
      message: "Receipt added to the queue successfully",
      receipt,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to queue receipt",
    });
  }
}

export async function getReceipts(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const receipts = await listReceipts(userId);

    return res.status(200).json({ receipts });
  } catch {
    return res.status(500).json({ message: "Failed to fetch receipts" });
  }
}

export async function getReceiptById(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const receiptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!receiptId) {
      return res.status(400).json({ message: "Receipt id is required" });
    }

    const receipt = await getReceipt(userId, receiptId);
    return res.status(200).json({ receipt });
  } catch (error) {
    return res.status(404).json({
      message: error instanceof Error ? error.message : "Receipt not found",
    });
  }
}

export async function postCreateExpenseFromReceipt(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const receiptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!receiptId) {
      return res.status(400).json({ message: "Receipt id is required" });
    }

    const input = createExpenseFromReceiptSchema.parse(req.body);
    const result = await createExpenseFromReceipt(userId, receiptId, input);

    return res.status(201).json({
      message: "Expense created from receipt successfully",
      expense: result.expense,
      receipt: result.receipt,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to create expense from receipt",
    });
  }
}
