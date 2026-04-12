import { Response } from "express";
import { ZodError } from "zod";

import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from "./payment-methods.service";
import { createPaymentMethodSchema, updatePaymentMethodSchema } from "./payment-methods.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function getPaymentMethods(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const paymentMethods = await listPaymentMethods(userId);
    return res.status(200).json({ paymentMethods });
  } catch {
    return res.status(500).json({ message: "Failed to fetch payment methods" });
  }
}

export async function postPaymentMethod(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const input = createPaymentMethodSchema.parse(req.body);
    const paymentMethod = await createPaymentMethod(userId, input);

    return res.status(201).json({
      message: "Payment method created successfully",
      paymentMethod,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to create payment method",
    });
  }
}

export async function removePaymentMethod(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ message: "Payment method id is required" });
    }

    await deletePaymentMethod(userId, id);
    return res.status(200).json({ message: "Payment method deleted successfully" });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to delete payment method",
    });
  }
}

export async function putPaymentMethod(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ message: "Payment method id is required" });
    }

    const input = updatePaymentMethodSchema.parse(req.body);
    const paymentMethod = await updatePaymentMethod(userId, id, input);

    return res.status(200).json({
      message: "Payment method updated successfully",
      paymentMethod,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to update payment method",
    });
  }
}
