import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, vi } from 'vitest';
import { gatewayInterceptor } from './gateway.interceptor';
import { AuthService } from '../auth/auth.service';
import { CONFIG } from '../config';
describe('Token boundary', () => {
  it('attaches tokens only to Gateway business routes and clears a rejected session', async () => {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([gatewayInterceptor])),
        provideHttpClientTesting(),
        { provide: CONFIG, useValue: { apiBaseUrl: 'http://gateway' } },
        { provide: AuthService, useValue: { token: async () => 'short-token', clear } },
      ],
    });
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);
    client.get('http://untrusted/api/v1/estates').subscribe();
    const external = http.expectOne('http://untrusted/api/v1/estates');
    expect(external.request.headers.has('Authorization')).toBe(false);
    external.flush({});
    client.get('http://gateway/api/v1/estates').subscribe({ error: () => {} });
    await Promise.resolve();
    const req = http.expectOne('http://gateway/api/v1/estates');
    expect(req.request.headers.get('Authorization')).toBe('Bearer short-token');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(clear).toHaveBeenCalled();
    http.verify();
  });
});
