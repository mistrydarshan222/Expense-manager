import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from './api.service';
import { Category, CurrentUser, Expense, PaymentMethod, Receipt } from './api.types';

type CurrencyOption = {
  code: string;
  label: string;
};

type ActionFeedbackTone = 'info' | 'success' | 'error';

type ActionFeedback = {
  message: string;
  tone: ActionFeedbackTone;
};

const fallbackCurrencyOptions: CurrencyOption[] = [
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'ZAR', label: 'South African Rand' }
];

function getCurrencyOptions(): CurrencyOption[] {
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames === 'undefined') {
    return fallbackCurrencyOptions;
  }

  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  }).supportedValuesOf;

  if (!supportedValuesOf) {
    return fallbackCurrencyOptions;
  }

  const displayNames = new Intl.DisplayNames([navigator.language || 'en'], {
    type: 'currency'
  });

  return supportedValuesOf('currency')
    .map((code) => ({
      code,
      label: displayNames.of(code) ?? code
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

@Injectable({
  providedIn: 'root'
})
export class AppStore {
  private readonly api = inject(ApiService);

  readonly currencyOptions: CurrencyOption[] = getCurrencyOptions();

  readonly token = signal(localStorage.getItem('expense-token') ?? '');
  readonly currentUser = signal<CurrentUser | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly receipts = signal<Receipt[]>([]);
  readonly currentReceipt = signal<Receipt | null>(null);
  readonly statusMessage = signal('Ready to connect your expense manager.');
  readonly actionFeedback = signal<ActionFeedback | null>(null);
  readonly isSubmitting = signal(false);
  private receiptPollTimer: number | null = null;
  private feedbackTimer: number | null = null;

  readonly userName = computed(() => this.currentUser()?.name ?? 'Guest');
  readonly preferredCurrency = computed(() => this.currentUser()?.preferredCurrency ?? 'CAD');

  readonly totalSpent = computed(() =>
    this.expenses().reduce((sum, expense) => sum + Number(expense.finalAmount), 0)
  );

  readonly totalsByCurrency = computed(() => {
    const totals = new Map<string, number>();

    for (const expense of this.expenses()) {
      const currency = expense.currency || 'CAD';
      totals.set(currency, (totals.get(currency) ?? 0) + Number(expense.finalAmount));
    }

    return Array.from(totals.entries()).map(([currency, amount]) => ({
      currency,
      amount
    }));
  });

  constructor() {
    if (this.token()) {
      this.loadDashboardData();
    }
  }

  register(payload: { name: string; email: string; password: string }, onDone?: () => void) {
    this.isSubmitting.set(true);
    this.showFeedback('Creating your account and default categories...', 'info');

    this.api.register(payload).subscribe({
      next: (response) => {
        this.finishAuth(response.token, response.user);
        this.categories.set(response.categories ?? []);
        this.paymentMethods.set(response.paymentMethods ?? []);
        onDone?.();
        this.showFeedback('Account created. Default categories are ready.', 'success');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Registration failed.', 'error');
      }
    });
  }

  login(payload: { email: string; password: string }, onDone?: () => void) {
    this.isSubmitting.set(true);
    this.showFeedback('Signing in and loading your dashboard...', 'info');

    this.api.login(payload).subscribe({
      next: (response) => {
        this.finishAuth(response.token, response.user);
        onDone?.();
        this.showFeedback('Login successful.', 'success');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Login failed.', 'error');
      }
    });
  }

  createCategory(name: string, onDone?: () => void) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Adding a new category...', 'info');

    this.api.createCategory(this.token(), name).subscribe({
      next: () => {
        this.loadCategories();
        this.isSubmitting.set(false);
        this.showFeedback('Category created successfully.', 'success');
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not create category.', 'error');
      }
    });
  }

  createExpense(
    payload: {
      title: string;
      categoryId: string;
      expenseDate: string;
      finalAmount: number;
      currency: string;
      merchantName?: string;
      paymentMethod?: string;
      notes?: string;
    },
    onDone?: () => void
  ) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Saving the expense...', 'info');

    this.api.createExpense(this.token(), payload).subscribe({
      next: () => {
        this.loadExpenses();
        this.isSubmitting.set(false);
        this.showFeedback('Expense saved successfully.', 'success');
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not save the expense.', 'error');
      }
    });
  }

  updateExpense(
    expenseId: string,
    payload: {
      title: string;
      categoryId: string;
      expenseDate: string;
      finalAmount: number;
      currency: string;
      merchantName?: string;
      paymentMethod?: string;
      notes?: string;
    },
    onDone?: () => void
  ) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Updating the expense...', 'info');

    this.api.updateExpense(this.token(), expenseId, payload).subscribe({
      next: () => {
        this.loadExpenses();
        this.isSubmitting.set(false);
        this.showFeedback('Expense updated successfully.', 'success');
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not update the expense.', 'error');
      }
    });
  }

  deleteExpense(expenseId: string) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Deleting the expense...', 'info');

    this.api.deleteExpense(this.token(), expenseId).subscribe({
      next: () => {
        this.loadExpenses();
        this.isSubmitting.set(false);
        this.showFeedback('Expense deleted successfully.', 'success');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not delete the expense.', 'error');
      }
    });
  }

  queueReceipt(
    payload: {
      categoryId: string;
      expenseDate?: string;
      title?: string;
      merchantName?: string;
      notes?: string;
      paymentMethod?: string;
      rawText?: string;
      receiptFile?: File | null;
    },
    onDone?: () => void
  ) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Adding receipt to the processing queue...', 'info');

    this.api.queueReceipt(this.token(), payload).subscribe({
      next: ({ receipt }) => {
        this.loadReceipts();
        this.currentReceipt.set(receipt);
        this.startReceiptPolling(receipt.id);
        this.isSubmitting.set(false);
        this.showFeedback(
          'Receipt queued successfully. It will appear in review once processing finishes.',
          'success'
        );
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not queue receipt.', 'error');
      }
    });
  }

  loadReceipts() {
    if (!this.token()) {
      return;
    }

    this.api.getReceipts(this.token()).subscribe({
      next: ({ receipts }) => {
        this.receipts.set(receipts);
      },
      error: () => {
        this.showFeedback('Could not load receipts.', 'error');
      }
    });
  }

  loadReceipt(receiptId: string) {
    if (!this.token()) {
      return;
    }

    this.api.getReceipt(this.token(), receiptId).subscribe({
      next: ({ receipt }) => {
        this.currentReceipt.set(receipt);
        this.receipts.update((current) => {
          const existing = current.findIndex((item) => item.id === receipt.id);
          if (existing === -1) {
            return [receipt, ...current];
          }

          const next = [...current];
          next[existing] = receipt;
          return next;
        });

        if (receipt.status === 'queued' || receipt.status === 'processing') {
          this.startReceiptPolling(receipt.id);
        } else {
          this.stopReceiptPolling();
        }
      },
      error: () => {
        this.showFeedback('Could not load receipt details.', 'error');
      }
    });
  }

  createExpenseFromReceipt(
    receiptId: string,
    payload: {
      categoryId: string;
      expenseDate: string;
      title: string;
      merchantName?: string;
      notes?: string;
      paymentMethod?: string;
    },
    onDone?: () => void
  ) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Creating expense from reviewed receipt...', 'info');

    this.api.createExpenseFromReceipt(this.token(), receiptId, payload).subscribe({
      next: ({ receipt }) => {
        this.loadExpenses();
        this.loadReceipts();
        this.currentReceipt.set(receipt);
        this.isSubmitting.set(false);
        this.showFeedback('Expense created from receipt successfully.', 'success');
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not create expense from receipt.', 'error');
      }
    });
  }

  updateProfile(
    payload: {
      name?: string;
      email?: string;
      preferredCurrency?: string;
      currentPassword?: string;
      newPassword?: string;
    },
    onDone?: () => void
  ) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Saving your profile...', 'info');

    this.api.updateProfile(this.token(), payload).subscribe({
      next: ({ user }) => {
        this.currentUser.set(user);
        localStorage.setItem('expense-user-name', user.name);
        localStorage.setItem('expense-preferred-currency', user.preferredCurrency);
        this.isSubmitting.set(false);
        this.showFeedback('Profile updated successfully.', 'success');
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not update profile.', 'error');
      }
    });
  }

  createPaymentMethod(payload: { name: string; lastFour?: string }, onDone?: () => void) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Adding payment method...', 'info');

    this.api.createPaymentMethod(this.token(), payload).subscribe({
      next: () => {
        this.loadPaymentMethods();
        this.isSubmitting.set(false);
        this.showFeedback('Payment method created successfully.', 'success');
        onDone?.();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not create payment method.', 'error');
      }
    });
  }

  deletePaymentMethod(id: string) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.showFeedback('Deleting payment method...', 'info');

    this.api.deletePaymentMethod(this.token(), id).subscribe({
      next: () => {
        this.loadPaymentMethods();
        this.isSubmitting.set(false);
        this.showFeedback('Payment method deleted successfully.', 'success');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showFeedback(error.error?.message ?? 'Could not delete payment method.', 'error');
      }
    });
  }

  logout() {
    localStorage.removeItem('expense-token');
    localStorage.removeItem('expense-user-name');
    localStorage.removeItem('expense-preferred-currency');
    this.token.set('');
    this.currentUser.set(null);
    this.categories.set([]);
    this.expenses.set([]);
    this.paymentMethods.set([]);
    this.receipts.set([]);
    this.currentReceipt.set(null);
    this.stopReceiptPolling();
    this.showFeedback('Logged out. You can sign in again anytime.', 'success');
  }

  dismissActionFeedback() {
    if (this.feedbackTimer !== null) {
      window.clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }

    this.actionFeedback.set(null);
  }

  formatCurrency(amount: number | string, currency: string) {
    const numericAmount = Number(amount);

    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
  }

  loadDashboardData() {
    this.loadProfile();
    this.loadCategories();
    this.loadExpenses();
    this.loadPaymentMethods();
    this.loadReceipts();
    this.isSubmitting.set(false);
  }

  loadReceiptsPageData() {
    this.loadCategories();
    this.loadPaymentMethods();
    this.loadReceipts();
  }

  private loadProfile() {
    if (!this.token()) {
      return;
    }

    this.api.getCurrentUser(this.token()).subscribe({
      next: ({ user }) => {
        this.currentUser.set(user);
        localStorage.setItem('expense-user-name', user.name);
        localStorage.setItem('expense-preferred-currency', user.preferredCurrency);
      },
      error: () => {
        this.showFeedback('Could not load profile settings.', 'error');
      }
    });
  }

  private loadCategories() {
    if (!this.token()) {
      return;
    }

    this.api.getCategories(this.token()).subscribe({
      next: ({ categories }) => {
        this.categories.set(categories);
      },
      error: () => {
        this.showFeedback('Could not load categories.', 'error');
      }
    });
  }

  private loadExpenses() {
    if (!this.token()) {
      return;
    }

    this.api.getExpenses(this.token()).subscribe({
      next: ({ expenses }) => {
        this.expenses.set(expenses);
      },
      error: () => {
        this.showFeedback('Could not load expenses.', 'error');
      }
    });
  }

  private loadPaymentMethods() {
    if (!this.token()) {
      return;
    }

    this.api.getPaymentMethods(this.token()).subscribe({
      next: ({ paymentMethods }) => {
        this.paymentMethods.set(paymentMethods);
      },
      error: () => {
        this.showFeedback('Could not load payment methods.', 'error');
      }
    });
  }

  private finishAuth(
    token: string,
    user: {
      id: string;
      name: string;
      email: string;
      preferredCurrency: string;
    }
  ) {
    localStorage.setItem('expense-token', token);
    localStorage.setItem('expense-user-name', user.name);
    localStorage.setItem('expense-preferred-currency', user.preferredCurrency);
    this.token.set(token);
    this.currentUser.set({
      ...user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    this.loadDashboardData();
  }

  private startReceiptPolling(receiptId: string) {
    this.stopReceiptPolling();

    this.receiptPollTimer = window.setTimeout(() => {
      this.loadReceipt(receiptId);
    }, 2500);
  }

  private stopReceiptPolling() {
    if (this.receiptPollTimer !== null) {
      window.clearTimeout(this.receiptPollTimer);
      this.receiptPollTimer = null;
    }
  }

  private showFeedback(message: string, tone: ActionFeedbackTone, durationMs = 1000) {
    this.statusMessage.set(message);
    this.actionFeedback.set({ message, tone });

    if (this.feedbackTimer !== null) {
      window.clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }

    if (durationMs > 0) {
      this.feedbackTimer = window.setTimeout(() => {
        this.actionFeedback.set(null);
        this.feedbackTimer = null;
      }, durationMs);
    }
  }
}
