import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AppStore } from './app.store';

@Component({
  selector: 'app-add-expense-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './add-expense.page.html',
  styleUrl: './add-expense.page.scss'
})
export class AddExpensePageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

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
    });

    effect(() => {
      const methods = this.store.paymentMethods();
      if (!this.expenseForm.value.paymentMethod && methods.length > 0) {
        this.expenseForm.patchValue({ paymentMethod: methods[0].name });
      }
    });
  }

  protected saveExpense() {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const formValue = this.expenseForm.getRawValue();

    this.store.createExpense(
      {
        ...formValue,
        finalAmount: Number(formValue.finalAmount),
        currency: this.store.preferredCurrency()
      },
      () => {
        this.router.navigateByUrl('/expenses');
      }
    );
  }
}
