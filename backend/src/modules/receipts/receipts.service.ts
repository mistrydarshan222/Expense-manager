import { promises as fs } from "fs";
import path from "path";
import { env } from "../../config/env";
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

type ParsedReceiptWithRawText = ParsedReceipt & {
  rawText: string | null;
};

type ReceiptData = {
  merchant: { name: string | null };
  date: string | null;
  subtotal: number | null;
  taxes: Array<{ amount: number }>;
  total: number | null;
  currency: string | null;
  payment: { cardLastFour: string | null };
  warnings?: string[];
  confidence?: number;
  rawText?: string | null;
};

type AiReceiptScanner = {
  scan(filePath: string, options: { userPrompt: string }): Promise<{ data: ReceiptData }>;
};

type AiReceiptReadResult =
  | { parsed: ParsedReceiptWithRawText; error: null }
  | { parsed: null; error: string };

const receiptQueue: string[] = [];
let activeProcessingCount = 0;
const MAX_CONCURRENT_RECEIPTS = 3;
const MAX_STORED_AMOUNT = 99_999_999.99;
const AI_SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
let aiReceiptScannerPromise: Promise<AiReceiptScanner | null> | null = null;
let aiReceiptScannerInitError: string | null = null;

async function getAiReceiptScanner() {
  if (!env.openAiApiKey) {
    return null;
  }

  if (!aiReceiptScannerPromise) {
    aiReceiptScannerPromise = import("receipt-ai-scanner")
      .then(({ ReceiptScanner, createOpenAICompatibleProvider, createOpenAIProvider }) => {
        const provider = env.receiptAiBaseUrl
          ? createOpenAICompatibleProvider({
              baseURL: env.receiptAiBaseUrl,
              apiKey: env.openAiApiKey,
              defaultModel: env.receiptAiModel,
              name: "receipt-ai",
            })
          : createOpenAIProvider({
              apiKey: env.openAiApiKey,
              defaultModel: env.receiptAiModel,
            });

        return new ReceiptScanner({
          provider,
          model: env.receiptAiModel,
          temperature: 0,
          strictValidation: false,
          timeoutMs: 30_000,
        }) as AiReceiptScanner;
      })
      .catch((error) => {
        aiReceiptScannerInitError = error instanceof Error ? error.message : "Unknown receipt AI initialization error.";
        return null;
      });
  }

  return aiReceiptScannerPromise;
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  const hasDot = trimmed.includes(".");
  const hasComma = trimmed.includes(",");
  const normalized = hasComma && !hasDot
    ? trimmed.replace(/\s/g, "").replace(/,/g, ".")
    : trimmed.replace(/[,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLabelRegex(label: string) {
  const normalizedLabel = label
    .trim()
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join("\\s*");

  return new RegExp(`(?:^|\\b)${normalizedLabel}\\b`, "i");
}

function normalizeStoredAmount(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Number(value.toFixed(2));

  if (rounded < 0 || Math.abs(rounded) > MAX_STORED_AMOUNT) {
    return null;
  }

  return rounded;
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findAmountForLabels(text: string, labels: string[]) {
  for (const label of labels) {
    const labelRegex = buildLabelRegex(label);
    const regex = new RegExp(
      `${labelRegex.source}\\s*[:\\-]?\\s*(?:[A-Z]{3}\\s*)?[\\$\\u20AC\\u00A3\\u20B9]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?|\\d+(?:,\\d{2}))`,
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
    const labelRegex = buildLabelRegex(label);
    const regex = new RegExp(
      `${labelRegex.source}\\s*[:\\-]?\\s*(?:\\d+(?:[\\.,]\\d+)?\\s*%\\s*)?(?:[A-Z]{3}\\s*)?[\\$\\u20AC\\u00A3\\u20B9]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?|\\d+(?:,\\d{2}))`,
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
  if (!lastToken) {
    return null;
  }

  // OCR commonly drops the decimal point on money lines, turning 19.48 into 1948.
  // Prefer an implied-cents interpretation for larger integer tokens.
  if (lastToken.length >= 4 && lastToken.length <= 10) {
    const withImpliedCents = `${lastToken.slice(0, -2)}.${lastToken.slice(-2)}`;
    const parsedWithImpliedCents = parseAmount(withImpliedCents);

    if (parsedWithImpliedCents !== null) {
      return parsedWithImpliedCents;
    }
  }

  return parseAmount(lastToken);
}

function findLineAmount(text: string, labels: string[], options?: { exclude?: RegExp }) {
  return findLineAmounts(text, labels, options)[0] ?? null;
}

function findLineAmounts(text: string, labels: string[], options?: { exclude?: RegExp }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amounts: number[] = [];

  for (const [index, line] of lines.entries()) {
    const normalizedLine = line.replace(/\s+/g, " ").trim();

    if (options?.exclude?.test(normalizedLine)) {
      continue;
    }

    for (const label of labels) {
      const regex = buildLabelRegex(label);

      if (!regex.test(normalizedLine)) {
        continue;
      }

      const amount = extractLastAmountFromLine(normalizedLine);
      if (amount !== null) {
        amounts.push(amount);
      } else {
        const nextLine = lines[index + 1];
        if (nextLine) {
          const combinedAmount = extractLastAmountFromLine(`${normalizedLine} ${nextLine.trim()}`);
          if (combinedAmount !== null) {
            amounts.push(combinedAmount);
          }
        }
      }
    }
  }

  return amounts;
}

function findTaxAmountsFromLines(text: string, labels: string[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amounts: number[] = [];

  for (const [index, line] of lines.entries()) {
    const normalizedLine = line.replace(/\s+/g, " ").trim();

    for (const label of labels) {
      const regex = buildLabelRegex(label);

      if (!regex.test(normalizedLine)) {
        continue;
      }

      const amount = extractLastAmountFromLine(normalizedLine);
      if (amount !== null) {
        amounts.push(amount);
      } else {
        const nextLine = lines[index + 1];
        if (nextLine) {
          const combinedAmount = extractLastAmountFromLine(`${normalizedLine} ${nextLine.trim()}`);
          if (combinedAmount !== null) {
            amounts.push(combinedAmount);
          }
        }
      }
      break;
    }
  }

  return amounts;
}

function findPreferredTotalAmount(text: string) {
  const prioritizedLabels = ["grand total", "total due", "amount due", "total"];
  const strictTotalCandidates = findLineAmounts(text, prioritizedLabels, {
    exclude: /\bsub\s*total\b|\btotal\s+purchase\b|\bmcard\s+tend\b|\bchange\s+due\b/i,
  });

  if (strictTotalCandidates.length > 0) {
    return strictTotalCandidates[0];
  }

  return (
    findAmountForLabels(text, ["grand total", "total due", "amount due"]) ??
    findAmountForLabels(text, ["total"])
  );
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
  const rawSubtotalCandidates = [
    ...findLineAmounts(normalizedText, ["subtotal", "sub total"]),
    ...(() => {
      const fallbackSubtotal = findAmountForLabels(normalizedText, ["subtotal", "sub total"]);
      return fallbackSubtotal !== null ? [fallbackSubtotal] : [];
    })(),
  ];
  const totalCandidates = [
    ...(() => {
      const preferredTotal = findPreferredTotalAmount(normalizedText);
      return preferredTotal !== null ? [preferredTotal] : [];
    })(),
    ...(() => {
      const fallbackTotal = findAmountForLabels(normalizedText, ["grand total", "total due", "amount due"]);
      return fallbackTotal !== null ? [fallbackTotal] : [];
    })(),
  ];
  let subtotal = rawSubtotalCandidates[0] ?? null;
  const total = totalCandidates[0] ?? null;

  const lineTaxAmounts = findTaxAmountsFromLines(normalizedText, [
    "tax",
    "tax 1",
    "tax 2",
    "vat",
    "gst",
    "hst",
    "pst",
    "qst",
    "sales tax",
  ]);
  const fallbackTaxAmounts =
    lineTaxAmounts.length > 0
      ? []
      : findAllAmountsForLabels(normalizedText, [
          "tax",
          "vat",
          "gst",
          "hst",
          "pst",
          "qst",
          "sales tax",
        ]);
  const taxAmounts = [...lineTaxAmounts, ...fallbackTaxAmounts];
  const uniqueTaxAmounts = Array.from(new Set(taxAmounts.map((amount) => amount.toFixed(2)))).map(Number);
  const tax = chooseBestTaxAmount(uniqueTaxAmounts, subtotal, total);
  const derivedSubtotal =
    total !== null && tax !== null && total >= tax ? Number((total - tax).toFixed(2)) : null;

  if (
    derivedSubtotal !== null &&
    (subtotal === null || Math.abs(subtotal - derivedSubtotal) > 0.5)
  ) {
    subtotal = derivedSubtotal;
  }

  const subtotalPlusTax =
    subtotal !== null && tax !== null ? Number((subtotal + tax).toFixed(2)) : null;

  let finalAmount = total ?? subtotalPlusTax;
  let needsReview = false;

  if (finalAmount === null && subtotal !== null) {
    finalAmount = subtotal;
    needsReview = true;
  } else if (subtotalPlusTax !== null && total !== null && Math.abs(subtotalPlusTax - total) > 0.009) {
    finalAmount = total;
    needsReview = true;
  }

  if (total !== null && subtotal !== null && total < subtotal) {
    needsReview = true;
  }

  return {
    merchantName: detectMerchant(normalizedHeaderText) || detectMerchant(normalizedText),
    expenseDate: detectDate(normalizedText),
    subtotal: normalizeStoredAmount(subtotal),
    tax: normalizeStoredAmount(tax),
    total: normalizeStoredAmount(total),
    finalAmount: normalizeStoredAmount(finalAmount),
    currency: detectCurrency(normalizedText),
    cardLastFour: detectCardLastFour(normalizedText),
    needsReview,
    parserConfidence: subtotalPlusTax !== null || total !== null ? 0.92 : subtotal !== null ? 0.68 : 0.2,
  };
}

function chooseBestTaxAmount(candidates: number[], subtotal: number | null, total: number | null) {
  if (candidates.length === 0) {
    if (subtotal !== null && total !== null && total >= subtotal) {
      return Number((total - subtotal).toFixed(2));
    }

    return null;
  }

  if (subtotal !== null && total !== null) {
    const expectedTax = Number((total - subtotal).toFixed(2));

    if (expectedTax >= 0) {
      const closestMatch = [...candidates].sort(
        (left, right) => Math.abs(left - expectedTax) - Math.abs(right - expectedTax),
      )[0];

      if (closestMatch !== undefined) {
        return closestMatch;
      }
    }
  }

  return candidates[0] ?? null;
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

function parseAiReceiptResult(data: ReceiptData): ParsedReceiptWithRawText {
  const subtotal = normalizeStoredAmount(data.subtotal);
  const taxTotal = data.taxes.reduce((sum, tax) => sum + (Number.isFinite(tax.amount) ? tax.amount : 0), 0);
  const tax = normalizeStoredAmount(taxTotal > 0 ? taxTotal : null);
  const total = normalizeStoredAmount(data.total);
  const finalAmount = normalizeStoredAmount(total);
  const expectedTotal = subtotal !== null && tax !== null ? Number((subtotal + tax).toFixed(2)) : null;
  const hasMismatch = expectedTotal !== null && total !== null && Math.abs(expectedTotal - total) > 0.01;
  const warnings = data.warnings ?? [];
  const confidence = typeof data.confidence === "number" && Number.isFinite(data.confidence) ? data.confidence : 0;

  return {
    merchantName: data.merchant.name ?? null,
    expenseDate: parseIsoDate(data.date),
    subtotal,
    tax,
    total,
    finalAmount,
    currency: data.currency ?? null,
    cardLastFour: data.payment.cardLastFour ?? null,
    needsReview: warnings.length > 0 || confidence < 0.8 || hasMismatch,
    parserConfidence: Math.max(0, Math.min(1, confidence)),
    rawText: data.rawText ?? null,
  };
}

async function readReceiptWithAi(filePath: string, mimeType: string): Promise<AiReceiptReadResult> {
  if (!AI_SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      parsed: null,
      error: `Unsupported receipt file type: ${mimeType}. Supported types are PNG, JPEG, WEBP, and GIF.`,
    };
  }

  try {
    const aiReceiptScanner = await getAiReceiptScanner();

    if (!aiReceiptScanner) {
      return {
        parsed: null,
        error:
          aiReceiptScannerInitError ??
          "Receipt AI scanner is not configured. Add a valid OPENAI_API_KEY to enable image receipt extraction.",
      };
    }

    const result = await aiReceiptScanner.scan(filePath, {
      userPrompt:
        "This receipt is for personal expense tracking. Prioritize the merchant name, subtotal, taxes, total, date, currency, and any card last four digits.",
    });

    return {
      parsed: parseAiReceiptResult(result.data),
      error: null,
    };
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error.message : "Receipt AI scanner failed to extract receipt data.",
    };
  }
}

async function readUploadedReceiptText(filePath: string, mimeType: string, originalFileName: string): Promise<OcrReadResult> {
  const extension = path.extname(originalFileName).toLowerCase();
  const textLikeMimeTypes = new Set(["text/plain", "text/csv", "application/json"]);

  if (textLikeMimeTypes.has(mimeType) || [".txt", ".csv", ".json", ".log"].includes(extension)) {
    const text = await fs.readFile(filePath, "utf8");
    return {
      fullText: text,
      headerText: text,
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
  const total = normalizeStoredAmount(receipt.extractedTotal === null ? null : Number(receipt.extractedTotal));
  const subtotal = normalizeStoredAmount(receipt.extractedSubtotal === null ? null : Number(receipt.extractedSubtotal));
  const tax = normalizeStoredAmount(receipt.extractedTax === null ? null : Number(receipt.extractedTax));

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
    const aiResult = receipt.filePath !== "inline"
      ? await readReceiptWithAi(receipt.filePath, receipt.mimeType)
      : { parsed: null, error: null as string | null };
    const aiParsed = aiResult.parsed;
    const parsed = aiParsed ?? parseReceiptText(extractedResult.fullText, extractedResult.headerText);
    const resolvedRawText = aiParsed?.rawText ?? extractedResult.fullText;

    if (!resolvedRawText.trim() && parsed.finalAmount === null) {
      throw new Error(
        aiResult.error ??
          "Could not extract receipt data. Upload a supported image receipt or paste the receipt text manually.",
      );
    }

    if (parsed.finalAmount === null) {
      throw new Error("Could not determine a valid receipt amount from this file.");
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
        ocrRawText: resolvedRawText,
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
  while (receiptQueue.length > 0 && activeProcessingCount < MAX_CONCURRENT_RECEIPTS) {
    const receiptId = receiptQueue.shift();
    if (!receiptId) {
      continue;
    }

    activeProcessingCount++;
    // Process in the background without awaiting
    processQueuedReceipt(receiptId)
      .finally(() => {
        activeProcessingCount--;
        // Continue processing if there are more items
        if (receiptQueue.length > 0) {
          void processQueue();
        }
      });
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
