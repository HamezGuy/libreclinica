import { Injectable, Inject } from '@angular/core';
import { Observable, of, forkJoin, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { IEventHandler, FormSubmittedEvent, IEvent, IHealthcareApiService } from '../interfaces';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { HEALTHCARE_API_SERVICE_TOKEN } from '../injection-tokens';

/**
 * Data Sync Event Handler - Synchronizes PHI and non-PHI data
 * Ensures data consistency across Healthcare API and Firestore
 */
@Injectable({
  providedIn: 'root'
})
export class DataSyncEventHandler implements IEventHandler<IEvent> {
  private supportedEvents = ['FORM_SUBMITTED', 'PATIENT_UPDATED', 'STUDY_UPDATED'];

  constructor(
    @Inject(HEALTHCARE_API_SERVICE_TOKEN) private healthcareApi: IHealthcareApiService,
    private firestore: Firestore
  ) {}

  canHandle(event: IEvent): boolean {
    return this.supportedEvents.includes(event.type);
  }

  handle(event: IEvent): Observable<void> {
    switch (event.type) {
      case 'FORM_SUBMITTED':
        return this.syncFormSubmission(event as FormSubmittedEvent);
      default:
        return of(void 0);
    }
  }

  private syncFormSubmission(event: FormSubmittedEvent): Observable<void> {
    const { formId, studyId, patientId, data } = event;

    const { phiData, nonPhiData } = this.separateData(data);

    const syncOperations: Observable<any>[] = [];

    if (Object.keys(phiData).length > 0) {
      const observation = this.createFhirObservation(patientId, phiData);
      syncOperations.push(
        this.healthcareApi.createObservation(observation).pipe(
          catchError(error => {
            console.error('Failed to sync PHI data:', error);
            throw error;
          })
        )
      );
    }

    if (Object.keys(nonPhiData).length > 0) {
      const firestoreDoc = {
        formId,
        studyId,
        patientRef: patientId,
        data: nonPhiData,
        submittedAt: new Date(),
        submittedBy: event.userId,
        syncStatus: 'synced'
      };

      const submissionsCollection = collection(this.firestore, 'formSubmissions');
      syncOperations.push(
        from(addDoc(submissionsCollection, firestoreDoc)).pipe(
          catchError(error => {
            console.error('Failed to sync non-PHI data:', error);
            throw error;
          })
        )
      );
    }

    if (syncOperations.length === 0) {
      return of(void 0);
    }

    return forkJoin(syncOperations).pipe(
      map(() => {
        console.log('Data sync completed successfully');
        return void 0;
      }),
      catchError(error => {
        console.error('Data sync failed:', error);
        this.storeFailedSync(event);
        throw error;
      })
    );
  }

  private separateData(data: any): { phiData: any; nonPhiData: any } {
    const phiData: any = {};
    const nonPhiData: any = {};

    const phiPatterns = [
      /name/i, /dob|birth/i, /ssn|social/i, /mrn|medical_record/i,
      /address/i, /phone/i, /email/i, /insurance/i, /diagnosis/i,
      /medication/i, /allerg/i
    ];

    Object.entries(data).forEach(([key, value]) => {
      if (phiPatterns.some(pattern => pattern.test(key))) {
        phiData[key] = value;
      } else {
        nonPhiData[key] = value;
      }
    });

    return { phiData, nonPhiData };
  }

  private createFhirObservation(patientId: string, data: any): any {
    return {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: 'clinical-data',
          display: 'Clinical Data Entry'
        }]
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: new Date().toISOString(),
      component: Object.entries(data).map(([key, value]) => ({
        code: {
          coding: [{
            system: 'http://edc-system.com/codes',
            code: key,
            display: this.humanizeFieldName(key)
          }]
        },
        valueString: String(value)
      }))
    };
  }

  private humanizeFieldName(fieldName: string): string {
    return fieldName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()
      .split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  private storeFailedSync(event: IEvent): void {
    const failedSyncsCollection = collection(this.firestore, 'failedSyncs');
    addDoc(failedSyncsCollection, {
      event,
      failedAt: new Date(),
      retryCount: 0,
      status: 'pending'
    }).catch(error => {
      console.error('Failed to store failed sync:', error);
    });
  }
}
