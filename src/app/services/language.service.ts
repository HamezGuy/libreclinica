import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  // Available languages for the EDC system
  private readonly languages: Language[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', direction: 'ltr' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', direction: 'ltr' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', direction: 'ltr' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', direction: 'ltr' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', direction: 'ltr' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', direction: 'ltr' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', direction: 'rtl' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', direction: 'ltr' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', direction: 'ltr' }
  ];

  private currentLanguageSubject = new BehaviorSubject<Language>(this.getDefaultLanguage());
  public currentLanguage$: Observable<Language> = this.currentLanguageSubject.asObservable();

  constructor() {
    // Load saved language preference
    const savedLang = localStorage.getItem('edc_language');
    if (savedLang) {
      const language = this.languages.find(l => l.code === savedLang);
      if (language) {
        this.currentLanguageSubject.next(language);
      }
    }
  }

  /**
   * Get all available languages
   */
  getLanguages(): Language[] {
    return this.languages;
  }

  /**
   * Get current selected language
   */
  getCurrentLanguage(): Language {
    return this.currentLanguageSubject.value;
  }

  /**
   * Set the current language
   */
  setLanguage(languageCode: string): void {
    const language = this.languages.find(l => l.code === languageCode);
    if (language) {
      this.currentLanguageSubject.next(language);
      localStorage.setItem('edc_language', languageCode);
      
      // Update document direction for RTL languages
      document.documentElement.dir = language.direction;
      document.documentElement.lang = languageCode;
      
      // Reload the page to apply new language (for Angular i18n)
      // In production, you'd use different builds for each language
      if (this.shouldReloadForLanguage()) {
        window.location.reload();
      }
    }
  }

  /**
   * Get default language based on browser settings
   */
  private getDefaultLanguage(): Language {
    const browserLang = navigator.language.split('-')[0];
    const matchedLang = this.languages.find(l => l.code === browserLang);
    return matchedLang || this.languages[0]; // Default to English
  }

  /**
   * Check if page reload is needed for language change
   */
  private shouldReloadForLanguage(): boolean {
    // For development, we'll use a single build with runtime translations
    // In production, you'd have separate builds for each language
    return false; // Set to true for production builds
  }

  /**
   * Get translated date format for current language
   */
  getDateFormat(): string {
    switch (this.getCurrentLanguage().code) {
      case 'en': return 'MM/dd/yyyy';
      case 'de':
      case 'fr':
      case 'es':
      case 'pt': return 'dd/MM/yyyy';
      case 'zh':
      case 'ja': return 'yyyy/MM/dd';
      default: return 'MM/dd/yyyy';
    }
  }

  /**
   * Get number format for current language
   */
  getNumberFormat(): { decimal: string; thousands: string } {
    switch (this.getCurrentLanguage().code) {
      case 'de':
      case 'fr':
      case 'es':
      case 'pt':
        return { decimal: ',', thousands: '.' };
      default:
        return { decimal: '.', thousands: ',' };
    }
  }
}
