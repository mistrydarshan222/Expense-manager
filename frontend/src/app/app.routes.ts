import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard.page').then((m) => m.DashboardPageComponent)
  },
  {
    path: 'expenses/new',
    loadComponent: () => import('./add-expense.page').then((m) => m.AddExpensePageComponent)
  },
  {
    path: 'expenses',
    loadComponent: () => import('./expenses.page').then((m) => m.ExpensesPageComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile.page').then((m) => m.ProfilePageComponent)
  },
  {
    path: 'receipts',
    loadComponent: () => import('./receipts.page').then((m) => m.ReceiptsPageComponent)
  }
];
