import { HttpErrorResponse } from '@angular/common/http';
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const messages: Record<number, string> = {
      0: 'Gateway unavailable or network request timed out.',
      400: 'The request was rejected as invalid.',
      401: 'Your session expired. Sign in again.',
      403: 'You do not have permission to view this estate.',
      404: 'The requested resource is unavailable.',
      409: 'The resource changed. Refresh to get the latest data.',
      429: 'Request limit reached. Wait before retrying.',
      500: 'The service encountered an error.',
      503: 'A service is temporarily unavailable.',
    };
    return (
      (messages[error.status] ?? 'Request failed.') +
      (error.error?.correlationId ? ' Reference: ' + error.error.correlationId : '')
    );
  }
  return error instanceof Error ? error.message : 'Unable to load data.';
}
