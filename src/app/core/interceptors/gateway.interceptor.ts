import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError, timeout } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { CONFIG } from '../config';
export const gatewayInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const base = inject(CONFIG).apiBaseUrl;
  const url = new URL(request.url, location.origin);
  const gateway = new URL(base, location.origin);
  if (
    url.origin !== gateway.origin ||
    !url.pathname.startsWith(gateway.pathname.replace(/\/$/, '') + '/api/v1/')
  )
    return next(request);
  return from(auth.token()).pipe(
    switchMap((token) =>
      next(
        request.clone({
          setHeaders: { Authorization: 'Bearer ' + token, 'X-Correlation-ID': crypto.randomUUID() },
        }),
      ),
    ),
    timeout(15000),
    catchError((error) => {
      if (error.status === 401) auth.clear();
      return throwError(() => error);
    }),
  );
};
