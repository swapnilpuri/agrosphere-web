import { InjectionToken } from '@angular/core';
export interface AppConfig {
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
