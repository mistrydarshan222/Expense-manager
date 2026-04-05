import cors from "cors";
import express from "express";

import { env } from "./config/env";
import { apiRouter } from "./routes";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.length === 0 || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

app.get("/", (_req, res) => {
  res.json({
    message: "Expense Management API is running",
  });
});

app.use("/api", apiRouter);
