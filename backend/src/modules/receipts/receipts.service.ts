import { promises as fs } from "fs";
import path from "path";
import Tesseract from "tesseract.js";

import { prisma } from "../../config/db";
import { CreateExpenseFromReceiptInput, EnqueueReceiptInput } from "./receipts.validation";

type ParsedReceipt = {
  merchantName: string | null;
  expenseDate: Date | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  finalAmount: number | null;
  currency: string | null;
  cardLastFour: string | null;
  needsReview: boolean;
  parserConfidence: number;
};

const receiptQueue: string[] = [];
let isQueueProcessing = false;

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

function detectCardLastFour(text: string) {
  const cardLinePatterns = [
    /\b(?:mastercard|master card|visa|debit|credit|amex|american express)[^\n]*?(\d{4})\b/i,
    /\b(?:card|mcard|mcard tend)[^\n]*?(\d{4})\b/i,
  ];

  for (const pattern of cardLinePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  const maskedMatch = text.match(/(?:\*{2,}\s*){2,}(\d{4})\b/);
  if (maskedMatch?.[1]) {
    return maskedMatch[1];
  }

  return null;
}

function detectMerchant(text: string) {
  const knownMerchants: Array<{ key: string; name: string }> = [
    { key: "walmart", name: "Walmart" },
    { key: "costco", name: "Costco" },
    { key: "target", name: "Target" },
    { key: "amazon", name: "Amazon" },
    { key: "tesco", name: "Tesco" },
    { key: "aldi", name: "Aldi" },
    { key: "carrefour", name: "Carrefour" },
  ];
  const blockedPatterns =
    /(invoice|receipt|tax|total|subtotal|date|survey|customer survey|how did we do|win|gift cards|rules and regulations|contest|change due|approval|signature|mastercard|visa|terminal|items sold)/i;

  const normalizeMerchantText = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z]/g, "");

  const canonicalMerchant = (value: string) => {
    const normalized = normalizeMerchantText(value);

    for (const merchant of knownMerchants) {
      if (
        normalized === merchant.key ||
        normalized.startsWith(merchant.key) ||
        merchant.key.startsWith(normalized)
      ) {
        return merchant.name;
      }
    }

    return null;
  };

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const topLines = lines.slice(0, 20);

  for (const line of topLines) {
    const canonical = canonicalMerchant(line);
    if (canonical) {
      return canonical;
    }
  }

  for (const line of topLines) {
    if (/\d/.test(line) || blockedPatterns.test(line)) {
      continue;
    }

    const normalized = line
      .replace(/[^A-Za-z&\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized || normalized.length < 3) {
      continue;
    }

    const canonical = canonicalMerchant(normalized);
    if (canonical) {
      return canonical;
    }

    const words = normalized.split(" ");
    const cleanedCandidate = words
      .filter((word) => word.length > 1)
      .slice(0, 3)
      .join(" ")
      .trim();

    if (cleanedCandidate && !blockedPatterns.test(cleanedCandidate)) {
      return cleanedCandidate;
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
    cardLastFour: detectCardLastFour(normalizedText),
    needsReview,
    parserConfidence: total !== null ? 0.92 : subtotal !== null ? 0.68 : 0.2,
  };
}

async function readUploadedReceiptText(filePath: string, mimeType: string, originalFileName: string) {
  const extension = path.extname(originalFileName).toLowerCase();
  const textLikeMimeTypes = new Set(["text/plain", "text/csv", "application/json"]);
  const imageLikeMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"]);

  if (textLikeMimeTypes.has(mimeType) || [".txt", ".csv", ".json", ".log"].includes(extension)) {
    return fs.readFile(filePath, "utf8");
  }

  if (imageLikeMimeTypes.has(mimeType) || [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(extension)) {
    const result = await Tesseract.recognize(filePath, "eng");
    return result.data.text ?? "";
  }

  return "";
}

function computeFinalAmount(receipt: {
  extractedSubtotal: unknown;
  extractedTax: unknown;
  extractedTotal: unknown;
}) {
  const total = receipt.extractedTotal === null ? null : Number(receipt.extractedTotal);
  const subtotal = receipt.extractedSubtotal === null ? null : Number(receipt.extractedSubtotal);
  const tax = receipt.extractedTax === null ? null : Number(receipt.extractedTax);

  if (Number.isFinite(total)) {
    return { finalAmount: total, needsReview: false };
  }

  if (subtotal !== null && tax !== null && Number.isFinite(subtotal) && Number.isFinite(tax)) {
    return {
      finalAmount: Number((subtotal + tax).toFixed(2)),
      needsReview: true,
    };
  }

  if (Number.isFinite(subtotal)) {
    return { finalAmount: subtotal, needsReview: true };
  }

  return { finalAmount: null, needsReview: true };
}

async function processQueuedReceipt(receiptId: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      user: {
        select: {
          preferredCurrency: true,
          paymentMethods: {
            select: {
              name: true,
              lastFour: true,
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      },
    },
  });

  if (!receipt) {
    return;
  }

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: "processing",
      processingError: null,
    },
  });

  try {
    const extractedText = receipt.ocrRawText?.trim()
      ? receipt.ocrRawText
      : receipt.filePath !== "inline"
        ? await readUploadedReceiptText(receipt.filePath, receipt.mimeType, receipt.originalFileName)
        : "";

    if (!extractedText.trim()) {
      throw new Error("Could not read any text from this receipt.");
    }

    const parsed = parseReceiptText(extractedText);

    if (parsed.finalAmount === null) {
      throw new Error("Could not find total, subtotal, or tax values in this receipt.");
    }

    const matchedPaymentMethod =
      receipt.paymentMethod ||
      (
        parsed.cardLastFour
          ? receipt.user.paymentMethods.find((method) => method.lastFour === parsed.cardLastFour)?.name ?? null
          : null
      );

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: "processed",
        title: receipt.title || parsed.merchantName || path.parse(receipt.originalFileName).name,
        ocrRawText: extractedText,
        merchantName: receipt.merchantName || parsed.merchantName,
        expenseDate: receipt.expenseDate ?? parsed.expenseDate ?? new Date(),
        currency: receipt.currency ?? parsed.currency ?? receipt.user.preferredCurrency,
        paymentMethod: matchedPaymentMethod,
        extractedSubtotal: parsed.subtotal,
        extractedTax: parsed.tax,
        extractedTotal: parsed.total ?? parsed.finalAmount,
        parserConfidence: parsed.parserConfidence,
        processingError: null,
        processedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: "failed",
        processingError: error instanceof Error ? error.message : "Failed to process receipt",
        processedAt: new Date(),
      },
    });
  }
}

