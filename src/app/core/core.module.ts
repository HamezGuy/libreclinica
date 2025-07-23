import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Services
import { CloudAuditService } from '../services/cloud-audit.service';
import { HealthcareApiService } from '../services/healthcare-api.service';
import { EdcCompliantAuthService } from '../services/edc-compliant-auth.service';
import { EventBusService } from './services/event-bus.service';

// Event Handlers
import { AuditEventHandler } from './event-handlers/audit-event.handler';
import { ValidationEventHandler } from './event-handlers/validation-event.handler';
import { DataSyncEventHandler } from './event-handlers/data-sync-event.handler';

// Injection Tokens
import {
  AUDIT_SERVICE_TOKEN,
  HEALTHCARE_API_SERVICE_TOKEN,
  AUTH_SERVICE_TOKEN,
  EVENT_BUS_TOKEN
} from './injection-tokens';

/**
 * Core Module - Configures dependency injection for the entire application
 * Implements interface-based architecture with proper DI tokens
 */
@NgModule({
  imports: [CommonModule],
  providers: [
    // Event Bus - Core of event-driven architecture
    {
      provide: EVENT_BUS_TOKEN,
      useClass: EventBusService
    },
    EventBusService, // Also provide the concrete class for direct injection

    // Services with interface tokens
    {
      provide: AUDIT_SERVICE_TOKEN,
      useClass: CloudAuditService
    },
    CloudAuditService,

    {
      provide: HEALTHCARE_API_SERVICE_TOKEN,
      useClass: HealthcareApiService
    },
    HealthcareApiService,

    {
      provide: AUTH_SERVICE_TOKEN,
      useClass: EdcCompliantAuthService
    },
    EdcCompliantAuthService,

    // Event Handlers
    AuditEventHandler,
    ValidationEventHandler,
    DataSyncEventHandler
  ]
})
export class CoreModule {
  constructor(
    private eventBus: EventBusService,
    private auditHandler: AuditEventHandler,
    private validationHandler: ValidationEventHandler,
    private dataSyncHandler: DataSyncEventHandler
  ) {
    // Register event handlers on module initialization
    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    // Register audit handler for all events
    this.eventBus.subscribe('DOCUMENT_SAVED', this.auditHandler);
    this.eventBus.subscribe('PATIENT_CREATED', this.auditHandler);
    this.eventBus.subscribe('FORM_SUBMITTED', this.auditHandler);
    this.eventBus.subscribe('USER_LOGIN', this.auditHandler);
    this.eventBus.subscribe('USER_LOGOUT', this.auditHandler);
    this.eventBus.subscribe('DATA_EXPORTED', this.auditHandler);

    // Register validation handler
    this.eventBus.subscribe('DOCUMENT_SAVED', this.validationHandler);
    this.eventBus.subscribe('FORM_SUBMITTED', this.validationHandler);

    // Register data sync handler
    this.eventBus.subscribe('FORM_SUBMITTED', this.dataSyncHandler);
    this.eventBus.subscribe('PATIENT_UPDATED', this.dataSyncHandler);
    this.eventBus.subscribe('STUDY_UPDATED', this.dataSyncHandler);

    console.log('Event handlers registered successfully');
  }
}
