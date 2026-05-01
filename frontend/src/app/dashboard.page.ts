import { DatePipe, DOCUMENT, NgClass } from '@angular/common';
import { AfterViewInit, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

import { Expense } from './api.types';
import { AppStore } from './app.store';
import { environment } from '../environments/environment';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              shape?: string;
              text?: string;
              width?: string | number;
              logo_alignment?: string;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-dashboard-page',
  imports: [ReactiveFormsModule, DatePipe, NgClass, RouterLink],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss'
})
export class DashboardPageComponent implements AfterViewInit {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly googleClientId = environment.googleClientId;
  private googleButtonsRendered = false;

  protected readonly activeTab = signal<'login' | 'register'>('login');
  protected readonly editingExpenseId = signal<string | null>(null);
  protected readonly isEditingExpense = computed(() => this.editingExpenseId() !== null);
  protected readonly isGoogleAuthEnabled = !!this.googleClientId;

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
  protected readonly mobileQuickExpenses = computed(() => this.store.expenses().slice(0, 4));
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

  ngAfterViewInit() {
    this.initializeGoogleButton();
  }

  protected setActiveTab(tab: 'login' | 'register') {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { auth: tab },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.store.statusMessage.set(
      tab === 'login'
        ? 'Login with your account to load categories and expenses.'
        : 'Create a new account and default categories will be added automatically.'
    );
  }

  protected continueWithGoogle() {
    const googleId = this.document.defaultView?.google?.accounts?.id;

    if (!this.isGoogleAuthEnabled || !googleId) {
      this.store.statusMessage.set('Google login is not configured yet.');
      return;
    }

    googleId.prompt();
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

  protected mobileQuickTitle(title: string | null | undefined) {
    const words = (title ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length <= 2) {
      return words.join(' ');
    }

    return words.slice(0, 2).join(' ');
  }

  protected mobileQuickIcon(expense: Expense) {
    return this.categoryIcon(expense.category?.name || 'Uncategorized');
  }

  protected mobileQuickIconClass(expense: Expense) {
    return this.categoryIconClass(expense.category?.name || 'Uncategorized');
  }

  protected categoryIcon(categoryName: string | null | undefined) {
    const category = (categoryName || '').trim().toLowerCase();

    if (category.includes('food') || category.includes('restaurant') || category.includes('grocery')) {
      return '🍽';
    }

    if (category.includes('bill') || category.includes('utility')) {
      return '🧾';
    }

    if (category.includes('entertainment') || category.includes('movie') || category.includes('game')) {
      return '🎬';
    }

    if (category.includes('health') || category.includes('medical') || category.includes('pharmacy')) {
      return '💊';
    }

    if (category.includes('shopping') || category.includes('retail')) {
      return '🛍';
    }

    if (category.includes('travel') || category.includes('trip') || category.includes('transport')) {
      return '✈';
    }

    if (category.includes('education') || category.includes('school') || category.includes('book')) {
      return '📚';
    }

    if (category.includes('salary') || category.includes('income')) {
      return '💼';
    }

    return '💳';
  }

  protected categoryIconClass(categoryName: string | null | undefined) {
    const category = (categoryName || '').trim().toLowerCase();

    if (category.includes('food') || category.includes('restaurant') || category.includes('grocery')) {
      return 'category-icon-food';
    }

    if (category.includes('bill') || category.includes('utility')) {
      return 'category-icon-bills';
    }

    if (category.includes('entertainment') || category.includes('movie') || category.includes('game')) {
      return 'category-icon-entertainment';
    }

    if (category.includes('health') || category.includes('medical') || category.includes('pharmacy')) {
      return 'category-icon-health';
    }

    if (category.includes('shopping') || category.includes('retail')) {
      return 'category-icon-shopping';
    }

    if (category.includes('travel') || category.includes('trip') || category.includes('transport')) {
      return 'category-icon-travel';
    }

    if (category.includes('education') || category.includes('school') || category.includes('book')) {
      return 'category-icon-education';
    }

    if (category.includes('salary') || category.includes('income')) {
      return 'category-icon-income';
    }

    return 'category-icon-default';
  }

  private initializeGoogleButton() {
    if (!this.isGoogleAuthEnabled || this.googleButtonsRendered) {
      return;
    }

    const tryRender = () => {
      const googleId = this.document.defaultView?.google?.accounts?.id;
      const loginContainer = this.document.getElementById('google-login-button');
      const registerContainer = this.document.getElementById('google-register-button');

      if (!googleId || !loginContainer || !registerContainer) {
        this.document.defaultView?.setTimeout(tryRender, 250);
        return;
      }

      googleId.initialize({
        client_id: this.googleClientId,
        callback: ({ credential }) => {
          if (!credential) {
            this.store.statusMessage.set('Google login did not return a credential.');
            return;
          }

          this.store.googleLogin(credential, () => {
            this.loginForm.reset({ email: '', password: '' });
            this.registerForm.reset({ name: '', email: '', password: '' });
            this.resetExpenseForm();
          });
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });

      loginContainer.innerHTML = '';
      registerContainer.innerHTML = '';

      for (const container of [loginContainer, registerContainer]) {
        googleId.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.max(220, Math.min(Math.floor(container.getBoundingClientRect().width || 0) - 2, 320)),
          logo_alignment: 'left'
        });
      }

      this.googleButtonsRendered = true;
    };

    tryRender();
  }
}