async function processQueue() {
  if (isQueueProcessing) {
    return;
  }

  isQueueProcessing = true;

  try {
    while (receiptQueue.length > 0) {
      const receiptId = receiptQueue.shift();
      if (!receiptId) {
        continue;
      }

      await processQueuedReceipt(receiptId);
    }
  } finally {
    isQueueProcessing = false;
  }
}

export function enqueueReceiptProcessing(receiptId: string) {
  receiptQueue.push(receiptId);
  setTimeout(() => {
    void processQueue();
  }, 0);
}

export async function enqueueReceipt(
  userId: string,
  input: EnqueueReceiptInput,
  file: Express.Multer.File | undefined,
  preferredCurrency: string,
) {
  if (!file && !input.rawText.trim()) {
    throw new Error("Upload a receipt image or paste receipt text first.");
  }

  const receipt = await prisma.receipt.create({
    data: {
      userId,
      status: "queued",
      categoryId: input.categoryId,
      title: input.title || null,
      merchantName: input.merchantName || null,
      expenseDate: input.expenseDate.trim() ? new Date(input.expenseDate) : null,
      currency: preferredCurrency,
      paymentMethod: input.paymentMethod || null,
      notes: input.notes || null,
      originalFileName: file?.originalname ?? "pasted-receipt.txt",
      storedFileName: file ? path.basename(file.path) : "pasted-receipt.txt",
      mimeType: file?.mimetype ?? "text/plain",
      filePath: file?.path ?? "inline",
      ocrRawText: input.rawText || null,
    },
  });

  enqueueReceiptProcessing(receipt.id);

  return receipt;
}

export async function listReceipts(userId: string) {
  return prisma.receipt.findMany({
    where: { userId },
    include: {
      expense: {
        include: {
          category: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getReceipt(userId: string, receiptId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, userId },
    include: {
      expense: {
        include: {
          category: true,
        },
      },
    },
  });

  if (!receipt) {
    throw new Error("Receipt not found");
  }

  return receipt;
}

export async function createExpenseFromReceipt(
  userId: string,
  receiptId: string,
  input: CreateExpenseFromReceiptInput,
) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, userId },
  });

  if (!receipt) {
    throw new Error("Receipt not found");
  }

  if (receipt.expenseId) {
    throw new Error("An expense has already been created from this receipt");
  }

  if (receipt.status !== "processed") {
    throw new Error("This receipt is not ready for review yet");
  }

  const computed = computeFinalAmount(receipt);

  if (computed.finalAmount === null) {
    throw new Error("Could not determine the final amount from this receipt");
  }

  const finalAmount = computed.finalAmount;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        userId,
        categoryId: input.categoryId,
        title: input.title,
        merchantName: input.merchantName || receipt.merchantName || null,
        expenseDate: new Date(input.expenseDate),
        subtotal: receipt.extractedSubtotal,
        tax: receipt.extractedTax,
        total: receipt.extractedTotal ?? finalAmount,
        finalAmount,
        currency: receipt.currency || "USD",
        paymentMethod: input.paymentMethod || receipt.paymentMethod || null,
        notes: input.notes || receipt.notes || null,
        receiptUrl: receipt.filePath !== "inline" ? `/uploads/receipts/${receipt.storedFileName}` : null,
        isAutoExtracted: true,
        needsReview: computed.needsReview,
      },
      include: {
        category: true,
      },
    });

    const updatedReceipt = await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        expenseId: expense.id,
        status: "completed",
        categoryId: input.categoryId,
        title: input.title,
        merchantName: input.merchantName || receipt.merchantName || null,
        expenseDate: new Date(input.expenseDate),
        paymentMethod: input.paymentMethod || receipt.paymentMethod || null,
        notes: input.notes || receipt.notes || null,
      },
    });

    return {
      expense,
      receipt: updatedReceipt,
    };
  });
}
