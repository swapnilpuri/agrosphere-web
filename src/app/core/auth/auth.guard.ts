import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  if (!auth.authenticated()) return router.createUrlTree(['/login']);
  if (auth.canEnterWorkspace()) return true;
  return router.createUrlTree([
    auth.canEnterProductionWorkspace() ? '/production-history' : '/login',
  ]);
};
