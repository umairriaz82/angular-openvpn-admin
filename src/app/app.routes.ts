import { Routes } from '@angular/router';
import { ClientsComponent } from './clients/clients.component';
import { StatsComponent } from './stats/stats.component';

export const appRoutes: Routes = [
  { path: '', redirectTo: '/clients', pathMatch: 'full' },
  { path: 'clients', component: ClientsComponent },
  { path: 'stats', component: StatsComponent },
];
