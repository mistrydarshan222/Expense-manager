import cors from "cors";
import express from "express";

import { apiRouter } from "./routes";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

app.get("/", (_req, res) => {
  res.json({
    message: "Expense Management API is running",
  });
});

app.use("/api", apiRouter);
