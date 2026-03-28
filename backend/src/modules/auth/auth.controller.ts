import { Request, Response } from "express";
import { ZodError } from "zod";

import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";
import { signAccessToken } from "../../common/utils/jwt";
import { getCurrentUser, loginUser, registerUser } from "./auth.service";
import { loginSchema, registerSchema } from "./auth.validation";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function register(req: Request, res: Response) {
  try {
    const input = registerSchema.parse(req.body);
    const user = await registerUser(input);
    const token = signAccessToken({ userId: user.id, email: user.email });

    return res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Registration failed",
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const input = loginSchema.parse(req.body);
    const user = await loginUser(input);
    const token = signAccessToken({ userId: user.id, email: user.email });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(error),
      });
    }

    return res.status(401).json({
      message: error instanceof Error ? error.message : "Login failed",
    });
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const user = await getCurrentUser(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch {
    return res.status(500).json({
      message: "Failed to fetch current user",
    });
  }
}
