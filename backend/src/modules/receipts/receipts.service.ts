import { promises as fs } from "fs";
import path from "path";
import Tesseract from "tesseract.js";

import { prisma } from "../../config/db";
import { ProcessReceiptInput } from "./receipts.validation";

type ParsedReceipt = {
  merchantName: string | null;
  expenseDate: Date | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  finalAmount: number | null;
  currency: string | null;
  needsReview: boolean;
  parserConfidence: number;
};

function parseAmount(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findAmountForLabels(text: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(
      `${label}\\s*[:\\-]?\\s*(?:[A-Z]{3}\\s*)?[\\$\\u20AC\\u00A3\\u20B9]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)`,
      "i",
    );
    const match = text.match(regex);

    if (match?.[1]) {
      const amount = parseAmount(match[1]);
      if (amount !== null) {
        return amount;
      }
    }
  }

  return null;
}

function detectCurrency(text: string) {
  if (/\bUSD\b|\$/i.test(text)) return "USD";
  if (/\bCAD\b|CA\$/i.test(text)) return "CAD";
  if (/\bEUR\b|\u20AC/i.test(text)) return "EUR";
  if (/\bGBP\b|\u00A3/i.test(text)) return "GBP";
  if (/\bINR\b|\u20B9/i.test(text)) return "INR";
  if (/\bAUD\b|AU\$/i.test(text)) return "AUD";
  if (/\bAED\b/i.test(text)) return "AED";
  if (/\bJPY\b|\u00A5/i.test(text)) return "JPY";

  return null;
}

function detectDate(text: string) {
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    return new Date(`${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`);
  }

  const slashMatch = text.match(/\b(\d{1,2})[/\-](\d{1,2})[/\-](20\d{2})\b/);
  if (slashMatch) {
    return new Date(`${slashMatch[3]}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`);
  }

  return null;
}

function detectMerchant(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 5)) {
    if (!/\d/.test(line) && !/(invoice|receipt|tax|total|subtotal|date)/i.test(line)) {
      return line;
    }
  }

  return null;
}

function parseReceiptText(text: string): ParsedReceipt {
  const normalizedText = text.replace(/\r/g, "\n");
  const subtotal = findAmountForLabels(normalizedText, ["subtotal", "sub total", "amount"]);
  const tax = findAmountForLabels(normalizedText, ["tax", "vat", "gst"]);
  const total = findAmountForLabels(normalizedText, ["grand total", "total due", "amount due", "total"]);

  let finalAmount = total;
  let needsReview = false;

  if (finalAmount === null && subtotal !== null && tax !== null) {
    finalAmount = Number((subtotal + tax).toFixed(2));
    needsReview = true;
  } else if (finalAmount === null && subtotal !== null) {
    finalAmount = subtotal;
    needsReview = true;
  }

  return {
    merchantName: detectMerchant(normalizedText),
    expenseDate: detectDate(normalizedText),
    subtotal,
    tax,
    total,
    finalAmount,
    currency: detectCurrency(normalizedText),
    needsReview,
    parserConfidence: total !== null ? 0.92 : subtotal !== null ? 0.68 : 0.2,
  };
}

async function readUploadedReceiptText(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  const textLikeMimeTypes = new Set(["text/plain", "text/csv", "application/json"]);
  const imageLikeMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"]);

  if (textLikeMimeTypes.has(file.mimetype) || [".txt", ".csv", ".json", ".log"].includes(extension)) {
    return fs.readFile(file.path, "utf8");
  }

  if (imageLikeMimeTypes.has(file.mimetype) || [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(extension)) {
    const result = await Tesseract.recognize(file.path, "eng");
    return result.data.text ?? "";
  }

  return "";
}

export async function processReceipt(
  userId: string,
  input: ProcessReceiptInput,
  file: Express.Multer.File | undefined,
  preferredCurrency: string,
) {
  const uploadedText = file ? await readUploadedReceiptText(file) : "";
  const receiptText = input.rawText || uploadedText;

  if (!receiptText.trim()) {
    throw new Error("Upload a supported receipt image or paste receipt text so the app can extract the total.");
  }

  const parsed = parseReceiptText(receiptText);

  if (parsed.finalAmount === null) {
    throw new Error("Could not find a total in the receipt. Paste clearer receipt text or add the expense manually.");
  }

  const extractedFinalAmount = parsed.finalAmount;
  const finalExpenseDate = input.expenseDate.trim()
    ? new Date(input.expenseDate)
    : parsed.expenseDate ?? new Date();

  const expenseTitle =
    input.title.trim() ||
    input.merchantName.trim() ||
    parsed.merchantName ||
    "Receipt expense";

  const merchantName = input.merchantName.trim() || parsed.merchantName || null;
  const currency = parsed.currency ?? preferredCurrency;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        userId,
        categoryId: input.categoryId,
        title: expenseTitle,
        merchantName,
        expenseDate: finalExpenseDate,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total ?? extractedFinalAmount,
        finalAmount: extractedFinalAmount,
        currency,
        paymentMethod: input.paymentMethod || null,
        notes: input.notes || null,
        receiptUrl: file ? `/uploads/receipts/${path.basename(file.path)}` : null,
        isAutoExtracted: true,
        needsReview: parsed.needsReview,
      },
      include: {
        category: true,
      },
    });

    const receipt = await tx.receipt.create({
      data: {
        userId,
        expenseId: expense.id,
        originalFileName: file?.originalname ?? "pasted-receipt.txt",
        storedFileName: file ? path.basename(file.path) : "pasted-receipt.txt",
        mimeType: file?.mimetype ?? "text/plain",
        filePath: file?.path ?? "inline",
        ocrRawText: receiptText,
        extractedSubtotal: parsed.subtotal,
        extractedTax: parsed.tax,
        extractedTotal: parsed.total ?? extractedFinalAmount,
        parserConfidence: parsed.parserConfidence,
      },
    });

    return {
      expense,
      receipt,
      extraction: {
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total,
        finalAmount: extractedFinalAmount,
        currency,
        needsReview: parsed.needsReview,
      },
    };
  });
}
