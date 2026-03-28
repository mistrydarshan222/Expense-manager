import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Expense } from './api.types';
import { AppStore } from './app.store';

@Component({
  selector: 'app-dashboard-page',
  imports: [ReactiveFormsModule, DatePipe, NgClass],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss'
})
export class DashboardPageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);

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

  protected readonly receiptForm = this.fb.nonNullable.group({
    categoryId: ['', [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10)],
    title: [''],
    merchantName: [''],
    paymentMethod: [''],
    notes: [''],
    rawText: ['']
  });

  protected readonly selectedReceiptFile = signal<File | null>(null);

  protected readonly expenseForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    categoryId: ['', [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    finalAmount: [0, [Validators.required, Validators.min(0.01)]],
    merchantName: [''],
    paymentMethod: [''],
    notes: ['']
  });

  constructor() {
    effect(() => {
      const categories = this.store.categories();
      if (!this.expenseForm.value.categoryId && categories.length > 0) {
        this.expenseForm.patchValue({ categoryId: categories[0].id });
      }

      if (!this.receiptForm.value.categoryId && categories.length > 0) {
        this.receiptForm.patchValue({ categoryId: categories[0].id });
      }
    });

    effect(() => {
      const methods = this.store.paymentMethods();
      if (!this.expenseForm.value.paymentMethod && methods.length > 0) {
        this.expenseForm.patchValue({ paymentMethod: methods[0].name });
      }

      if (!this.receiptForm.value.paymentMethod && methods.length > 0) {
        this.receiptForm.patchValue({ paymentMethod: methods[0].name });
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

  protected onReceiptFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedReceiptFile.set(file);
  }

  protected processReceipt() {
    const formValue = this.receiptForm.getRawValue();
    const hasReceiptText = formValue.rawText.trim().length >= 10;
    const hasReceiptFile = this.selectedReceiptFile() !== null;

    if (!hasReceiptText && !hasReceiptFile) {
      this.store.statusMessage.set('Upload a receipt image or paste receipt text first.');
      return;
    }

    if (this.receiptForm.invalid) {
      this.receiptForm.markAllAsTouched();
      return;
    }

    this.store.processReceipt(
      {
        ...formValue,
        receiptFile: this.selectedReceiptFile()
      },
      () => this.resetReceiptForm()
    );
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
  }

  protected cancelEditExpense() {
    this.resetExpenseForm();
    this.store.statusMessage.set('Edit cancelled. You can add a new expense now.');
  }

  protected deleteExpense(expenseId: string) {
    this.store.deleteExpense(expenseId);
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

  protected resetReceiptForm() {
    this.selectedReceiptFile.set(null);
    this.receiptForm.patchValue({
      categoryId: this.store.categories()[0]?.id ?? '',
      expenseDate: new Date().toISOString().slice(0, 10),
      title: '',
      merchantName: '',
      paymentMethod: this.store.paymentMethods()[0]?.name ?? '',
      notes: '',
      rawText: ''
    });
  }
}
