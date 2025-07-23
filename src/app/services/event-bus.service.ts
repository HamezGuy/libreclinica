import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ComplianceTermsAcceptedEvent, ComplianceTrainingCompletedEvent } from '../models/compliance-events.model';
import { FormTemplateUpdatedEvent } from '../models/form-events.model';

// Base event interface
export interface BaseEvent {
  type: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  metadata?: any;
}

// Authentication events
export interface UserLoginEvent extends BaseEvent {
  type: 'USER_LOGIN';
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId: string;
}

export interface UserLogoutEvent extends BaseEvent {
  type: 'USER_LOGOUT';
  userId: string;
  reason: 'manual' | 'timeout' | 'forced';
}

export interface AuthenticationFailedEvent extends BaseEvent {
  type: 'AUTHENTICATION_FAILED';
  email: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

// User management events
export interface UserCreatedEvent extends BaseEvent {
  type: 'USER_CREATED';
  userId: string;
  email: string;
  accessLevel: string;
}

export interface UserRoleChangedEvent extends BaseEvent {
  type: 'USER_ROLE_CHANGED';
  userId: string;
  previousRole: string;
  newRole: string;
  changedBy: string;
}

export interface UserStatusChangedEvent extends BaseEvent {
  type: 'USER_STATUS_CHANGED';
  userId: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
}

// Data access events
export interface DataAccessEvent extends BaseEvent {
  type: 'DATA_ACCESS';
  userId: string;
  resourceType: string;
  resourceId: string;
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT';
  isPhiData: boolean;
}

export interface DataModificationEvent extends BaseEvent {
  type: 'DATA_MODIFICATION';
  userId: string;
  resourceType: string;
  resourceId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  beforeValue?: any;
  afterValue?: any;
}

// Document events
export interface DocumentSavedEvent extends BaseEvent {
  type: 'DOCUMENT_SAVED';
  documentId: string;
  documentType: string;
  userId: string;
  action: 'create' | 'update';
}

// Patient events
export interface PatientCreatedEvent extends BaseEvent {
  type: 'PATIENT_CREATED';
  patientId: string;
  studyId?: string;
  createdBy: string;
}

// Form events
export interface FormSubmittedEvent extends BaseEvent {
  type: 'FORM_SUBMITTED';
  formId: string;
  formTemplateId: string;
  patientId: string;
  submittedBy: string;
}

export interface FormTemplateCreatedEvent extends BaseEvent {
  type: 'FORM_TEMPLATE_CREATED';
  templateId: string;
  templateName: string;
  createdBy: string;
}

export interface FormTemplatePublishedEvent extends BaseEvent {
  type: 'FORM_TEMPLATE_PUBLISHED';
  templateId: string;
  templateName: string;
  version: string;
  publishedBy: string;
}

// Union type of all events
export type AppEvent = 
  | UserLoginEvent 
  | UserLogoutEvent 
  | AuthenticationFailedEvent
  | UserCreatedEvent
  | UserRoleChangedEvent
  | UserStatusChangedEvent
  | DataAccessEvent
  | DataModificationEvent
  | DocumentSavedEvent
  | PatientCreatedEvent
  | FormSubmittedEvent
  | FormTemplateCreatedEvent
  | FormTemplatePublishedEvent
  | ComplianceTermsAcceptedEvent
  | ComplianceTrainingCompletedEvent
  | FormTemplateUpdatedEvent;

@Injectable({
  providedIn: 'root'
})
export class EventBusService {
  private eventBus$ = new Subject<AppEvent>();

  constructor() {}

  /**
   * Publish an event to the event bus
   */
  publish(event: AppEvent): void {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date();
    }
    
    // Emit the event
    this.eventBus$.next(event);
  }

  /**
   * Subscribe to all events
   */
  on(): Observable<AppEvent> {
    return this.eventBus$.asObservable();
  }

  /**
   * Subscribe to specific event types
   */
  onEvent<T extends AppEvent>(eventType: T['type']): Observable<T> {
    return this.eventBus$.pipe(
      filter((event): event is T => event.type === eventType)
    );
  }

  /**
   * Subscribe to multiple event types
   */
  onEvents<T extends AppEvent>(...eventTypes: T['type'][]): Observable<T> {
    return this.eventBus$.pipe(
      filter((event): event is T => eventTypes.includes(event.type as T['type']))
    );
  }

  /**
   * Subscribe to events matching a predicate
   */
  where<T extends AppEvent>(predicate: (event: AppEvent) => event is T): Observable<T> {
    return this.eventBus$.pipe(
      filter(predicate)
    );
  }
}
