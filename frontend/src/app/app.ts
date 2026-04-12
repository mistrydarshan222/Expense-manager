import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Component, ViewEncapsulation, inject, signal } from '@angular/core';

import { AppStore } from './app.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None
})
export class App {
  protected readonly store = inject(AppStore);
  private readonly router = inject(Router);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly currentYear = new Date().getFullYear();

  protected toggleMobileMenu() {
    this.mobileMenuOpen.update((value) => !value);
  }

  protected closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  protected logout() {
    this.closeMobileMenu();
    this.store.logout();
  }

  protected authMode() {
    const auth = this.router.parseUrl(this.router.url).queryParams['auth'];
    return auth === 'register' ? 'register' : 'login';
  }

  protected mobileNavActive(path: string) {
    const currentPath = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    return path === ''
      ? currentPath === ''
      : currentPath === path || currentPath.startsWith(`${path}/`);
  }

  protected mobileHeaderTitle() {
    const currentPath = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';

    switch (currentPath) {
      case 'expenses/new':
        return 'Add Expense';
      case 'expenses':
        return 'Expense History';
      case 'receipts':
        return 'Receipt Scanner';
      case 'profile':
        return 'Profile';
      case '':
      default:
        return 'Dashboard';
    }
  }

  protected mobileHeaderSubtitle() {
    const currentPath = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';

    switch (currentPath) {
      case 'expenses':
        return 'Track every amount clearly';
      case 'receipts':
        return 'Scan and review faster';
      case 'profile':
        return 'Manage your account';
      case '':
      default:
        return 'Your money workspace';
    }
  }

  protected mobileHeaderMode() {
    const currentPath = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    return 'brand';
  }

  protected mobileHeaderHasAvatar() {
    const currentPath = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    return currentPath === 'profile';
  }

  protected mobileHeaderActionLabel() {
    const currentPath = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    return currentPath === 'receipts' ? 'Settings' : 'Notifications';
  }
}
