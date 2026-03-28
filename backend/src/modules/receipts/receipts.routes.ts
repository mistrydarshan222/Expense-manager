import { Router } from "express";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";

import { requireAuth } from "../../common/middleware/auth.middleware";
import { postProcessReceipt } from "./receipts.controller";

const uploadDirectory = path.resolve("uploads", "receipts");
mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    callback(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({ storage });

const receiptsRouter = Router();

receiptsRouter.use(requireAuth);
receiptsRouter.post("/process", upload.single("receipt"), postProcessReceipt);

export { receiptsRouter };
