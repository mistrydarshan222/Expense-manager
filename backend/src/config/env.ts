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
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "sk-xXKgQB8ktJDh16euGN4oSexUYI8iSF8Wv9oQVOWSYTNfH",
  receiptAiModel: process.env.RECEIPT_AI_MODEL ?? "gpt-5.2",
  receiptAiBaseUrl: process.env.RECEIPT_AI_BASE_URL ?? "https://ai-api.janisahil.com/v1",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:4200,https://darshanmistry.in")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
