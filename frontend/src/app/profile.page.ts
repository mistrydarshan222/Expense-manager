import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AppStore } from './app.store';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss'
})
export class ProfilePageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  protected readonly editingPaymentMethodId = signal<string | null>(null);
  protected readonly swipingPaymentMethodId = signal<string | null>(null);
  protected readonly paymentMethodSwipeOffset = signal(0);
  protected readonly isPaymentMethodModalOpen = computed(() => this.editingPaymentMethodId() !== null);
  private paymentTouchStartX = 0;
  private paymentTouchCurrentX = 0;
  private paymentTouchMoved = false;

  protected readonly profileForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    preferredCurrency: ['USD', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    currentPassword: [''],
    newPassword: ['']
  });

  protected readonly paymentMethodForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    lastFour: ['']
  });

  constructor() {
    effect(() => {
      const user = this.store.currentUser();

      if (!user) {
        return;
      }

      this.profileForm.patchValue({
        name: user.name,
        email: user.email,
        preferredCurrency: user.preferredCurrency,
        currentPassword: '',
        newPassword: ''
      });
    });
  }

  protected saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const formValue = this.profileForm.getRawValue();

    const payload: {
      name?: string;
      email?: string;
      preferredCurrency?: string;
      currentPassword?: string;
      newPassword?: string;
    } = {
      name: formValue.name,
      email: formValue.email,
      preferredCurrency: formValue.preferredCurrency
    };

    if (formValue.currentPassword && formValue.newPassword) {
      payload.currentPassword = formValue.currentPassword;
      payload.newPassword = formValue.newPassword;
    }

    this.store.updateProfile(payload, () => {
      this.profileForm.patchValue({
        currentPassword: '',
        newPassword: ''
      });
    });
  }

  protected addPaymentMethod() {
    if (this.paymentMethodForm.invalid) {
      this.paymentMethodForm.markAllAsTouched();
      return;
    }

    const editingId = this.editingPaymentMethodId();

    if (editingId) {
      this.store.updatePaymentMethod(editingId, this.paymentMethodForm.getRawValue(), () => {
        this.resetPaymentMethodForm();
      });
      return;
    }

    this.store.createPaymentMethod(this.paymentMethodForm.getRawValue(), () => {
      this.resetPaymentMethodForm();
    });
  }

  protected deletePaymentMethod(id: string) {
    this.store.deletePaymentMethod(id);
  }

  protected startEditPaymentMethod(method: { id: string; name: string; lastFour: string | null }) {
    this.editingPaymentMethodId.set(method.id);
    this.resetPaymentMethodSwipeState();
    this.paymentMethodForm.patchValue({
      name: method.name,
      lastFour: method.lastFour ?? ''
    });
  }

  protected cancelEditPaymentMethod() {
    this.resetPaymentMethodForm();
  }

  protected beginPaymentMethodSwipe(event: TouchEvent, id: string) {
    this.swipingPaymentMethodId.set(id);
    this.paymentTouchStartX = event.touches[0]?.clientX ?? 0;
    this.paymentTouchCurrentX = this.paymentTouchStartX;
    this.paymentTouchMoved = false;
    this.paymentMethodSwipeOffset.set(0);
  }

  protected updatePaymentMethodSwipe(event: TouchEvent) {
    if (!this.swipingPaymentMethodId()) {
      return;
    }

    this.paymentTouchCurrentX = event.touches[0]?.clientX ?? this.paymentTouchStartX;
    const deltaX = this.paymentTouchCurrentX - this.paymentTouchStartX;

    if (Math.abs(deltaX) > 8) {
      this.paymentTouchMoved = true;
    }

    this.paymentMethodSwipeOffset.set(Math.min(0, Math.max(deltaX, -112)));
  }

  protected endPaymentMethodSwipe(method: { id: string; name: string; lastFour: string | null }) {
    if (!this.swipingPaymentMethodId()) {
      return;
    }

    const deltaX = this.paymentTouchCurrentX - this.paymentTouchStartX;

    if (deltaX <= -88) {
      this.deletePaymentMethod(method.id);
      this.resetPaymentMethodSwipeState();
      return;
    }

    if (!this.paymentTouchMoved || Math.abs(deltaX) < 10) {
      this.startEditPaymentMethod(method);
    }

    this.resetPaymentMethodSwipeState();
  }

  protected currentPaymentMethodSwipeOffset(id: string) {
    return this.swipingPaymentMethodId() === id ? this.paymentMethodSwipeOffset() : 0;
  }

  protected userInitials() {
    const name = this.store.currentUser()?.name?.trim() || 'User';
    const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U';
  }

  protected paymentMethodKind(name: string) {
    const value = name.toLowerCase();

    if (value.includes('cash')) {
      return 'Cash';
    }

    if (
      value.includes('visa') ||
      value.includes('mastercard') ||
      value.includes('amex') ||
      value.includes('credit') ||
      value.includes('debit') ||
      value.includes('card')
    ) {
      return 'Card';
    }

    if (value.includes('bank') || value.includes('transfer') || value.includes('wire') || value.includes('upi')) {
      return 'Bank';
    }

    return 'Custom';
  }

  protected paymentMethodIcon(name: string) {
    const value = name.toLowerCase();

    if (value.includes('cash')) {
      return 'CA';
    }

    if (
      value.includes('visa') ||
      value.includes('mastercard') ||
      value.includes('amex') ||
      value.includes('credit') ||
      value.includes('debit') ||
      value.includes('card')
    ) {
      return 'CR';
    }

    if (value.includes('bank') || value.includes('transfer') || value.includes('wire') || value.includes('upi')) {
      return 'BK';
    }

    return 'PM';
  }

  private resetPaymentMethodForm() {
    this.editingPaymentMethodId.set(null);
    this.paymentMethodForm.reset({ name: '', lastFour: '' });
  }

  private resetPaymentMethodSwipeState() {
    this.swipingPaymentMethodId.set(null);
    this.paymentMethodSwipeOffset.set(0);
    this.paymentTouchStartX = 0;
    this.paymentTouchCurrentX = 0;
    this.paymentTouchMoved = false;
  }
}
