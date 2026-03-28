import { Response } from "express";
import { ZodError } from "zod";

import { prisma } from "../../config/db";
import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import { processReceipt } from "./receipts.service";
import { processReceiptSchema } from "./receipts.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function postProcessReceipt(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = processReceiptSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredCurrency: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const result = await processReceipt(userId, input, req.file, user.preferredCurrency);

    return res.status(201).json({
      message: "Receipt processed and expense created successfully",
      expense: result.expense,
      receipt: result.receipt,
      extraction: result.extraction,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to process receipt",
    });
  }
}
