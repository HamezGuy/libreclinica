import { Pipe, PipeTransform } from '@angular/core';
import { LanguageService } from '../services/language.service';

// Translation caches and in-flight loaders
const translations: { [lang: string]: any } = {};
const loadingPromises: { [lang: string]: Promise<void> | null } = {};

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false // Make it impure to react to language changes
})
export class TranslatePipe implements PipeTransform {
  private currentLang: string = 'en';
  private loadedTranslations: any = {};

  // Domain files to load and merge per language
  private static readonly DOMAINS = [
    'common',
    'dashboard',
    'forms',
    'patients',
    'settings',
    'messages',
    'auth',
    'profile',
    'validation',
    'form',
    'patient',
    'study',
    'report',
    'ocr',
    'template',
    'survey',
    'admin-user',
    'authentication',
    'compliance-setup',
    'create-study-widget',
    'dashboard-sidebar',
    'edc-auth',
    'excel-conversion',
    'form-assignment-modal',
    'form-builder',
    'form-preview',
    'form-viewer',
    'language-selector',
    'login',
    'ocr-template-builder',
    'organization-registration',
    'patient-detail',
    'patient-form-modal',
    'patient-phase-progress',
    'phase-forms',
    'profile-edit',
    'register',
    'study-creation-modal',
    'study-group-modal',
    'study-phase',
    'substudy-modal'
  ];

  constructor(private languageService: LanguageService) {
    // Subscribe to language changes
    this.languageService.currentLanguage$.subscribe(lang => {
      this.currentLang = lang.code;
      this.loadTranslations(lang.code);
    });

    // Load initial translations
    this.loadTranslations(this.currentLang);
  }

  transform(key: string, params?: any): string {
    if (!key) return '';

    // Lookup translation from merged cache
    let translation = this.getNestedProperty(this.loadedTranslations, key);

    if (!translation) {
      // Ensure English fallback is available
      if (!translations['en'] && !loadingPromises['en']) {
        this.loadTranslations('en');
      }
      const fallbackRoot = translations['en'];
      const fallback = fallbackRoot ? this.getNestedProperty(fallbackRoot, key) : null;
      if (fallback) {
        translation = fallback;
        // Only warn if the current language is one of the enabled languages
        // Don't warn for English fallbacks when using non-English languages
        if (this.currentLang !== 'en' && ['hi', 'ja'].includes(this.currentLang)) {
          console.warn(`Missing translation for key: ${key} in '${this.currentLang}'. Falling back to English.`);
        }
      } else {
        if (params && typeof params === 'object' && params.default !== undefined) {
          return params.default;
        }
        // Only warn about completely missing translations if we're using an enabled language
        if (['en', 'hi', 'ja'].includes(this.currentLang)) {
          console.warn(`Translation missing for key: ${key}`);
        }
        return key;
      }
    }

    if (params) {
      return this.interpolate(translation, params);
    }
    return translation;
  }

  private loadTranslations(lang: string): void {
    // Only load translations for enabled languages
    const enabledLanguages = ['en', 'hi', 'ja'];
    if (!enabledLanguages.includes(lang)) {
      // Silently fall back to English for disabled languages
      lang = 'en';
    }

    // If cached, use it
    if (translations[lang]) {
      this.loadedTranslations = translations[lang];
      return;
    }

    // If already loading, attach to it to update when done
    if (loadingPromises[lang]) {
      loadingPromises[lang]!.then(() => {
        this.loadedTranslations = translations[lang] || this.loadedTranslations;
      });
      return;
    }

    // Begin loading all domain files in parallel
    loadingPromises[lang] = Promise.all(
      TranslatePipe.DOMAINS.map(domain =>
        fetch(`/assets/i18n/${lang}/${domain}.json`)
          .then(res => (res.ok ? res.json() : null))
          .catch(() => null)
      )
    )
      .then(parts => {
        const anyLoaded = parts.some(p => !!p);
        if (!anyLoaded) {
          // Legacy single-file fallback: /assets/i18n/{lang}.json
          return fetch(`/assets/i18n/${lang}.json`)
            .then(res => (res.ok ? res.json() : null))
            .then(legacy => {
              translations[lang] = legacy || {};
            })
            .catch(() => {
              translations[lang] = {};
            })
            .then(() => undefined);
        }

        // Deep merge domain parts
        const merged: any = {};
        for (const part of parts) {
          if (part && typeof part === 'object') {
            this.deepMerge(merged, part);
          }
        }
        translations[lang] = merged;
        return undefined;
      })
      .finally(() => {
        this.loadedTranslations = translations[lang] || {};
        // Preload English fallback non-blocking
        if (lang !== 'en' && !translations['en'] && !loadingPromises['en']) {
          this.loadTranslations('en');
        }
        loadingPromises[lang] = null;
      });
  }

  private deepMerge(target: any, source: any): any {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      const srcVal = source[key];
      if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key], srcVal);
      } else {
        target[key] = srcVal;
      }
    }
    return target;
  }

  private getNestedProperty(obj: any, key: string): any {
    const keys = key.split('.');
    let result = obj;
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return null;
      }
    }
    return result;
  }

  private interpolate(str: string, params: any): string {
    return String(str).replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }
}
