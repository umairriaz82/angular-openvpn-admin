// Main entry point for the Angular application
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AdminAppComponent } from './admin-app.component';
import { provideRouter, Routes } from '@angular/router';

// Define routes for the application
const routes: Routes = [
  { path: '', component: AdminAppComponent },
  { path: 'clients', loadComponent: () => import('./clients.component').then(m => m.ClientsComponent) },
  { path: 'stats', loadComponent: () => import('./stats.component').then(m => m.StatsComponent) }
];

// Bootstrap the Angular application
bootstrapApplication(AdminAppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient()
  ]
}).catch(err => console.error(err));