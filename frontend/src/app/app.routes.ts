import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'assets',
    loadComponent: () => import('./pages/assets-list/assets-list').then((m) => m.AssetsList),
    canActivate: [authGuard],
  },
  {
    path: 'assets/:id',
    loadComponent: () =>
      import('./pages/asset-detail/asset-detail').then((m) => m.AssetDetailPage),
    canActivate: [authGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'assets' },
  { path: '**', redirectTo: 'assets' },
];
