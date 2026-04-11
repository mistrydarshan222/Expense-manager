import { DatePipe, DOCUMENT, NgClass } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

import { Expense } from './api.types';
import { AppStore } from './app.store';

@Component({
  selector: 'app-dashboard-page',
  imports: [ReactiveFormsModule, DatePipe, NgClass, RouterLink],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss'
})
export class DashboardPageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly activeTab = signal<'login' | 'register'>('login');
  protected readonly editingExpenseId = signal<string | null>(null);
  protected readonly isEditingExpense = computed(() => this.editingExpenseId() !== null);

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
    merchantName: [''],
    paymentMethod: [''],
    notes: ['']
  });

  protected readonly expenseFilterForm = this.fb.nonNullable.group({
    search: [''],
    categoryId: ['all'],
    paymentMethod: ['all'],
    currency: ['all']
  });

  private readonly expenseFilters = toSignal(
    this.expenseFilterForm.valueChanges.pipe(startWith(this.expenseFilterForm.getRawValue())),
    { initialValue: this.expenseFilterForm.getRawValue() }
  );

  protected readonly filteredExpenses = computed(() => {
    const { search = '', categoryId = 'all', paymentMethod = 'all', currency = 'all' } = this.expenseFilters();
    const searchValue = search.trim().toLowerCase();

    return this.store.expenses().filter((expense) => {
      const matchesSearch =
        !searchValue ||
        expense.title.toLowerCase().includes(searchValue) ||
        (expense.merchantName ?? '').toLowerCase().includes(searchValue) ||
        (expense.notes ?? '').toLowerCase().includes(searchValue);

      const matchesCategory = categoryId === 'all' || expense.categoryId === categoryId;
      const matchesPaymentMethod = paymentMethod === 'all' || (expense.paymentMethod ?? '') === paymentMethod;
      const matchesCurrency = currency === 'all' || expense.currency === currency;

      return matchesSearch && matchesCategory && matchesPaymentMethod && matchesCurrency;
    });
  });

  protected readonly recentExpensePreview = computed(() => this.filteredExpenses().slice(0, 5));
  protected readonly desktopRecentExpenses = computed(() => this.store.expenses().slice(0, 6));
  protected readonly mobileMonthSpent = computed(() => {
    const now = new Date();

    return this.store.expenses()
      .filter((expense) => {
        const expenseDate = new Date(expense.expenseDate);
        return expenseDate.getFullYear() === now.getFullYear() && expenseDate.getMonth() === now.getMonth();
      })
      .reduce((sum, expense) => sum + Number(expense.finalAmount), 0);
  });
  protected readonly mobileCategoryBreakdown = computed(() => {
    const totals = new Map<string, { amount: number; expenseDate: string }>();

    for (const expense of this.store.expenses()) {
      const key = expense.category?.name || 'Other';
      const current = totals.get(key);
      const nextAmount = (current?.amount ?? 0) + Number(expense.finalAmount);
      const nextDate = current?.expenseDate && new Date(current.expenseDate) > new Date(expense.expenseDate)
        ? current.expenseDate
        : expense.expenseDate;

      totals.set(key, {
        amount: nextAmount,
        expenseDate: nextDate
      });
    }

    const totalAmount = Array.from(totals.values()).reduce((sum, item) => sum + item.amount, 0) || 1;
    const colors = ['#58D68D', '#7EDC98', '#86E0D2', '#2EC4B6', '#BFEFDF'];

    return Array.from(totals.entries())
      .map(([name, value], index) => ({
        name,
        amount: value.amount,
        expenseDate: value.expenseDate,
        ratio: Math.max(0.12, value.amount / totalAmount),
        color: colors[index % colors.length]
      }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 4);
  });
  protected readonly mobileDonutBackground = computed(() => {
    const breakdown = this.mobileCategoryBreakdown();

    if (breakdown.length === 0) {
      return 'conic-gradient(#DCFCE7 0deg 360deg)';
    }

    let currentAngle = 0;
    const segments = breakdown.map((item) => {
      const angle = item.ratio * 360;
      const segment = `${item.color} ${currentAngle}deg ${currentAngle + angle}deg`;
      currentAngle += angle;
      return segment;
    });

    if (currentAngle < 360) {
      segments.push(`#E5E7EB ${currentAngle}deg 360deg`);
    }

    return `conic-gradient(${segments.join(', ')})`;
  });
  protected readonly desktopMonthlyTrend = computed(() => {
    const now = new Date();
    const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });

    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const amount = this.store.expenses()
        .filter((expense) => {
          const expenseDate = new Date(expense.expenseDate);
          return expenseDate.getFullYear() === date.getFullYear() && expenseDate.getMonth() === date.getMonth();
        })
        .reduce((sum, expense) => sum + Number(expense.finalAmount), 0);

      return {
        label: monthFormatter.format(date),
        amount
      };
    });
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const authTab = params.get('auth');

      if (authTab === 'register') {
        this.activeTab.set('register');
        return;
      }

      if (authTab === 'login') {
        this.activeTab.set('login');
      }
    });

    effect(() => {
      const categories = this.store.categories();
      if (!this.expenseForm.value.categoryId && categories.length > 0) {
        this.expenseForm.patchValue({ categoryId: categories[0].id });
      }
    });

    effect(() => {
      const methods = this.store.paymentMethods();
      if (!this.expenseForm.value.paymentMethod && methods.length > 0) {
        this.expenseForm.patchValue({ paymentMethod: methods[0].name });
      }
    });
  }

  protected setActiveTab(tab: 'login' | 'register') {
    this.activeTab.set(tab);
    this.store.statusMessage.set(
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

    this.store.register(this.registerForm.getRawValue(), () => {
      this.registerForm.reset({ name: '', email: '', password: '' });
      this.resetExpenseForm();
    });
  }

  protected login() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.store.login(this.loginForm.getRawValue(), () => {
      this.loginForm.reset({ email: '', password: '' });
      this.resetExpenseForm();
    });
  }

  protected addCategory() {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.store.createCategory(this.categoryForm.getRawValue().name, () => {
      this.categoryForm.reset({ name: '' });
      if (!this.expenseForm.value.categoryId && this.store.categories().length > 0) {
        this.expenseForm.patchValue({ categoryId: this.store.categories()[0].id });
      }
    });
  }

  protected addExpense() {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const formValue = this.expenseForm.getRawValue();
    const payload = {
      ...formValue,
      finalAmount: Number(formValue.finalAmount),
      currency: this.store.preferredCurrency()
    };

    const editingExpenseId = this.editingExpenseId();

    if (editingExpenseId) {
      this.store.updateExpense(editingExpenseId, payload, () => this.resetExpenseForm());
      return;
    }

    this.store.createExpense(payload, () => this.resetExpenseForm());
  }

  protected startEditExpense(expense: Expense) {
    this.editingExpenseId.set(expense.id);
    this.expenseForm.patchValue({
      title: expense.title,
      categoryId: expense.categoryId ?? '',
      expenseDate: expense.expenseDate.slice(0, 10),
      finalAmount: Number(expense.finalAmount),
      merchantName: expense.merchantName ?? '',
      paymentMethod: expense.paymentMethod ?? this.store.paymentMethods()[0]?.name ?? '',
      notes: expense.notes ?? ''
    });
    this.store.statusMessage.set(`Editing "${expense.title}". Update any field and save.`);
    queueMicrotask(() => {
      const expenseSection = this.document.getElementById('expenses');
      expenseSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const titleInput = expenseSection?.querySelector('input[formcontrolname="title"]') as HTMLInputElement | null;
      titleInput?.focus();
      titleInput?.select();
    });
  }

  protected cancelEditExpense() {
    this.resetExpenseForm();
    this.store.statusMessage.set('Edit cancelled. You can add a new expense now.');
  }

  protected deleteExpense(expenseId: string) {
    this.store.deleteExpense(expenseId);
  }

  protected clearExpenseFilters() {
    this.expenseFilterForm.reset({
      search: '',
      categoryId: 'all',
      paymentMethod: 'all',
      currency: 'all'
    });
  }

  protected paymentMethodClass(method: string | null) {
    const value = (method ?? '').toLowerCase();

    if (value.includes('cash')) {
      return 'method-badge-cash';
    }

    if (
      value.includes('visa') ||
      value.includes('mastercard') ||
      value.includes('amex') ||
      value.includes('credit') ||
      value.includes('debit') ||
      value.includes('card')
    ) {
      return 'method-badge-card';
    }

    if (
      value.includes('bank') ||
      value.includes('transfer') ||
      value.includes('wire') ||
      value.includes('upi')
    ) {
      return 'method-badge-bank';
    }

    return 'method-badge-default';
  }

  protected resetExpenseForm() {
    this.editingExpenseId.set(null);
    this.expenseForm.patchValue({
      title: '',
      categoryId: this.store.categories()[0]?.id ?? '',
      expenseDate: new Date().toISOString().slice(0, 10),
      finalAmount: 0,
      merchantName: '',
      paymentMethod: this.store.paymentMethods()[0]?.name ?? '',
      notes: ''
    });
  }

  protected openAddExpensePage() {
    this.router.navigateByUrl('/expenses/new');
  }

  protected monthlyBarHeight(amount: number) {
    return Math.max(18, amount / 20);
  }
}
