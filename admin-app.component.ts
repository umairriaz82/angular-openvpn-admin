import { Component } from '@angular/core';

@Component({
  selector: 'app-admin',
  template: `
    <h1>OpenVPN Admin Panel</h1>
    <nav>
      <a routerLink="/">Home</a>
      <a routerLink="/clients">Manage Clients</a>
      <a routerLink="/stats">Statistics</a>
    </nav>
    <router-outlet></router-outlet>
  `,
})
export class AdminAppComponent {}