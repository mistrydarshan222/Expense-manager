import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "backend",
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use("/auth", authRouter);
