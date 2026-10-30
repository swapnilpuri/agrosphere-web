import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { describe, it, expect } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
describe('Authentication guard', () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [true, true, true],
  ])('authenticated=%s role=%s', async (authenticated, allowed, expected) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            initialize: async () => {},
            authenticated: () => authenticated,
            canEnterWorkspace: () => allowed,
          },
        },
      ],
    });
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(result === true).toBe(expected);
    if (!expected) expect(result instanceof UrlTree).toBe(true);
  });
});
