import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect } from 'vitest';
import { errorMessage } from './errors';
describe('Gateway errors', () => {
  it.each([0, 400, 401, 403, 404, 409, 429, 500, 503])(
    'provides an actionable message for %s',
    (status) => {
      const result = errorMessage(
        new HttpErrorResponse({ status, error: { correlationId: 'request-id' } }),
      );
      expect(result).toContain('Reference: request-id');
      expect(result).not.toContain('undefined');
    },
  );
});
