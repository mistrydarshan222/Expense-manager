import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
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

type OcrReadResult = {
  fullText: string;
  headerText: string;
};

type OcrCandidate = {
  fullText: string;
  headerText: string;
  score: number;
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

function findAllAmountsForLabels(text: string, labels: string[]) {
  const amounts: number[] = [];

  for (const label of labels) {
    const regex = new RegExp(
      `${label}\\s*[:\\-]?\\s*(?:\\d+(?:\\.\\d+)?\\s*%\\s*)?(?:[A-Z]{3}\\s*)?[\\$\\u20AC\\u00A3\\u20B9]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)`,
      "gi",
    );

    for (const match of text.matchAll(regex)) {
      if (!match[1]) {
        continue;
      }

      const amount = parseAmount(match[1]);
      if (amount !== null) {
        amounts.push(amount);
      }
    }
  }

  return amounts;
}

function extractLastAmountFromLine(line: string) {
  const normalizedLine = line.replace(/,/g, "").replace(/\s+/g, " ").trim();

  const decimalMatches = Array.from(normalizedLine.matchAll(/(?:[A-Z]{3}\s*)?[$€£₹]?\s*(\d+\.\d{2})/g));
  const lastDecimalMatch = decimalMatches[decimalMatches.length - 1];
  if (lastDecimalMatch?.[1]) {
    return parseAmount(lastDecimalMatch[1]);
  }

  const numericTokens = normalizedLine.match(/\d+/g) ?? [];
  if (numericTokens.length >= 2) {
    const cents = numericTokens[numericTokens.length - 1];
    const whole = numericTokens[numericTokens.length - 2];

    if (cents.length === 2 && whole.length >= 1) {
      const combined = `${whole}.${cents}`;
      const parsedCombined = parseAmount(combined);
      if (parsedCombined !== null) {
        return parsedCombined;
      }
    }
  }

  const lastToken = numericTokens[numericTokens.length - 1];
  return lastToken ? parseAmount(lastToken) : null;
}

function findLineAmount(text: string, labels: string[], options?: { exclude?: RegExp }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalizedLine = line.replace(/\s+/g, " ").trim();

    if (options?.exclude?.test(normalizedLine)) {
      continue;
    }

    for (const label of labels) {
      const labelPattern = label.replace(/\s+/g, "\\s*");
      const regex = new RegExp(`^${labelPattern}\\b`, "i");

      if (!regex.test(normalizedLine)) {
        continue;
      }

      const amount = extractLastAmountFromLine(normalizedLine);
      if (amount !== null) {
        return amount;
      }
    }
  }

  return null;
}

function findTaxAmountsFromLines(text: string, labels: string[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amounts: number[] = [];

  for (const line of lines) {
    const normalizedLine = line.replace(/\s+/g, " ").trim();

    for (const label of labels) {
      const labelPattern = label.replace(/\s+/g, "\\s*");
      const regex = new RegExp(`^${labelPattern}\\b`, "i");

      if (!regex.test(normalizedLine)) {
        continue;
      }

      const amount = extractLastAmountFromLine(normalizedLine);
      if (amount !== null) {
        amounts.push(amount);
      }
      break;
    }
  }

  return amounts;
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
    /\b(?:mastercard|master card|visa|debit|credit|amex|american express)[^\n]{0,80}?(\d{4})\b/i,
    /\b(?:card|mcard|mcard tend)[^\n]{0,80}?(\d{4})\b/i,
  ];

  for (const pattern of cardLinePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  const maskedMatch = text.match(/(?:[\*xX%]{2,}[\s*%xX]*){2,}(\d{4})\b/);
  if (maskedMatch?.[1]) {
    return maskedMatch[1];
  }

  return null;
}

function detectMerchant(text: string) {
  const knownMerchants: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\breal canadian superstore\b/i, name: "Real Canadian Superstore" },
    { pattern: /\bwalmart\b/i, name: "Walmart" },
    { pattern: /\bcostco\b/i, name: "Costco" },
    { pattern: /\btarget\b/i, name: "Target" },
    { pattern: /\bamazon\b/i, name: "Amazon" },
    { pattern: /\btesco\b/i, name: "Tesco" },
    { pattern: /\baldi\b/i, name: "Aldi" },
    { pattern: /\bcarrefour\b/i, name: "Carrefour" },
  ];
  const blockedPatterns =
    /(invoice|receipt|tax|total|subtotal|date|survey|customer survey|how did we do|win|gift cards|rules and regulations|contest|change due|approval|signature|mastercard|visa|discover|terminal|items sold|transaction|merchant id|terminal id|approval code|entry mode|response|thank you|thanks for supporting|purchase|card type|number|type|slip #|retain this copy)/i;

  const normalizeSpaces = (value: string) =>
    value.replace(/[^A-Za-z&\s]/g, " ").replace(/\s+/g, " ").trim();

  const titleCase = (value: string) =>
    value
      .toLowerCase()
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const canonicalMerchant = (value: string) => {
    const normalizedLine = normalizeSpaces(value);

    for (const merchant of knownMerchants) {
      if (merchant.pattern.test(normalizedLine)) {
        return merchant.name;
      }
    }

    return null;
  };

  const cleanCandidate = (value: string) => {
    const normalized = normalizeSpaces(value);

    if (!normalized || normalized.length < 3) {
      return null;
    }

    if (/\d/.test(normalized) || blockedPatterns.test(normalized)) {
      return null;
    }

    const words = normalized
      .split(" ")
      .filter((word) => word.length > 1)
      .slice(0, 5);

    if (words.length === 0) {
      return null;
    }

    return titleCase(words.join(" "));
  };

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const topLines = lines.slice(0, 12);

  for (const line of topLines) {
    const canonical = canonicalMerchant(line);
    if (canonical) {
      return canonical;
    }
  }

  for (const line of topLines) {
    const canonical = canonicalMerchant(line);
    if (canonical) {
      return canonical;
    }

    const cleanedCandidate = cleanCandidate(line);
    if (cleanedCandidate) {
      return cleanedCandidate;
    }
  }

  return null;
}

