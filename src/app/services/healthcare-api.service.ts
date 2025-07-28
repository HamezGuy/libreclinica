import { Injectable, inject, Inject, runInInjectionContext, Injector } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, from } from 'rxjs';
import { CloudAuditService } from './cloud-audit.service';
import { IEventBus, DataAccessEvent } from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';

// FHIR Resource Types for Clinical Data
export interface Patient {
  resourceType: 'Patient';
  id?: string;
  identifier?: Array<{
    system: string;
    value: string;
  }>;
  name?: Array<{
    use: 'official' | 'usual' | 'temp';
    family: string;
    given: string[];
  }>;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: Array<{
    use: 'home' | 'work' | 'temp';
    line: string[];
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  telecom?: Array<{
    system: 'phone' | 'email';
    value: string;
    use: 'home' | 'work' | 'mobile';
  }>;
}

export interface Observation {
  resourceType: 'Observation';
  id?: string;
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject: {
    reference: string; // Reference to Patient
  };
  effectiveDateTime?: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system: string;
    code: string;
  };
  valueString?: string;
  valueBoolean?: boolean;
  performer?: Array<{
    reference: string;
  }>;
}

export interface Encounter {
  resourceType: 'Encounter';
  id?: string;
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled';
  class: {
    system: string;
    code: string;
    display: string;
  };
  subject: {
    reference: string; // Reference to Patient
  };
  participant?: Array<{
    type?: Array<{
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    }>;
    individual: {
      reference: string;
    };
  }>;
  period?: {
    start: string;
    end?: string;
  };
  reasonCode?: Array<{
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  }>;
}

