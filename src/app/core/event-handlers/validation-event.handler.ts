import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { IEventHandler, DocumentSavedEvent, FormSubmittedEvent, IEvent } from '../interfaces';

/**
 * Validation Event Handler - Validates data before processing
 * Ensures data integrity and compliance requirements
 */
@Injectable({
  providedIn: 'root'
})
export class ValidationEventHandler implements IEventHandler<IEvent> {
  private supportedEvents = ['DOCUMENT_SAVED', 'FORM_SUBMITTED'];

  canHandle(event: IEvent): boolean {
    return this.supportedEvents.includes(event.type);
  }

  handle(event: IEvent): Observable<void> {
    try {
      switch (event.type) {
        case 'DOCUMENT_SAVED':
          this.validateDocument(event as DocumentSavedEvent);
          break;
        case 'FORM_SUBMITTED':
          this.validateFormSubmission(event as FormSubmittedEvent);
          break;
      }
      return of(void 0);
    } catch (error: any) {
      console.error('Validation failed:', error);
      return throwError(() => new Error(`Validation failed: ${error.message}`));
    }
  }

  private validateDocument(event: DocumentSavedEvent): void {
    // Validate required fields
    if (!event.documentId) {
      throw new Error('Document ID is required');
    }
    if (!event.documentType) {
      throw new Error('Document type is required');
    }
    if (!event.data) {
      throw new Error('Document data is required');
    }

    // Validate document type
    const validTypes = ['Study', 'FormTemplate', 'Patient', 'Observation', 'Consent'];
    if (!validTypes.includes(event.documentType)) {
      throw new Error(`Invalid document type: ${event.documentType}`);
    }

    // Additional validation based on document type
    switch (event.documentType) {
      case 'Study':
        this.validateStudy(event.data);
        break;
      case 'Patient':
        this.validatePatient(event.data);
        break;
      case 'FormTemplate':
        this.validateFormTemplate(event.data);
        break;
    }
  }

  private validateFormSubmission(event: FormSubmittedEvent): void {
    if (!event.formId) {
      throw new Error('Form ID is required');
    }
    if (!event.studyId) {
      throw new Error('Study ID is required');
    }
    if (!event.patientId) {
      throw new Error('Patient ID is required');
    }
    if (!event.data || Object.keys(event.data).length === 0) {
      throw new Error('Form data cannot be empty');
    }

    // Validate data types and ranges
    this.validateFormData(event.data);
  }

  private validateStudy(data: any): void {
    if (!data.name || data.name.length < 3) {
      throw new Error('Study name must be at least 3 characters');
    }
    if (!data.protocol) {
      throw new Error('Study protocol is required');
    }
    if (!data.startDate) {
      throw new Error('Study start date is required');
    }
    if (data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
      throw new Error('Study end date must be after start date');
    }
  }

  private validatePatient(data: any): void {
    // Don't validate PHI fields here - that's handled by Healthcare API
    // Just ensure structure is correct
    if (!data.resourceType || data.resourceType !== 'Patient') {
      throw new Error('Invalid patient resource type');
    }
  }

  private validateFormTemplate(data: any): void {
    if (!data.name) {
      throw new Error('Form template name is required');
    }
    if (!data.fields || !Array.isArray(data.fields) || data.fields.length === 0) {
      throw new Error('Form template must have at least one field');
    }

    // Validate each field
    data.fields.forEach((field: any, index: number) => {
      if (!field.id) {
        throw new Error(`Field ${index} must have an ID`);
      }
      if (!field.name) {
        throw new Error(`Field ${index} must have a name`);
      }
      if (!field.type) {
        throw new Error(`Field ${index} must have a type`);
      }
      if (!field.label) {
        throw new Error(`Field ${index} must have a label`);
      }
    });
  }

  private validateFormData(data: any): void {
    Object.entries(data).forEach(([key, value]) => {
      // Skip null/undefined values for optional fields
      if (value === null || value === undefined) {
        return;
      }

      // Validate data types
      if (typeof value === 'string' && value.length > 5000) {
        throw new Error(`Field ${key} exceeds maximum length of 5000 characters`);
      }

      // Validate dates
      if (key.toLowerCase().includes('date') && value) {
        const date = new Date(value as string);
        if (isNaN(date.getTime())) {
          throw new Error(`Field ${key} contains invalid date`);
        }
        // Ensure date is not in the future (for most clinical data)
        if (date > new Date() && !key.toLowerCase().includes('planned')) {
          throw new Error(`Field ${key} cannot be in the future`);
        }
      }

      // Validate numeric ranges
      if (typeof value === 'number') {
        if (key.toLowerCase().includes('age') && (value < 0 || value > 150)) {
          throw new Error(`Field ${key} must be between 0 and 150`);
        }
        if (key.toLowerCase().includes('weight') && (value < 0 || value > 1000)) {
          throw new Error(`Field ${key} must be between 0 and 1000`);
        }
        if (key.toLowerCase().includes('height') && (value < 0 || value > 300)) {
          throw new Error(`Field ${key} must be between 0 and 300`);
        }
      }
    });
  }
}
