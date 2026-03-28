import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard.page').then((m) => m.DashboardPageComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile.page').then((m) => m.ProfilePageComponent)
  }
];
