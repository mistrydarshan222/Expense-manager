import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware";
import { getExpenses, postExpense, putExpense, removeExpense } from "./expenses.controller";

const expensesRouter = Router();

expensesRouter.use(requireAuth);
expensesRouter.get("/", getExpenses);
expensesRouter.post("/", postExpense);
expensesRouter.put("/:id", putExpense);
expensesRouter.delete("/:id", removeExpense);

export { expensesRouter };
