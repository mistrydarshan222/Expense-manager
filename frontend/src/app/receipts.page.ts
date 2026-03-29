import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Receipt } from './api.types';
import { AppStore } from './app.store';

@Component({
  selector: 'app-receipts-page',
  imports: [ReactiveFormsModule],
  templateUrl: './receipts.page.html',
  styleUrl: './receipts.page.scss'
})
export class ReceiptsPageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);

  protected readonly reviewForm = this.fb.nonNullable.group({
    categoryId: ['', [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    title: ['', [Validators.required, Validators.minLength(2)]],
    merchantName: [''],
    paymentMethod: [''],
    notes: ['']
  });

  constructor() {
    this.store.loadReceipts();

    effect(() => {
      const currentReceipt = this.store.currentReceipt();
      const receipts = this.store.receipts();

      if (!currentReceipt && receipts.length > 0) {
        this.openReceipt(receipts[0]);
        return;
      }

      if (!currentReceipt) {
        return;
      }

      this.reviewForm.patchValue({
        categoryId: currentReceipt.categoryId ?? this.store.categories()[0]?.id ?? '',
        expenseDate: currentReceipt.expenseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        title: currentReceipt.title ?? currentReceipt.merchantName ?? 'Receipt expense',
        merchantName: currentReceipt.merchantName ?? '',
        paymentMethod: currentReceipt.paymentMethod ?? this.store.paymentMethods()[0]?.name ?? '',
        notes: currentReceipt.notes ?? ''
      });
    });
  }

  protected openReceipt(receipt: Receipt) {
    this.store.loadReceipt(receipt.id);
  }

  protected createExpenseFromReceipt() {
    const receipt = this.store.currentReceipt();
    if (!receipt) {
      return;
    }

    if (this.reviewForm.invalid) {
      this.reviewForm.markAllAsTouched();
      return;
    }

    this.store.createExpenseFromReceipt(receipt.id, this.reviewForm.getRawValue());
  }

  protected amountForReview(receipt: Receipt) {
    const total = receipt.extractedTotal ? Number(receipt.extractedTotal) : null;
    const subtotal = receipt.extractedSubtotal ? Number(receipt.extractedSubtotal) : null;
    const tax = receipt.extractedTax ? Number(receipt.extractedTax) : null;

    if (total !== null) {
      return total;
    }

    if (subtotal !== null && tax !== null) {
      return subtotal + tax;
    }

    return subtotal ?? 0;
  }
}