function parseReceiptText(text: string, headerText = ""): ParsedReceipt {
  const normalizedText = text.replace(/\r/g, "\n");
  const normalizedHeaderText = headerText.replace(/\r/g, "\n");
  const subtotal =
    findLineAmount(normalizedText, ["subtotal", "sub total"], { exclude: /\btotal\b/i }) ??
    findAmountForLabels(normalizedText, ["subtotal", "sub total"]);
  const taxAmounts = [
    ...findTaxAmountsFromLines(normalizedText, [
      "tax",
      "tax 1",
      "tax 2",
      "vat",
      "gst",
      "hst",
      "pst",
      "qst",
      "sales tax",
    ]),
    ...findAllAmountsForLabels(normalizedText, [
    "tax",
    "vat",
    "gst",
    "hst",
    "pst",
    "qst",
    "sales tax",
    ]),
  ];
  const uniqueTaxAmounts = Array.from(new Set(taxAmounts.map((amount) => amount.toFixed(2)))).map(Number);
  const tax =
    uniqueTaxAmounts.length > 0
      ? Number(uniqueTaxAmounts.reduce((sum, amount) => sum + amount, 0).toFixed(2))
      : null;
  const total =
    findLineAmount(normalizedText, ["grand total", "total due", "amount due", "total"], {
      exclude: /\bsub\s*total\b/i,
    }) ??
    findAmountForLabels(normalizedText, ["grand total", "total due", "amount due", "total"]);

  const subtotalPlusTax =
    subtotal !== null && tax !== null ? Number((subtotal + tax).toFixed(2)) : null;

  let finalAmount = subtotalPlusTax ?? total;
  let needsReview = false;

  if (finalAmount === null && subtotal !== null) {
    finalAmount = subtotal;
    needsReview = true;
  } else if (subtotalPlusTax !== null && total !== null && Math.abs(subtotalPlusTax - total) > 0.009) {
    needsReview = true;
  }

  return {
    merchantName: detectMerchant(normalizedHeaderText) || detectMerchant(normalizedText),
    expenseDate: detectDate(normalizedText),
    subtotal,
    tax,
    total,
    finalAmount,
    currency: detectCurrency(normalizedText),
    cardLastFour: detectCardLastFour(normalizedText),
    needsReview,
    parserConfidence: subtotalPlusTax !== null || total !== null ? 0.92 : subtotal !== null ? 0.68 : 0.2,
  };
}

function scoreParsedReceipt(parsed: ParsedReceipt) {
  let score = 0;

  if (parsed.total !== null) score += 10;
  if (parsed.subtotal !== null) score += 4;
  if (parsed.tax !== null) score += 3;
  if (parsed.finalAmount !== null) score += 8;
  if (parsed.merchantName) score += 3;
  if (parsed.expenseDate) score += 1;
  if (parsed.cardLastFour) score += 1;

  return score;
}

