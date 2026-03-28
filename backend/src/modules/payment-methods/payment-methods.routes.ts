import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware";
import {
  getPaymentMethods,
  postPaymentMethod,
  removePaymentMethod,
} from "./payment-methods.controller";

const paymentMethodsRouter = Router();

paymentMethodsRouter.use(requireAuth);
paymentMethodsRouter.get("/", getPaymentMethods);
paymentMethodsRouter.post("/", postPaymentMethod);
paymentMethodsRouter.delete("/:id", removePaymentMethod);

export { paymentMethodsRouter };
