import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Missing environment variable: ${envVar}`);
  }
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:4200,https://darshanmistry.in")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
