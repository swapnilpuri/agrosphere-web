import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
export const productionGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  if (!auth.authenticated()) return router.createUrlTree(['/login']);
  return auth.canEnterProductionWorkspace() || router.createUrlTree(['/dashboard']);
};
