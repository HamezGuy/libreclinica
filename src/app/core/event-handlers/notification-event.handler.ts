import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { IEventHandler, IEvent, FormSubmittedEvent, PatientCreatedEvent } from '../interfaces';

/**
 * Notification Event Handler - Sends notifications for important events
 * Demonstrates how new handlers can be added without modifying existing code
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationEventHandler implements IEventHandler<IEvent> {
  private supportedEvents = [
    'FORM_SUBMITTED',
    'PATIENT_CREATED',
    'STUDY_MODIFIED',
    'USER_LOGIN',
    'DATA_EXPORTED',
    'VALIDATION_FAILED'
  ];

  canHandle(event: IEvent): boolean {
    return this.supportedEvents.includes(event.type);
  }

  handle(event: IEvent): Observable<void> {
    switch (event.type) {
      case 'FORM_SUBMITTED':
        this.handleFormSubmitted(event as FormSubmittedEvent);
        break;
      case 'PATIENT_CREATED':
        this.handlePatientCreated(event as PatientCreatedEvent);
        break;
      case 'USER_LOGIN':
        this.handleUserLogin(event);
        break;
      case 'DATA_EXPORTED':
        this.handleDataExported(event);
        break;
      case 'VALIDATION_FAILED':
        this.handleValidationFailed(event);
        break;
    }
    return of(void 0);
  }

  private handleFormSubmitted(event: FormSubmittedEvent): void {
    // In a real app, this would send actual notifications
    console.log(`📧 Notification: Form ${event.formId} submitted for patient ${event.patientId}`);
    
    // Example: Send email to study coordinator
    this.sendNotification({
      type: 'email',
      recipient: 'coordinator@study.com',
      subject: 'New Form Submission',
      body: `A new form has been submitted for study ${event.studyId}`,
      priority: 'normal'
    });

    // Example: Send in-app notification
    this.sendNotification({
      type: 'in-app',
      recipient: event.userId,
      title: 'Form Submitted Successfully',
      message: `Your form submission has been received and is being processed.`,
      priority: 'low'
    });
  }

  private handlePatientCreated(event: PatientCreatedEvent): void {
    console.log(`📧 Notification: New patient ${event.patientId} enrolled`);
    
    // Notify study team
    this.sendNotification({
      type: 'email',
      recipient: 'studyteam@clinical.com',
      subject: 'New Patient Enrollment',
      body: `A new patient has been enrolled in the study.`,
      priority: 'high'
    });
  }

  private handleUserLogin(event: IEvent): void {
    // Security notification for login
    if (event.metadata?.firstLogin) {
      this.sendNotification({
        type: 'email',
        recipient: event.userId!,
        subject: 'Welcome to EDC System',
        body: 'Your account has been activated. Please complete your training modules.',
        priority: 'normal'
      });
    }
  }

  private handleDataExported(event: IEvent): void {
    // Compliance notification for data export
    this.sendNotification({
      type: 'audit',
      recipient: 'compliance@company.com',
      subject: 'Data Export Alert',
      body: `Data export performed by user ${event.userId} at ${event.timestamp}`,
      priority: 'high'
    });
  }

  private handleValidationFailed(event: IEvent): void {
    // Alert for validation failures
    this.sendNotification({
      type: 'alert',
      recipient: event.userId!,
      subject: 'Validation Error',
      body: event.metadata?.error || 'Data validation failed',
      priority: 'urgent'
    });
  }

  private sendNotification(notification: {
    type: 'email' | 'sms' | 'in-app' | 'audit' | 'alert';
    recipient: string;
    subject?: string;
    title?: string;
    body?: string;
    message?: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }): void {
    // In a real implementation, this would integrate with notification services
    // For now, just log the notification
    console.log(`📨 ${notification.type.toUpperCase()} Notification:`, {
      to: notification.recipient,
      subject: notification.subject || notification.title,
      message: notification.body || notification.message,
      priority: notification.priority,
      timestamp: new Date().toISOString()
    });

    // Real implementation would call:
    // - SendGrid/SES for emails
    // - Twilio for SMS
    // - Firebase Cloud Messaging for push notifications
    // - Internal notification service for in-app
  }
}
