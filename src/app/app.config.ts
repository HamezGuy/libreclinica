import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import { provideAuth, initializeAuth, browserLocalPersistence } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideFunctions, getFunctions } from '@angular/fire/functions';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

import { routes } from './app.routes';
import { firebaseConfig } from './config/firebase.config';
import { CoreModule } from './core/core.module';

// Factory function to register custom icons
const registerIcons = (iconRegistry: MatIconRegistry, sanitizer: DomSanitizer) => {
  return () => {
    iconRegistry.addSvgIcon('google-logo', sanitizer.bypassSecurityTrustResourceUrl('assets/icons/google-logo.svg'));
  };
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),

    // Firebase providers
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => {
      const app = getApp();
      return initializeAuth(app, { persistence: browserLocalPersistence });
    }),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),

    // Core application modules and services
    importProvidersFrom(CoreModule, MatIconModule),

    // Custom icon registration
    {
      provide: APP_INITIALIZER,
      useFactory: registerIcons,
      deps: [MatIconRegistry, DomSanitizer],
      multi: true,
    },
  ]
};
