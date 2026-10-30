import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { administrationLeaveGuard } from './features/administration/administration.guard';
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
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
