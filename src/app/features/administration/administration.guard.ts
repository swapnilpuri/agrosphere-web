import { CanDeactivateFn } from '@angular/router';
export const administrationLeaveGuard: CanDeactivateFn<{ canLeave(): boolean }> = (component) =>
  component.canLeave();
