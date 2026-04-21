import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { Receipt } from './api.types';
import { AppStore } from './app.store';

@Component({
  selector: 'app-receipts-page',
  imports: [ReactiveFormsModule, DatePipe, NgClass],
  templateUrl: './receipts.page.html',
  styleUrl: './receipts.page.scss'
})
export class ReceiptsPageComponent {
  private readonly estimatedProcessingSeconds = 20;
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  protected readonly selectedReceiptFile = signal<File | null>(null);
  protected readonly processingNow = signal(Date.now());
  protected readonly pendingReceiptContext = signal<{
    title: string;
    categoryId: string;
    expenseDate: string;
    paymentMethod: string;
    merchantName: string;
    notes: string;
    fileName: string | null;
  } | null>(null);
  protected readonly recentReceipts = computed(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    return this.store
      .receipts()
      .filter((receipt) => new Date(receipt.createdAt).getTime() >= cutoff)
      .slice(0, 5);
  });

  protected readonly reviewForm = this.fb.nonNullable.group({
    categoryId: ['', [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    title: ['', [Validators.required, Validators.minLength(2)]],
    merchantName: [''],
    paymentMethod: [''],
    notes: ['']
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

  constructor() {
    this.store.loadReceiptsPageData();
    window.setInterval(() => {
      this.processingNow.set(Date.now());
    }, 1000);

    effect(() => {
      const categories = this.store.categories();
      if (!this.receiptForm.value.categoryId && categories.length > 0) {
        this.receiptForm.patchValue({ categoryId: categories[0].id });
      }
    });

    effect(() => {
      const currentReceipt = this.store.currentReceipt();
      const receipts = this.recentReceipts();

      if (!currentReceipt && receipts.length > 0) {
        this.openReceipt(receipts[0]);
        return;
      }

      if (!currentReceipt) {
        return;
      }

      if (currentReceipt.status !== 'queued' && currentReceipt.status !== 'processing') {
        this.pendingReceiptContext.set(null);
      }

      const matchedPaymentMethod =
        currentReceipt.paymentMethod ||
        this.matchPaymentMethodFromReceiptText(currentReceipt.ocrRawText);

      this.reviewForm.patchValue({
        categoryId: currentReceipt.categoryId ?? this.store.categories()[0]?.id ?? '',
        expenseDate: currentReceipt.expenseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        title: currentReceipt.title ?? currentReceipt.merchantName ?? 'Receipt expense',
        merchantName: currentReceipt.merchantName ?? '',
        paymentMethod: matchedPaymentMethod ?? this.store.paymentMethods()[0]?.name ?? '',
        notes: currentReceipt.notes ?? ''
      });
    });
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

    this.pendingReceiptContext.set({
      title: formValue.title.trim(),
      categoryId: formValue.categoryId,
      expenseDate: formValue.expenseDate || new Date().toISOString().slice(0, 10),
      paymentMethod: formValue.paymentMethod,
      merchantName: formValue.merchantName.trim(),
      notes: formValue.notes.trim(),
      fileName: this.selectedReceiptFile()?.name ?? null
    });

    this.store.queueReceipt(
      {
        ...formValue,
        receiptFile: this.selectedReceiptFile()
      },
      () => {
        this.resetReceiptForm();
        this.store.loadReceiptsPageData();
      }
    );
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

    this.store.createExpenseFromReceipt(receipt.id, this.reviewForm.getRawValue(), () => {
      void this.router.navigateByUrl('/');
    });
  }

  protected cancelReview() {
    void this.router.navigateByUrl('/');
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

  protected processingPreviewTitle(receipt: Receipt) {
    const pending = this.pendingReceiptContext();

    return (
      receipt.title?.trim() ||
      receipt.merchantName?.trim() ||
      pending?.title ||
      pending?.merchantName ||
      pending?.fileName?.replace(/\.[^.]+$/, '') ||
      'Receipt scan in progress'
    );
  }

  protected processingPreviewCategory() {
    const pending = this.pendingReceiptContext();
    const categoryId = pending?.categoryId || this.reviewForm.getRawValue().categoryId;

    return this.store.categories().find((category) => category.id === categoryId)?.name ?? 'Selected category';
  }

  protected categoryNameById(categoryId: string | null | undefined) {
    if (!categoryId) {
      return 'Not selected';
    }

    return this.store.categories().find((category) => category.id === categoryId)?.name ?? 'Not selected';
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
      return 'receipt-category-icon-food';
    }

    if (category.includes('bill') || category.includes('utility')) {
      return 'receipt-category-icon-bills';
    }

    if (category.includes('entertainment') || category.includes('movie') || category.includes('game')) {
      return 'receipt-category-icon-entertainment';
    }

    if (category.includes('health') || category.includes('medical') || category.includes('pharmacy')) {
      return 'receipt-category-icon-health';
    }

    if (category.includes('shopping') || category.includes('retail')) {
      return 'receipt-category-icon-shopping';
    }

    if (category.includes('travel') || category.includes('trip') || category.includes('transport')) {
      return 'receipt-category-icon-travel';
    }

    if (category.includes('education') || category.includes('school') || category.includes('book')) {
      return 'receipt-category-icon-education';
    }

    if (category.includes('salary') || category.includes('income')) {
      return 'receipt-category-icon-income';
    }

    return 'receipt-category-icon-default';
  }

  protected processingPreviewDate() {
    const pending = this.pendingReceiptContext();
    return pending?.expenseDate || this.reviewForm.getRawValue().expenseDate || new Date().toISOString().slice(0, 10);
  }

  protected processingPreviewPaymentMethod() {
    const pending = this.pendingReceiptContext();
    return pending?.paymentMethod || this.reviewForm.getRawValue().paymentMethod || 'Detecting payment method';
  }

  protected processingPreviewMerchant() {
    const pending = this.pendingReceiptContext();
    return pending?.merchantName || 'Detecting merchant';
  }

  protected processingPreviewNote() {
    const pending = this.pendingReceiptContext();
    return pending?.notes || 'We will keep your selected details ready while extraction finishes.';
  }

  protected processingCountdownLabel(receipt: Receipt) {
    this.processingNow();

    const startedAt = new Date(receipt.createdAt).getTime();
    if (!Number.isFinite(startedAt)) {
      return '~20s';
    }

    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remainingSeconds = Math.max(0, this.estimatedProcessingSeconds - elapsedSeconds);

    if (remainingSeconds > 0) {
      return `~${remainingSeconds}s`;
    }

    return 'Finalizing...';
  }

  protected processingCountdownNote(receipt: Receipt) {
    this.processingNow();

    const startedAt = new Date(receipt.createdAt).getTime();
    if (!Number.isFinite(startedAt)) {
      return 'We are preparing your receipt review.';
    }

    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    if (elapsedSeconds < this.estimatedProcessingSeconds) {
      return `Usually ready in about ${this.estimatedProcessingSeconds} seconds.`;
    }

    return 'This one is taking a little longer than usual, but we are still processing it.';
  }

  protected receiptDisplayName(receipt: Receipt) {
    const title = receipt.title?.trim();
    const merchantName = receipt.merchantName?.trim();

    if (title) {
      return title;
    }

    if (merchantName) {
      return merchantName;
    }

    if (receipt.status === 'queued') {
      return 'Receipt added to queue';
    }

    if (receipt.status === 'processing') {
      return 'Receipt scan in progress';
    }

    if (receipt.status === 'failed') {
      return 'Receipt needs review';
    }

    return 'Scanned receipt';
  }

  protected resetReceiptForm() {
    this.selectedReceiptFile.set(null);
    this.receiptForm.patchValue({
      categoryId: this.store.categories()[0]?.id ?? '',
      expenseDate: new Date().toISOString().slice(0, 10),
      title: '',
      merchantName: '',
      paymentMethod: '',
      notes: '',
      rawText: ''
    });
  }

  private matchPaymentMethodFromReceiptText(ocrText: string | null) {
    if (!ocrText) {
      return null;
    }

    const patterns = [
      /\b(?:mastercard|master card|visa|debit|credit|amex|american express)[^\n]*?(\d{4})\b/i,
      /\b(?:card|mcard|mcard tend)[^\n]*?(\d{4})\b/i,
      /(?:\*{2,}|x{2,}|%{2,})[\s*%x]*(\d{4})\b/i
    ];

    let lastFour: string | null = null;

    for (const pattern of patterns) {
      const match = ocrText.match(pattern);
      if (match?.[1]) {
        lastFour = match[1];
        break;
      }
    }

    if (!lastFour) {
      return null;
    }

    return this.store.paymentMethods().find((method) => method.lastFour === lastFour)?.name ?? null;
  }
}
