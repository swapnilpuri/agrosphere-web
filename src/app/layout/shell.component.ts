import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { EstateStore } from '../features/estates/estate.store';
@Component({
  standalone: true,
  providers: [EstateStore],
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(EstateStore);
  readonly router = inject(Router);
  readonly collapsed = signal(false);
  readonly estateQuery = signal('');
  readonly filteredEstates = computed(() => {
    const q = this.estateQuery().toLowerCase().trim();
    return this.store
      .estates()
      .filter((e) => (e.name + ' ' + e.estateCode).toLowerCase().includes(q));
  });
  constructor() {
    effect(() => {
      if (!this.auth.authenticated()) void this.router.navigate(['/login']);
    });
    this.store.load();
  }
}
