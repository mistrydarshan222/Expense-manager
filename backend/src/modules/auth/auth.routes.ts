import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware";
import { login, me, register } from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);

export { authRouter };
