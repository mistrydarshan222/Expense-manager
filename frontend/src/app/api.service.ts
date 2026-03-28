import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthResponse, Category, Expense } from './api.types';

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

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
}
