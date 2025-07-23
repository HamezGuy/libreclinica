import { InjectionToken } from '@angular/core';
import { 
  IAuditService, 
  IHealthcareApiService, 
  IAuthService, 
  INotificationService,
  IEventBus,
  IStudyRepository,
  IFormRepository,
  IStorageStrategy,
  IConfigService
} from './interfaces';

/**
 * Dependency Injection Tokens for Interface-based Architecture
 * These tokens allow us to inject interfaces instead of concrete implementations
 */

export const AUDIT_SERVICE_TOKEN = new InjectionToken<IAuditService>('AuditService');
export const HEALTHCARE_API_SERVICE_TOKEN = new InjectionToken<IHealthcareApiService>('HealthcareApiService');
export const AUTH_SERVICE_TOKEN = new InjectionToken<IAuthService>('AuthService');
export const NOTIFICATION_SERVICE_TOKEN = new InjectionToken<INotificationService>('NotificationService');
export const EVENT_BUS_TOKEN = new InjectionToken<IEventBus>('EventBus');
export const STUDY_REPOSITORY_TOKEN = new InjectionToken<IStudyRepository>('StudyRepository');
export const FORM_REPOSITORY_TOKEN = new InjectionToken<IFormRepository>('FormRepository');
export const STORAGE_STRATEGY_TOKEN = new InjectionToken<IStorageStrategy>('StorageStrategy');
export const CONFIG_SERVICE_TOKEN = new InjectionToken<IConfigService>('ConfigService');

/**
 * Environment-specific injection token
 */
export const ENVIRONMENT_TOKEN = new InjectionToken<'development' | 'staging' | 'production'>('Environment');
