import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";
import { categoriesRouter } from "../modules/categories/categories.routes";
import { expensesRouter } from "../modules/expenses/expenses.routes";
import { paymentMethodsRouter } from "../modules/payment-methods/payment-methods.routes";
import { usersRouter } from "../modules/users/users.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "backend",
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/expenses", expensesRouter);
apiRouter.use("/payment-methods", paymentMethodsRouter);
apiRouter.use("/users", usersRouter);
