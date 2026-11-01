import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { EstateStore } from '../estates/estate.store';
import { AlertCounts, AlertsApi } from './alerts.api';
import { AlertInbox } from './alert-inbox';

describe('Selected-estate alert polling', () => {
  const counts: AlertCounts = {
    activeTotal: 2,
    activeUnreadForMe: 1,
    activeUnacknowledged: 2,
    generatedAt: '2026-10-31T12:00:00Z',
  };
  let calls: { path: string; response: Subject<AlertCounts> }[];
  let estate: ReturnType<typeof signal<string>>;
  let authenticated: ReturnType<typeof signal<boolean>>;
  let roles: ReturnType<typeof signal<string[]>>;
  let clear: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    calls = [];
    estate = signal('estate-a');
    authenticated = signal(true);
    roles = signal(['ESTATE_MANAGER']);
    clear = vi.fn(() => authenticated.set(false));
    TestBed.configureTestingModule({
      providers: [
        AlertInbox,
        { provide: EstateStore, useValue: { estateId: estate } },
        {
          provide: AuthService,
          useValue: {
            authenticated,
            roles,
            estateIds: signal(['estate-a', 'estate-b']),
            clear,
            canReadCropHealth: (id: string) =>
              authenticated() && !!id && roles().includes('ESTATE_MANAGER'),
          },
        },
        {
          provide: AlertsApi,
          useValue: {
            get: (path: string) => {
              const response = new Subject<AlertCounts>();
              calls.push({ path, response });
              return response;
            },
          },
        },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const create = () => {
    const inbox = TestBed.inject(AlertInbox);
    TestBed.tick();
    return inbox;
  };
  it('polls once while in flight and only counts GETs are issued', () => {
    const inbox = create();
    inbox.refresh();
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toContain('/counts?estateId=estate-a');
    calls[0].response.next(counts);
    expect(inbox.counts()).toEqual(counts);
    vi.advanceTimersByTime(35_000);
    expect(calls).toHaveLength(2);
  });
  it('cancels old-estate requests and ignores their late results', () => {
    const inbox = create();
    const old = calls[0].response;
    estate.set('estate-b');
    TestBed.tick();
    expect(old.observed).toBe(false);
    old.next(counts);
    expect(inbox.counts()).toBeNull();
    expect(calls[1].path).toContain('estate-b');
  });
  it('never displays stale counts as fresh after an outage', () => {
    const inbox = create();
    calls[0].response.next(counts);
    vi.advanceTimersByTime(35_000);
    calls[1].response.error(new HttpErrorResponse({ status: 503 }));
    expect(inbox.counts()).toBeNull();
    expect(inbox.unavailable()).toBe(true);
    expect(inbox.lastSuccess()).toBe(counts.generatedAt);
  });
  it('honors Retry-After even when a manual retry is requested', () => {
    const inbox = create();
    calls[0].response.error(
      new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '120' }) }),
    );
    inbox.refresh();
    vi.advanceTimersByTime(119_000);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(2);
  });
  it('does not poll while hidden and refreshes on return', () => {
    const inbox = create();
    calls[0].response.next(counts);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(300_000);
    expect(calls).toHaveLength(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toHaveLength(2);
    expect(inbox.counts()).toEqual(counts);
  });
  it('clears session or revoked permission state', () => {
    const inbox = create();
    calls[0].response.error(new HttpErrorResponse({ status: 401 }));
    TestBed.tick();
    expect(clear).toHaveBeenCalledOnce();
    expect(inbox.counts()).toBeNull();
    authenticated.set(true);
    TestBed.tick();
    calls[1].response.next(counts);
    roles.set(['VIEWER']);
    TestBed.tick();
    expect(inbox.counts()).toBeNull();
    vi.advanceTimersByTime(300_000);
    expect(calls).toHaveLength(2);
  });
  it('does not present a late response as fresh after going offline', () => {
    const inbox = create();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    calls[0].response.next(counts);
    expect(inbox.counts()).toBeNull();
    expect(inbox.unavailable()).toBe(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(calls).toHaveLength(2);
  });
});
