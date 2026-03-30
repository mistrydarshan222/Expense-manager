import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

import { AppStore } from './app.store';

type TimeRange = 'all' | 'lastMonth' | 'thisMonth' | 'thisWeek' | 'today';

@Component({
  selector: 'app-expenses-page',
  imports: [ReactiveFormsModule, DatePipe, NgClass],
  templateUrl: './expenses.page.html',
  styleUrl: './expenses.page.scss'
})
export class ExpensesPageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);

  protected readonly filterForm = this.fb.nonNullable.group({
    timeRange: ['all' as TimeRange],
    search: [''],
    categoryId: ['all'],
    paymentMethod: ['all'],
    currency: ['all']
  });

  private readonly filters = toSignal(
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.getRawValue())),
    { initialValue: this.filterForm.getRawValue() }
  );

  protected readonly filteredExpenses = computed(() => {
    const {
      timeRange = 'all',
      search = '',
      categoryId = 'all',
      paymentMethod = 'all',
      currency = 'all'
    } = this.filters();
    const searchValue = search.trim().toLowerCase();

    return this.store.expenses().filter((expense) => {
      const expenseDate = new Date(expense.expenseDate);

      const matchesTimeRange = this.matchesTimeRange(expenseDate, timeRange);
      const matchesSearch =
        !searchValue ||
        expense.title.toLowerCase().includes(searchValue) ||
        (expense.merchantName ?? '').toLowerCase().includes(searchValue) ||
        (expense.notes ?? '').toLowerCase().includes(searchValue);
      const matchesCategory = categoryId === 'all' || expense.categoryId === categoryId;
      const matchesPaymentMethod = paymentMethod === 'all' || (expense.paymentMethod ?? '') === paymentMethod;
      const matchesCurrency = currency === 'all' || expense.currency === currency;

      return matchesTimeRange && matchesSearch && matchesCategory && matchesPaymentMethod && matchesCurrency;
    });
  });

  protected readonly filteredTotalsByCurrency = computed(() => {
    const totals = new Map<string, number>();

    for (const expense of this.filteredExpenses()) {
      const currency = expense.currency || 'USD';
      totals.set(currency, (totals.get(currency) ?? 0) + Number(expense.finalAmount));
    }

    return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount }));
  });

  protected setTimeRange(timeRange: TimeRange) {
    this.filterForm.patchValue({ timeRange });
  }

  protected clearFilters() {
    this.filterForm.reset({
      timeRange: 'all',
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

  private matchesTimeRange(expenseDate: Date, timeRange: TimeRange) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    switch (timeRange) {
      case 'today':
        return expenseDate >= startOfToday && expenseDate < startOfTomorrow;
      case 'thisWeek': {
        const weekday = startOfToday.getDay();
        const diffToMonday = weekday === 0 ? 6 : weekday - 1;
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - diffToMonday);
        return expenseDate >= startOfWeek && expenseDate < startOfTomorrow;
      }
      case 'thisMonth': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return expenseDate >= startOfMonth && expenseDate < startOfTomorrow;
      }
      case 'lastMonth': {
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return expenseDate >= startOfLastMonth && expenseDate < startOfCurrentMonth;
      }
      case 'all':
      default:
        return true;
    }
  }
}
