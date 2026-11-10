import { Routes } from '@angular/router';
import { productionGuard } from './features/production/production.guard';
import { authGuard } from './core/auth/auth.guard';
import { administrationLeaveGuard } from './features/administration/administration.guard';
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'production-history',
    canActivate: [productionGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/production/production.component').then((m) => m.ProductionComponent),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'alerts',
        canDeactivate: [administrationLeaveGuard],
        loadComponent: () =>
          import('./features/alerts/alerts.component').then((m) => m.AlertsComponent),
      },
      ...['inspections', 'incidents'].map((path) => ({
        path,
        data: { cropMode: path },
        canDeactivate: [administrationLeaveGuard],
        loadComponent: () =>
          import('./features/crop-health/crop-health.component').then((m) => m.CropHealthComponent),
      })),
      ...['workers', 'attendance'].map((path) => ({
        path,
        data: { workforceMode: path },
        canDeactivate: [administrationLeaveGuard],
        loadComponent: () =>
          import('./features/workforce/workforce.component').then((m) => m.WorkforceComponent),
      })),
      {
        path: 'administration',
        canDeactivate: [administrationLeaveGuard],
        loadComponent: () =>
          import('./features/administration/administration.component').then(
            (m) => m.AdministrationComponent,
          ),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'digital-twin',
        loadComponent: () =>
          import('./features/digital-twin/digital-twin.component').then(
            (m) => m.DigitalTwinComponent,
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
