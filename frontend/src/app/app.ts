import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  protected readonly mobileMenuOpen = signal(false);

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
}
