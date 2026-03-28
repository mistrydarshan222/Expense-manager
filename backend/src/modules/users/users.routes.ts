import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware";
import { patchPreferences, patchProfile } from "./users.controller";

const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.patch("/me", patchProfile);
usersRouter.patch("/preferences", patchPreferences);

export { usersRouter };
