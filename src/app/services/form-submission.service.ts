import { Injectable, Inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IEventBus, FormSubmittedEvent } from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';

/**
 * Form Submission Service - Handles clinical form submissions
 * Demonstrates event-driven architecture for PHI/non-PHI data separation
 */
@Injectable({
  providedIn: 'root'
})
export class FormSubmissionService {
  constructor(
    @Inject(EVENT_BUS_TOKEN) private eventBus: IEventBus
  ) {}

  /**
   * Submit a clinical form
   * This triggers events that handle:
   * 1. Validation (ValidationEventHandler)
   * 2. Audit logging (AuditEventHandler)
   * 3. Data sync to Healthcare API and Firestore (DataSyncEventHandler)
   */
  submitForm(
    formId: string,
    studyId: string,
    patientId: string,
    formData: any,
    userId: string
  ): Observable<{ success: boolean; submissionId: string }> {
    const submissionId = this.generateSubmissionId();

    // Create form submission event
    const event: FormSubmittedEvent = {
      id: this.generateEventId(),
      type: 'FORM_SUBMITTED',
      timestamp: new Date(),
      formId,
      studyId,
      patientId,
      data: formData,
      userId,
      metadata: {
        submissionId,
        formVersion: this.getFormVersion(formId),
        clientInfo: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      }
    };

    // Publish the event - this triggers all registered handlers
    this.eventBus.publish(event);

    // Return success immediately - handlers work asynchronously
    return of({ 
      success: true, 
      submissionId 
    }).pipe(
      tap(() => {
        console.log(`Form submitted: ${formId} for patient ${patientId}`);
      })
    );
  }

  /**
   * Submit a batch of forms
   */
  submitBatch(
    submissions: Array<{
      formId: string;
      patientId: string;
      data: any;
    }>,
    studyId: string,
    userId: string
  ): Observable<{ success: boolean; submissionIds: string[] }> {
    const submissionIds: string[] = [];

    // Publish an event for each submission
    submissions.forEach(submission => {
      const submissionId = this.generateSubmissionId();
      submissionIds.push(submissionId);

      const event: FormSubmittedEvent = {
        id: this.generateEventId(),
        type: 'FORM_SUBMITTED',
        timestamp: new Date(),
        formId: submission.formId,
        studyId,
        patientId: submission.patientId,
        data: submission.data,
        userId,
        metadata: {
          submissionId,
          batchId: this.generateBatchId(),
          formVersion: this.getFormVersion(submission.formId)
        }
      };

      this.eventBus.publish(event);
    });

    return of({
      success: true,
      submissionIds
    }).pipe(
      tap(() => {
        console.log(`Batch submitted: ${submissions.length} forms`);
      })
    );
  }

  /**
   * Save a draft form (doesn't trigger full event flow)
   */
  saveDraft(
    formId: string,
    studyId: string,
    patientId: string,
    formData: any,
    userId: string
  ): Observable<{ success: boolean; draftId: string }> {
    const draftId = this.generateDraftId();

    // For drafts, we might want different event handling
    // This shows how we can have different event types for different workflows
    const event = {
      id: this.generateEventId(),
      type: 'FORM_DRAFT_SAVED',
      timestamp: new Date(),
      formId,
      studyId,
      patientId,
      data: formData,
      userId,
      metadata: {
        draftId,
        autoSave: true
      }
    };

    // This event might only trigger audit logging, not validation or sync
    this.eventBus.publish(event);

    return of({
      success: true,
      draftId
    });
  }

  private generateEventId(): string {
    return `form_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSubmissionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDraftId(): string {
    return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFormVersion(formId: string): string {
    // In a real app, this would look up the form template version
    return '1.0.0';
  }
}