export interface Consent {
  resourceType: 'Consent';
  id?: string;
  status: 'draft' | 'proposed' | 'active' | 'rejected' | 'inactive' | 'entered-in-error';
  scope: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  category: Array<{
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  }>;
  patient: {
    reference: string;
  };
  dateTime: string;
  policy?: Array<{
    authority?: string;
    uri?: string;
  }>;
  provision?: {
    type: 'deny' | 'permit';
    period?: {
      start: string;
      end?: string;
    };
    purpose?: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
}

// Healthcare API Configuration
export interface HealthcareConfig {
  projectId: string;
  location: string;
  datasetId: string;
  fhirStoreId: string;
  dicomStoreId?: string;
  hl7v2StoreId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class HealthcareApiService {
  private http = inject(HttpClient);
  private functions = inject(Functions);
  private auditService = inject(CloudAuditService);
  private injector: Injector = inject(Injector);
  private eventBus = inject(EVENT_BUS_TOKEN);
  
  // Configuration will be loaded from environment
  private config: HealthcareConfig = {
    projectId: 'data-entry-project-465905',
    location: 'us-central1',
    datasetId: 'edc-clinical-data',
    fhirStoreId: 'edc-fhir-store'
  };

  private get fhirBaseUrl(): string {
    return `https://healthcare.googleapis.com/v1/projects/${this.config.projectId}/locations/${this.config.location}/datasets/${this.config.datasetId}/fhirStores/${this.config.fhirStoreId}/fhir`;
  }

  /**
   * Create a new patient record in Healthcare API
   * All PHI data is stored in HIPAA-compliant FHIR store
   */
  async createPatient(patient: Patient): Promise<Patient> {
    try {
      // Call Cloud Function to create patient (handles auth)
      const result = await runInInjectionContext(this.injector, async () => {
        const createPatientFn = httpsCallable<Patient, Patient>(this.functions, 'createPatient');
        return await createPatientFn(patient);
      });
      
      // Publish data access event for audit trail
      const dataAccessEvent: DataAccessEvent = {
        id: `data_access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'DATA_ACCESS',
        timestamp: new Date(),
        userId: 'current_user', // This should be injected from auth service
        resourceType: 'Patient',
        resourceId: result.data.id || patient.identifier?.[0]?.value || 'new',
        action: 'CREATE',
        dataType: 'PHI',
        details: 'Creating new patient record in Healthcare API'
      };
      
      this.eventBus.publish(dataAccessEvent);
      
      return result.data;
    } catch (error) {
      console.error('Failed to create patient:', error);
      throw error;
    }
  }

  /**
   * Get patient by ID from Healthcare API
   */
  async getPatient(patientId: string): Promise<Patient> {
    try {
      // Log the access attempt
      await this.auditService.logDataAccess(
        'VIEW',
        'Patient',
        patientId,
        'Accessing patient record from Healthcare API'
      );

      const result = await runInInjectionContext(this.injector, async () => {
        const getPatientFn = httpsCallable<{patientId: string}, Patient>(this.functions, 'getPatient');
        return await getPatientFn({ patientId });
      });
      
      return result.data;
    } catch (error) {
      console.error('Failed to get patient:', error);
      throw error;
    }
  }

  /**
   * Search patients with filters
   */
  async searchPatients(params: {
    name?: string;
    identifier?: string;
    birthdate?: string;
    gender?: string;
  }): Promise<Patient[]> {
    try {
      await this.auditService.logDataAccess(
        'VIEW',
        'Patient',
        'search',
        `Searching patients with params: ${JSON.stringify(params)}`
      );

      const result = await runInInjectionContext(this.injector, async () => {
        const searchPatientsFn = httpsCallable<any, {entry: Array<{resource: Patient}>}>(
          this.functions, 
          'searchPatients'
        );
        return await searchPatientsFn(params);
      });
      
      return result.data.entry?.map(e => e.resource) || [];
    } catch (error) {
      console.error('Failed to search patients:', error);
      throw error;
    }
  }

  /**
   * Create clinical observation (lab results, vitals, etc.)
   */
  async createObservation(observation: Observation): Promise<Observation> {
    try {
      await this.auditService.logDataAccess(
        'CREATE',
        'Observation',
        observation.subject.reference,
        `Creating observation: ${observation.code.coding[0].display}`
      );

      const result = await runInInjectionContext(this.injector, async () => {
        const createObservationFn = httpsCallable<Observation, Observation>(
          this.functions, 
          'createObservation'
        );
        return await createObservationFn(observation);
      });
      
      return result.data;
    } catch (error) {
      console.error('Failed to create observation:', error);
      throw error;
    }
  }

  /**
   * Get all observations for a patient
   */
  async getPatientObservations(patientId: string): Promise<Observation[]> {
    try {
      await this.auditService.logDataAccess(
        'VIEW',
        'Observation',
        patientId,
        'Accessing patient observations'
      );

      const getObservationsFn = httpsCallable<{patientId: string}, {entry: Array<{resource: Observation}>}>(
        this.functions, 
        'getPatientObservations'
      );
      const result = await getObservationsFn({ patientId });
      
      return result.data.entry?.map(e => e.resource) || [];
    } catch (error) {
      console.error('Failed to get observations:', error);
      throw error;
    }
  }

  /**
   * Create patient encounter (visit)
   */
  async createEncounter(encounter: Encounter): Promise<Encounter> {
    try {
      await this.auditService.logDataAccess(
        'CREATE',
        'Encounter',
        encounter.subject.reference,
        'Creating patient encounter'
      );

      const createEncounterFn = httpsCallable<Encounter, Encounter>(
        this.functions, 
        'createEncounter'
      );
      const result = await createEncounterFn(encounter);
      
      return result.data;
    } catch (error) {
      console.error('Failed to create encounter:', error);
      throw error;
    }
  }

  /**
   * Create or update patient consent
   */
  async createConsent(consent: Consent): Promise<Consent> {
    try {
      await this.auditService.logComplianceAction(
        'CONSENT_GIVEN',
        `Patient ${consent.patient.reference} provided consent for ${consent.category[0].coding[0].display}`
      );

      const createConsentFn = httpsCallable<Consent, Consent>(
        this.functions, 
        'createConsent'
      );
      const result = await createConsentFn(consent);
      
      return result.data;
    } catch (error) {
      console.error('Failed to create consent:', error);
      throw error;
    }
  }

  /**
   * Export patient data for portability (GDPR/CCPA compliance)
   */
  async exportPatientData(patientId: string): Promise<any> {
    try {
      await this.auditService.logDataAccess(
        'EXPORT',
        'Patient',
        patientId,
        'Exporting patient data for portability request'
      );

      const result = await runInInjectionContext(this.injector, async () => {
        const exportDataFn = httpsCallable<{patientId: string}, any>(
          this.functions, 
          'exportPatientData'
        );
        return await exportDataFn({ patientId });
      });
      
      return result.data;
    } catch (error) {
      console.error('Failed to export patient data:', error);
      throw error;
    }
  }

  /**
   * Delete patient data (GDPR right to be forgotten)
   * Note: This may be restricted based on regulatory requirements
   */
  async deletePatientData(patientId: string, reason: string): Promise<void> {
    try {
      await this.auditService.logDataAccess(
        'DELETE',
        'Patient',
        patientId,
        `Deleting patient data. Reason: ${reason}`
      );

      const deleteDataFn = httpsCallable<{patientId: string, reason: string}, void>(
        this.functions, 
        'deletePatientData'
      );
      await deleteDataFn({ patientId, reason });
    } catch (error) {
      console.error('Failed to delete patient data:', error);
      throw error;
    }
  }

  /**
   * Validate FHIR resource before submission
   */
  async validateResource(resource: any): Promise<{valid: boolean; errors?: string[]}> {
    try {
      const validateFn = httpsCallable<any, {valid: boolean; errors?: string[]}>(
        this.functions, 
        'validateFhirResource'
      );
      const result = await validateFn(resource);
      
      return result.data;
    } catch (error) {
      console.error('Failed to validate resource:', error);
      throw error;
    }
  }

  /**
   * Bulk import clinical data
   */
  async bulkImport(resources: any[]): Promise<{success: number; failed: number; errors: any[]}> {
    try {
      await this.auditService.logDataAccess(
        'CREATE',
        'BulkImport',
        `${resources.length} resources`,
        'Performing bulk import of clinical data'
      );

      const bulkImportFn = httpsCallable<any[], {success: number; failed: number; errors: any[]}>(
        this.functions, 
        'bulkImportFhir'
      );
      const result = await bulkImportFn(resources);
      
      return result.data;
    } catch (error) {
      console.error('Failed to bulk import:', error);
      throw error;
    }
  }
}
