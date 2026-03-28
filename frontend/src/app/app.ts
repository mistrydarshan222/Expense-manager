import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiService } from './api.service';
import { Category, Expense } from './api.types';

type CurrencyOption = {
  code: string;
  label: string;
};

const fallbackCurrencyOptions: CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'CAD', label: 'Canadian Dollar' },
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

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, DatePipe, NgClass],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);

  protected readonly currencyOptions: CurrencyOption[] = getCurrencyOptions();

  protected readonly token = signal(localStorage.getItem('expense-token') ?? '');
  protected readonly userName = signal(localStorage.getItem('expense-user-name') ?? '');
  protected readonly activeTab = signal<'login' | 'register'>('login');
  protected readonly categories = signal<Category[]>([]);
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly editingExpenseId = signal<string | null>(null);
  protected readonly statusMessage = signal('Ready to connect your expense manager.');
  protected readonly isSubmitting = signal(false);

  protected readonly registerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  protected readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  protected readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]]
  });

  protected readonly expenseForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    categoryId: ['', [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    finalAmount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['USD', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    merchantName: [''],
    paymentMethod: ['Cash'],
    notes: ['']
  });

  protected readonly totalSpent = computed(() =>
    this.expenses().reduce((sum, expense) => sum + Number(expense.finalAmount), 0)
  );

  protected readonly isEditingExpense = computed(() => this.editingExpenseId() !== null);

  protected readonly totalsByCurrency = computed(() => {
    const totals = new Map<string, number>();

    for (const expense of this.expenses()) {
      const currency = expense.currency || 'USD';
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

  protected setActiveTab(tab: 'login' | 'register') {
    this.activeTab.set(tab);
    this.statusMessage.set(
      tab === 'login'
        ? 'Login with your account to load categories and expenses.'
        : 'Create a new account and default categories will be added automatically.'
    );
  }

  protected register() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set('Creating your account and default categories...');

    this.api.register(this.registerForm.getRawValue()).subscribe({
      next: (response) => {
        this.finishAuth(response.token, response.user.name);
        this.registerForm.reset({ name: '', email: '', password: '' });
        this.statusMessage.set('Account created. Default categories are ready.');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(error.error?.message ?? 'Registration failed.');
      }
    });
  }

  protected login() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set('Signing in and loading your dashboard...');

    this.api.login(this.loginForm.getRawValue()).subscribe({
      next: (response) => {
        this.finishAuth(response.token, response.user.name);
        this.loginForm.reset({ email: '', password: '' });
        this.statusMessage.set('Login successful.');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(error.error?.message ?? 'Login failed.');
      }
    });
  }

  protected addCategory() {
    if (!this.token() || this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set('Adding a new category...');

    this.api.createCategory(this.token(), this.categoryForm.getRawValue().name).subscribe({
      next: () => {
        this.categoryForm.reset({ name: '' });
        this.loadCategories();
        this.isSubmitting.set(false);
        this.statusMessage.set('Category created successfully.');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(error.error?.message ?? 'Could not create category.');
      }
    });
  }

  protected addExpense() {
    if (!this.token() || this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set('Saving the expense...');

    const formValue = this.expenseForm.getRawValue();
    const payload = {
      ...formValue,
      finalAmount: Number(formValue.finalAmount)
    };
    const editingExpenseId = this.editingExpenseId();
    const request = editingExpenseId
      ? this.api.updateExpense(this.token(), editingExpenseId, payload)
      : this.api.createExpense(this.token(), payload);

    request.subscribe({
      next: () => {
        this.resetExpenseForm();
        this.loadExpenses();
        this.isSubmitting.set(false);
        this.statusMessage.set(editingExpenseId ? 'Expense updated successfully.' : 'Expense saved successfully.');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(
          error.error?.message ?? (editingExpenseId ? 'Could not update the expense.' : 'Could not save the expense.')
        );
      }
    });
  }

  protected startEditExpense(expense: Expense) {
    this.editingExpenseId.set(expense.id);
    this.expenseForm.patchValue({
      title: expense.title,
      categoryId: expense.categoryId ?? '',
      expenseDate: expense.expenseDate.slice(0, 10),
      finalAmount: Number(expense.finalAmount),
      currency: expense.currency || 'USD',
      merchantName: expense.merchantName ?? '',
      paymentMethod: expense.paymentMethod ?? 'Cash',
      notes: expense.notes ?? ''
    });
    this.statusMessage.set(`Editing "${expense.title}". Update any field and save.`);
  }

  protected cancelEditExpense() {
    this.resetExpenseForm();
    this.statusMessage.set('Edit cancelled. You can add a new expense now.');
  }

  protected deleteExpense(expenseId: string) {
    if (!this.token()) {
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set('Deleting the expense...');

    this.api.deleteExpense(this.token(), expenseId).subscribe({
      next: () => {
        this.loadExpenses();
        this.isSubmitting.set(false);
        this.statusMessage.set('Expense deleted successfully.');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(error.error?.message ?? 'Could not delete the expense.');
      }
    });
  }

  protected logout() {
    localStorage.removeItem('expense-token');
    localStorage.removeItem('expense-user-name');
    this.token.set('');
    this.userName.set('');
    this.categories.set([]);
    this.expenses.set([]);
    this.editingExpenseId.set(null);
    this.statusMessage.set('Logged out. You can sign in again anytime.');
  }

  protected formatCurrency(amount: number | string, currency: string) {
    const numericAmount = Number(amount);

    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
  }

  private resetExpenseForm() {
    this.editingExpenseId.set(null);
    this.expenseForm.patchValue({
      title: '',
      categoryId: this.categories()[0]?.id ?? '',
      expenseDate: new Date().toISOString().slice(0, 10),
      finalAmount: 0,
      currency: 'USD',
      merchantName: '',
      paymentMethod: 'Cash',
      notes: ''
    });
  }

  private finishAuth(token: string, name: string) {
    localStorage.setItem('expense-token', token);
    localStorage.setItem('expense-user-name', name);
    this.token.set(token);
    this.userName.set(name);
    this.loadDashboardData();
  }

  private loadDashboardData() {
    this.loadCategories();
    this.loadExpenses();
    this.isSubmitting.set(false);
  }

  private loadCategories() {
    if (!this.token()) {
      return;
    }

    this.api.getCategories(this.token()).subscribe({
      next: ({ categories }) => {
        this.categories.set(categories);
        if (!this.expenseForm.value.categoryId && categories.length > 0) {
          this.expenseForm.patchValue({ categoryId: categories[0].id });
        }
      },
      error: () => {
        this.statusMessage.set('Could not load categories.');
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
        this.statusMessage.set('Could not load expenses.');
      }
    });
  }
}
