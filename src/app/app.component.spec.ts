import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AppComponent } from './app.component';
describe('Foundation shell', () => {
  it('renders its milestone status without calling services', async () => {
    await TestBed.configureTestingModule({imports: [AppComponent]}).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Milestone 2');
  });
});
