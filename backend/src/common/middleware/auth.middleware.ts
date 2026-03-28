import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";

type JwtPayload = {
  userId: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user?: JwtPayload;
};

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authorization token is required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}
