import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';
import { AccessLevel } from './enums/access-levels.enum';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/auth',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    loadComponent: () => import('./components/authentication/authentication.component').then(m => m.AuthenticationComponent)
  },
  {
    path: 'compliance-setup',
    loadComponent: () => import('./components/compliance-setup/compliance-setup.component').then(m => m.ComplianceSetupComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'unauthorized',
    loadComponent: () => import('./components/unauthorized/unauthorized.component').then(m => m.UnauthorizedComponent)
  },
  {
    path: 'admin',
    loadComponent: () => import('./components/admin/admin.component').then(m => m.AdminComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN] }
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
