import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthResponse, Category, CurrentUser, Expense, PaymentMethod, Receipt } from './api.types';

type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type ExpensePayload = {
  title: string;
  categoryId: string;
  expenseDate: string;
  finalAmount: number;
  currency: string;
  merchantName?: string;
  notes?: string;
  paymentMethod?: string;
};

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:5000/api';

  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register`, payload);
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, payload);
  }

  getCurrentUser(token: string): Observable<{ user: CurrentUser }> {
    return this.http.get<{ user: CurrentUser }>(`${this.baseUrl}/auth/me`, {
      headers: this.authHeaders(token)
    });
  }

  getCategories(token: string): Observable<{ categories: Category[] }> {
    return this.http.get<{ categories: Category[] }>(`${this.baseUrl}/categories`, {
      headers: this.authHeaders(token)
    });
  }

  createCategory(token: string, name: string): Observable<{ category: Category; message: string }> {
    return this.http.post<{ category: Category; message: string }>(
      `${this.baseUrl}/categories`,
      { name },
      { headers: this.authHeaders(token) }
    );
  }

  getExpenses(token: string): Observable<{ expenses: Expense[] }> {
    return this.http.get<{ expenses: Expense[] }>(`${this.baseUrl}/expenses`, {
      headers: this.authHeaders(token)
    });
  }

  createExpense(
    token: string,
    payload: ExpensePayload
  ): Observable<{ expense: Expense; message: string }> {
    return this.http.post<{ expense: Expense; message: string }>(
      `${this.baseUrl}/expenses`,
      payload,
      { headers: this.authHeaders(token) }
    );
  }

  updateExpense(
    token: string,
    expenseId: string,
    payload: ExpensePayload
  ): Observable<{ expense: Expense; message: string }> {
    return this.http.put<{ expense: Expense; message: string }>(
      `${this.baseUrl}/expenses/${expenseId}`,
      payload,
      { headers: this.authHeaders(token) }
    );
  }

  deleteExpense(token: string, expenseId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/expenses/${expenseId}`, {
      headers: this.authHeaders(token)
    });
  }

  getPaymentMethods(token: string): Observable<{ paymentMethods: PaymentMethod[] }> {
    return this.http.get<{ paymentMethods: PaymentMethod[] }>(`${this.baseUrl}/payment-methods`, {
      headers: this.authHeaders(token)
    });
  }

  createPaymentMethod(
    token: string,
    payload: { name: string; lastFour?: string }
  ): Observable<{ message: string; paymentMethod: PaymentMethod }> {
    return this.http.post<{ message: string; paymentMethod: PaymentMethod }>(
      `${this.baseUrl}/payment-methods`,
      payload,
      { headers: this.authHeaders(token) }
    );
  }

  deletePaymentMethod(token: string, id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/payment-methods/${id}`, {
      headers: this.authHeaders(token)
    });
  }

  updatePreferences(
    token: string,
    preferredCurrency: string
  ): Observable<{ message: string; user: CurrentUser }> {
    return this.http.patch<{ message: string; user: CurrentUser }>(
      `${this.baseUrl}/users/preferences`,
      { preferredCurrency },
      { headers: this.authHeaders(token) }
    );
  }

  updateProfile(
    token: string,
    payload: {
      name?: string;
      email?: string;
      preferredCurrency?: string;
      currentPassword?: string;
      newPassword?: string;
    }
  ): Observable<{ message: string; user: CurrentUser }> {
    return this.http.patch<{ message: string; user: CurrentUser }>(
      `${this.baseUrl}/users/me`,
      payload,
      { headers: this.authHeaders(token) }
    );
  }

  queueReceipt(
    token: string,
    payload: {
      categoryId: string;
      expenseDate?: string;
      title?: string;
      merchantName?: string;
      notes?: string;
      paymentMethod?: string;
      rawText?: string;
      receiptFile?: File | null;
    }
  ): Observable<{ message: string; receipt: Receipt }> {
    const formData = new FormData();
    formData.append('categoryId', payload.categoryId);

    if (payload.expenseDate) {
      formData.append('expenseDate', payload.expenseDate);
    }

    if (payload.title) {
      formData.append('title', payload.title);
    }

    if (payload.merchantName) {
      formData.append('merchantName', payload.merchantName);
    }

    if (payload.notes) {
      formData.append('notes', payload.notes);
    }

    if (payload.paymentMethod) {
      formData.append('paymentMethod', payload.paymentMethod);
    }

    if (payload.rawText) {
      formData.append('rawText', payload.rawText);
    }

    if (payload.receiptFile) {
      formData.append('receipt', payload.receiptFile);
    }

    return this.http.post<{ message: string; receipt: Receipt }>(
      `${this.baseUrl}/receipts/queue`,
      formData,
      { headers: this.authHeaders(token) }
    );
  }

  getReceipts(token: string): Observable<{ receipts: Receipt[] }> {
    return this.http.get<{ receipts: Receipt[] }>(`${this.baseUrl}/receipts`, {
      headers: this.authHeaders(token)
    });
  }

  getReceipt(token: string, receiptId: string): Observable<{ receipt: Receipt }> {
    return this.http.get<{ receipt: Receipt }>(`${this.baseUrl}/receipts/${receiptId}`, {
      headers: this.authHeaders(token)
    });
  }

  createExpenseFromReceipt(
    token: string,
    receiptId: string,
    payload: {
      categoryId: string;
      expenseDate: string;
      title: string;
      merchantName?: string;
      notes?: string;
      paymentMethod?: string;
    }
  ): Observable<{ message: string; expense: Expense; receipt: Receipt }> {
    return this.http.post<{ message: string; expense: Expense; receipt: Receipt }>(
      `${this.baseUrl}/receipts/${receiptId}/create-expense`,
      payload,
      { headers: this.authHeaders(token) }
    );
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
}