async function readUploadedReceiptText(filePath: string, mimeType: string, originalFileName: string): Promise<OcrReadResult> {
  const extension = path.extname(originalFileName).toLowerCase();
  const textLikeMimeTypes = new Set(["text/plain", "text/csv", "application/json"]);
  const imageLikeMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"]);
  const pdfLikeMimeTypes = new Set(["application/pdf"]);

  if (textLikeMimeTypes.has(mimeType) || [".txt", ".csv", ".json", ".log"].includes(extension)) {
    const text = await fs.readFile(filePath, "utf8");
    return {
      fullText: text,
      headerText: text,
    };
  }

  if (
    imageLikeMimeTypes.has(mimeType) ||
    pdfLikeMimeTypes.has(mimeType) ||
    [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".pdf"].includes(extension)
  ) {
    const candidates: OcrCandidate[] = [];
    const generatedPaths: string[] = [];

    try {
      const isPdf = pdfLikeMimeTypes.has(mimeType) || extension === ".pdf";
      const createBaseImage = () => (isPdf ? sharp(filePath, { density: 300, page: 0 }) : sharp(filePath));
      const baseImage = createBaseImage();
      const metadata = await baseImage.metadata();

      const rotations = [0, 90, 270, 180];

      for (const rotation of rotations) {
        const processedFullPath = `${filePath}.ocr-${rotation}.png`;
        generatedPaths.push(processedFullPath);

        await createBaseImage()
          .rotate(rotation)
          .grayscale()
          .normalize()
          .withMetadata({ density: 300 })
          .png()
          .toFile(processedFullPath);

        const fullResult = await Tesseract.recognize(processedFullPath, "eng");
        const fullText = fullResult.data.text ?? "";

        let headerText = "";

        const rotatedMetadata = await sharp(processedFullPath).metadata();
        if (rotatedMetadata.width && rotatedMetadata.height) {
          const headerHeight = Math.max(Math.floor(rotatedMetadata.height * 0.32), 200);
          const headerPath = `${filePath}.header-${rotation}.png`;
          generatedPaths.push(headerPath);

          await sharp(processedFullPath)
            .extract({
              left: 0,
              top: 0,
              width: rotatedMetadata.width,
              height: Math.min(headerHeight, rotatedMetadata.height),
            })
            .png()
            .toFile(headerPath);

          const headerResult = await Tesseract.recognize(headerPath, "eng");
          headerText = headerResult.data.text ?? "";
        }

        const parsed = parseReceiptText(fullText, headerText);
        candidates.push({
          fullText,
          headerText,
          score: scoreParsedReceipt(parsed),
        });
      }
    } catch {
      return {
        fullText: "",
        headerText: "",
      };
    } finally {
      for (const tempPath of generatedPaths) {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    }

    const bestCandidate = candidates.sort((left, right) => right.score - left.score)[0];

    return {
      fullText: bestCandidate?.fullText ?? "",
      headerText: bestCandidate?.headerText ?? "",
    };
  }

  return {
    fullText: "",
    headerText: "",
  };
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
    const extractedResult = receipt.ocrRawText?.trim()
      ? { fullText: receipt.ocrRawText, headerText: receipt.ocrRawText }
      : receipt.filePath !== "inline"
        ? await readUploadedReceiptText(receipt.filePath, receipt.mimeType, receipt.originalFileName)
        : { fullText: "", headerText: "" };

    if (!extractedResult.fullText.trim()) {
      throw new Error("Could not read any text from this receipt.");
    }

    const parsed = parseReceiptText(extractedResult.fullText, extractedResult.headerText);

    if (parsed.finalAmount === null) {
      throw new Error("Could not find total, subtotal, or tax values in this receipt.");
    }

    const autoMatchedPaymentMethod = parsed.cardLastFour
      ? receipt.user.paymentMethods.find((method) => method.lastFour === parsed.cardLastFour)?.name ?? null
      : null;

    const shouldOverrideExistingPaymentMethod =
      !receipt.paymentMethod || /^cash$/i.test(receipt.paymentMethod.trim());

    const matchedPaymentMethod = shouldOverrideExistingPaymentMethod
      ? autoMatchedPaymentMethod ?? receipt.paymentMethod ?? null
      : receipt.paymentMethod;

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: "processed",
        title: receipt.title || parsed.merchantName || path.parse(receipt.originalFileName).name,
        ocrRawText: extractedResult.fullText,
        merchantName: receipt.merchantName || parsed.merchantName,
        expenseDate: receipt.expenseDate ?? parsed.expenseDate ?? new Date(),
        currency: receipt.currency ?? parsed.currency ?? receipt.user.preferredCurrency,
        paymentMethod: matchedPaymentMethod,
        extractedSubtotal: parsed.subtotal,
        extractedTax: parsed.tax,
        extractedTotal: parsed.finalAmount,
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
