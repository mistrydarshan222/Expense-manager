import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AppStore } from './app.store';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss'
})
export class NotificationsPageComponent {
  protected readonly store = inject(AppStore);
}
