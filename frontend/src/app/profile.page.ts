import { Component, effect, inject } from '@angular/core';
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

    this.store.createPaymentMethod(this.paymentMethodForm.getRawValue(), () => {
      this.paymentMethodForm.reset({ name: '', lastFour: '' });
    });
  }

  protected deletePaymentMethod(id: string) {
    this.store.deletePaymentMethod(id);
  }
}
