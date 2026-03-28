import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware";
import { getCategories, postCategory } from "./categories.controller";

const categoriesRouter = Router();

categoriesRouter.use(requireAuth);
categoriesRouter.get("/", getCategories);
categoriesRouter.post("/", postCategory);

export { categoriesRouter };
