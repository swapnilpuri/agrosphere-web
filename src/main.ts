import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { CONFIG, loadConfig } from './app/core/config';
import { gatewayInterceptor } from './app/core/interceptors/gateway.interceptor';
(window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium/';
loadConfig()
  .then((config) =>
    bootstrapApplication(AppComponent, {
      providers: [
        { provide: CONFIG, useValue: config },
        provideRouter(routes),
        provideHttpClient(withInterceptors([gatewayInterceptor])),
      ],
    }),
  )
  .catch(() => {
    document.body.textContent = 'AgroSphere could not start. Check /config.json and reload.';
  });
