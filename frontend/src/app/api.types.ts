export type AuthResponse = {
  message: string;
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    preferredCurrency: string;
  };
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  preferredCurrency: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentMethod = {
  id: string;
  name: string;
  lastFour: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  title: string;
  categoryId: string | null;
  userId: string;
  merchantName: string | null;
  expenseDate: string;
  finalAmount: string;
  total: string | null;
  currency: string;
  notes: string | null;
  paymentMethod: string | null;
  receiptUrl?: string | null;
  isAutoExtracted?: boolean;
  needsReview?: boolean;
  category?: Category | null;
  createdAt: string;
  updatedAt: string;
};

export type ReceiptExtraction = {
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  finalAmount: number;
  currency: string;
  needsReview: boolean;
};

export type Receipt = {
  id: string;
  userId: string;
  expenseId: string | null;
  status: 'queued' | 'processing' | 'processed' | 'failed' | 'completed';
  categoryId: string | null;
  title: string | null;
  merchantName: string | null;
  expenseDate: string | null;
  currency: string | null;
  paymentMethod: string | null;
  notes: string | null;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  filePath: string;
  ocrRawText: string | null;
  extractedSubtotal: string | null;
  extractedTax: string | null;
  extractedTotal: string | null;
  parserConfidence: number | null;
  processingError: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expense?: Expense | null;
};
