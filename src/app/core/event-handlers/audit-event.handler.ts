import { Injectable, Inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { IEventHandler, IEvent, IAuditService, DocumentSavedEvent, PatientCreatedEvent, FormSubmittedEvent, UserLoginEvent, UserLogoutEvent, AuthenticationFailedEvent, UserCreatedEvent, UserRoleChangedEvent, UserStatusChangedEvent, DataAccessEvent, DataModificationEvent } from '../interfaces';
import { AUDIT_SERVICE_TOKEN } from '../injection-tokens';

/**
 * Audit Event Handler - Logs all events to audit trail
 * Implements IEventHandler for event-driven architecture
 */
@Injectable({
  providedIn: 'root'
})
export class AuditEventHandler implements IEventHandler<IEvent> {
  private supportedEvents = [
    'DOCUMENT_SAVED',
    'PATIENT_CREATED',
    'FORM_SUBMITTED',
    'USER_LOGIN',
    'USER_LOGOUT',
    'AUTHENTICATION_FAILED',
    'USER_CREATED',
    'USER_ROLE_CHANGED',
    'USER_STATUS_CHANGED',
    'DATA_ACCESS',
    'DATA_MODIFICATION',
    'DATA_EXPORTED',
    'DATA_DELETED',
    'PERMISSION_CHANGED',
    'STUDY_MODIFIED'
  ];

  constructor(@Inject(AUDIT_SERVICE_TOKEN) private auditService: IAuditService) {}

  canHandle(event: IEvent): boolean {
    return this.supportedEvents.includes(event.type);
  }

  handle(event: IEvent): Observable<void> {
    const auditData = this.mapEventToAudit(event);
    return this.auditService.logEvent(auditData);
  }

  private mapEventToAudit(event: IEvent): any {
    switch (event.type) {
      case 'DOCUMENT_SAVED':
        const docEvent = event as DocumentSavedEvent;
        return {
          action: 'CREATE',
          resourceType: docEvent.documentType,
          resourceId: docEvent.documentId,
          newValue: docEvent.data,
          metadata: {
            eventId: event.id,
            eventType: event.type
          },
          compliance: ['21CFR11', 'HIPAA']
        };

      case 'PATIENT_CREATED':
        const patientEvent = event as PatientCreatedEvent;
        return {
          action: 'CREATE',
          resourceType: 'Patient',
          resourceId: patientEvent.patientId,
          newValue: { id: patientEvent.patientId }, // Don't log PHI
          metadata: {
            eventId: event.id,
            eventType: event.type
          },
          compliance: ['HIPAA', '21CFR11']
        };

      case 'FORM_SUBMITTED':
        const formEvent = event as FormSubmittedEvent;
        return {
          action: 'CREATE',
          resourceType: 'FormSubmission',
          resourceId: formEvent.formId,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            studyId: formEvent.studyId,
            patientId: formEvent.patientId
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'USER_LOGIN':
        const loginEvent = event as UserLoginEvent;
        return {
          action: 'LOGIN',
          resourceType: 'UserSession',
          resourceId: loginEvent.sessionId,
          details: `User ${loginEvent.userEmail} logged in via ${loginEvent.authMethod}`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            userEmail: loginEvent.userEmail,
            authMethod: loginEvent.authMethod,
            ipAddress: loginEvent.ipAddress,
            userAgent: loginEvent.userAgent,
            sessionId: loginEvent.sessionId
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'USER_LOGOUT':
        const logoutEvent = event as UserLogoutEvent;
        return {
          action: 'LOGOUT',
          resourceType: 'UserSession',
          resourceId: logoutEvent.sessionId,
          details: `User ${logoutEvent.userEmail} logged out (${logoutEvent.reason})`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            userEmail: logoutEvent.userEmail,
            sessionId: logoutEvent.sessionId,
            reason: logoutEvent.reason
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'AUTHENTICATION_FAILED':
        const failedAuthEvent = event as AuthenticationFailedEvent;
        return {
          action: 'LOGIN_FAILED',
          resourceType: 'UserSession',
          resourceId: failedAuthEvent.userId,
          details: `Authentication failed for ${failedAuthEvent.userEmail}: ${failedAuthEvent.reason}`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            userEmail: failedAuthEvent.userEmail,
            authMethod: failedAuthEvent.authMethod,
            reason: failedAuthEvent.reason,
            ipAddress: failedAuthEvent.ipAddress,
            userAgent: failedAuthEvent.userAgent
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'USER_CREATED':
        const userCreatedEvent = event as UserCreatedEvent;
        return {
          action: 'USER_CREATED',
          resourceType: 'UserAccount',
          resourceId: userCreatedEvent.userProfile.uid,
          details: `User account created for ${userCreatedEvent.userEmail} via ${userCreatedEvent.registrationMethod}`,
          newValue: userCreatedEvent.userProfile,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            userEmail: userCreatedEvent.userEmail,
            createdBy: userCreatedEvent.createdBy,
            registrationMethod: userCreatedEvent.registrationMethod
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'USER_ROLE_CHANGED':
        const roleChangedEvent = event as UserRoleChangedEvent;
        return {
          action: 'USER_ROLE_CHANGED',
          resourceType: 'UserAccount',
          resourceId: roleChangedEvent.targetUserId,
          details: `User role changed from ${roleChangedEvent.oldRole} to ${roleChangedEvent.newRole} for ${roleChangedEvent.targetUserEmail}`,
          oldValue: { role: roleChangedEvent.oldRole },
          newValue: { role: roleChangedEvent.newRole },
          metadata: {
            eventId: event.id,
            eventType: event.type,
            targetUserId: roleChangedEvent.targetUserId,
            targetUserEmail: roleChangedEvent.targetUserEmail,
            changedBy: roleChangedEvent.changedBy,
            reason: roleChangedEvent.reason
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'USER_STATUS_CHANGED':
        const statusChangedEvent = event as UserStatusChangedEvent;
        return {
          action: 'USER_STATUS_CHANGED',
          resourceType: 'UserAccount',
          resourceId: statusChangedEvent.targetUserId,
          details: `User status changed from ${statusChangedEvent.oldStatus} to ${statusChangedEvent.newStatus} for ${statusChangedEvent.targetUserEmail}`,
          oldValue: { status: statusChangedEvent.oldStatus },
          newValue: { status: statusChangedEvent.newStatus },
          metadata: {
            eventId: event.id,
            eventType: event.type,
            targetUserId: statusChangedEvent.targetUserId,
            targetUserEmail: statusChangedEvent.targetUserEmail,
            changedBy: statusChangedEvent.changedBy,
            reason: statusChangedEvent.reason
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      case 'DATA_ACCESS':
        const dataAccessEvent = event as DataAccessEvent;
        return {
          action: `DATA_${dataAccessEvent.action}`,
          resourceType: dataAccessEvent.resourceType,
          resourceId: dataAccessEvent.resourceId,
          details: `${dataAccessEvent.action} access to ${dataAccessEvent.dataType} data: ${dataAccessEvent.details}`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            action: dataAccessEvent.action,
            dataType: dataAccessEvent.dataType
          },
          compliance: dataAccessEvent.dataType === 'PHI' ? ['21CFR11', 'HIPAA', 'GDPR'] : ['21CFR11']
        };

      case 'DATA_MODIFICATION':
        const dataModEvent = event as DataModificationEvent;
        return {
          action: `DATA_${dataModEvent.action}`,
          resourceType: dataModEvent.resourceType,
          resourceId: dataModEvent.resourceId,
          details: `${dataModEvent.action} operation on ${dataModEvent.resourceType}`,
          oldValue: dataModEvent.oldValue,
          newValue: dataModEvent.newValue,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            action: dataModEvent.action,
            changeReason: dataModEvent.changeReason
          },
          compliance: ['21CFR11', 'HIPAA', 'GDPR']
        };

      default:
        return {
          action: 'SYSTEM_EVENT',
          resourceType: 'Event',
          metadata: {
            eventId: event.id,
            eventType: event.type,
            ...event.metadata
          },
          compliance: ['21CFR11']
        };
    }
  }
}
