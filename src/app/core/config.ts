import { InjectionToken } from '@angular/core';
export interface AppConfig {
  verification?: { runId: string };
  telemetry?: { displayAgeSeconds?: number; pollSeconds?: number };
  apiBaseUrl: string;
  keycloak: { url: string; realm: string; clientId: string };
  cesium: {
    ionToken?: string;
    worldTerrain?: boolean;
    imageryUrl?: string;
    terrainUrl?: string;
    attribution?: string;
    allowedLayerOrigins?: string[];
  };
}
export function fixtureVerification(config: AppConfig): string | undefined {
  const run = config.verification?.runId;
  if (!run || !/^[a-f0-9]{32}$/.test(run) || config.keycloak?.realm !== 'agrosphere')
    return undefined;
  try {
    for (const value of [config.apiBaseUrl, config.keycloak.url]) {
      const url = new URL(value);
      if (
        url.protocol !== 'http:' ||
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        !url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/'
      )
        return undefined;
    }
    return run;
  } catch {
    return undefined;
  }
}
export const CONFIG = new InjectionToken<AppConfig>('runtime configuration');
export async function loadConfig(): Promise<AppConfig> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Runtime configuration unavailable');
  const config = (await response.json()) as AppConfig;
  const api = new URL(config.apiBaseUrl || '/', location.origin);
  if (!['http:', 'https:'].includes(api.protocol)) throw new Error('Invalid Gateway URL');
  config.apiBaseUrl = api.href.replace(/\/$/, '');
  return config;
}
