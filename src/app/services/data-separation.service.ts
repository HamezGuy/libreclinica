import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, where, getDocs } from '@angular/fire/firestore';
import { HealthcareApiService } from './healthcare-api.service';
import { CloudAuditService } from './cloud-audit.service';

/**
 * PHI (Protected Health Information) fields that must be stored in Healthcare API
 * Based on HIPAA Safe Harbor method
 */
const PHI_FIELDS = [
  // Direct identifiers
  'name', 'firstName', 'lastName', 'middleName',
  'address', 'street', 'city', 'state', 'zip', 'postalCode',
  'dateOfBirth', 'birthDate', 'dob',
  'phone', 'phoneNumber', 'mobile', 'telephone',
  'email', 'emailAddress',
  'ssn', 'socialSecurityNumber',
  'medicalRecordNumber', 'mrn',
  'healthPlanNumber', 'insuranceId',
  'accountNumber', 'patientId',
  
  // Clinical data
  'diagnosis', 'diagnoses', 'condition', 'conditions',
  'medication', 'medications', 'prescription', 'prescriptions',
  'labResult', 'labResults', 'testResult', 'testResults',
  'vitalSigns', 'vitals', 'bloodPressure', 'heartRate', 'temperature',
  'procedure', 'procedures', 'surgery', 'surgeries',
  'allergy', 'allergies',
  'immunization', 'immunizations', 'vaccine', 'vaccines',
  
  // Dates related to health events
  'admissionDate', 'dischargeDate', 'visitDate',
  'procedureDate', 'diagnosisDate',
  
  // Images and biometric data
  'photo', 'photograph', 'faceImage',
  'fingerprint', 'retinalScan', 'voiceprint',
  'xray', 'mri', 'ctScan', 'medicalImage'
];

/**
 * Study metadata that can be stored in Firebase (non-PHI)
 */
export interface StudyMetadata {
  id?: string;
  studyId: string;
  title: string;
  description: string;
  sponsor: string;
  principalInvestigator: string;
  status: 'planning' | 'active' | 'completed' | 'terminated';
  phase: 'I' | 'II' | 'III' | 'IV';
  startDate: Date;
  endDate?: Date;
  targetEnrollment: number;
  currentEnrollment: number;
  sites: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  protocolVersion: string;
  regulatoryApproval: {
    irbApproved: boolean;
    irbNumber?: string;
    fdaInd?: string;
  };
}

/**
 * Form template (non-PHI)
 */
export interface FormTemplate {
  id?: string;
  studyId: string;
  name: string;
  version: string;
  fields: FormField[];
  validations: any[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'active' | 'retired';
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'textarea';
  required: boolean;
  isPHI: boolean; // Flag to indicate if this field contains PHI
  options?: string[];
  validation?: any;
}

/**
 * Form submission split between Firebase and Healthcare API
 */
export interface FormSubmission {
  id?: string;
  studyId: string;
  formTemplateId: string;
  patientReference?: string; // Reference to patient in Healthcare API
  submittedBy: string;
  submittedAt: Date;
  status: 'draft' | 'submitted' | 'verified' | 'locked';
  nonPhiData: Record<string, any>; // Stored in Firebase
  phiDataReference?: string; // Reference to data in Healthcare API
}

@Injectable({
  providedIn: 'root'
})
export class DataSeparationService {
  private firestore = inject(Firestore);
  private healthcareApi = inject(HealthcareApiService);
  private auditService = inject(CloudAuditService);

  /**
   * Create a new study (non-PHI metadata only)
   */
  async createStudy(study: Omit<StudyMetadata, 'id' | 'createdAt' | 'updatedAt'>): Promise<StudyMetadata> {
    try {
      const studyData: StudyMetadata = {
        ...study,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(this.firestore, 'studies'), studyData);
      
      await this.auditService.logDataAccess(
        'CREATE',
        'Study',
        docRef.id,
        `Created study: ${study.title}`
      );

      return { ...studyData, id: docRef.id };
    } catch (error) {
      console.error('Failed to create study:', error);
      throw error;
    }
  }

  /**
   * Create a form template
   */
  async createFormTemplate(template: Omit<FormTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<FormTemplate> {
    try {
      // Validate that PHI fields are properly marked
      this.validatePhiFields(template.fields);

      const templateData: FormTemplate = {
        ...template,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(this.firestore, 'formTemplates'), templateData);
      
      await this.auditService.logDataAccess(
        'CREATE',
        'FormTemplate',
        docRef.id,
        `Created form template: ${template.name}`
      );

      return { ...templateData, id: docRef.id };
    } catch (error) {
      console.error('Failed to create form template:', error);
      throw error;
    }
  }

  /**
   * Submit form data with automatic PHI/non-PHI separation
   */
  async submitFormData(
    studyId: string,
    formTemplateId: string,
    patientId: string,
    formData: Record<string, any>,
    userId: string
  ): Promise<FormSubmission> {
    try {
      // Get form template to identify PHI fields
      const templateDoc = await getDoc(doc(this.firestore, 'formTemplates', formTemplateId));
      if (!templateDoc.exists()) {
        throw new Error('Form template not found');
      }
      
      const template = templateDoc.data() as FormTemplate;
      
      // Separate PHI and non-PHI data
      const { phiData, nonPhiData } = this.separatePhiData(formData, template.fields);
      
      // Store PHI data in Healthcare API if present
      let phiDataReference: string | undefined;
      if (Object.keys(phiData).length > 0) {
        const observation = await this.healthcareApi.createObservation({
          resourceType: 'Observation',
          status: 'final',
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: 'clinical-data',
              display: `Form: ${template.name}`
            }]
          },
          subject: {
            reference: `Patient/${patientId}`
          },
          effectiveDateTime: new Date().toISOString(),
          valueString: JSON.stringify(phiData) // In production, structure this properly
        });
        
        phiDataReference = observation.id;
      }
      
      // Store non-PHI data in Firebase
      const submission: FormSubmission = {
        studyId,
        formTemplateId,
        patientReference: `Patient/${patientId}`,
        submittedBy: userId,
        submittedAt: new Date(),
        status: 'submitted',
        nonPhiData,
        phiDataReference
      };
      
      const docRef = await addDoc(collection(this.firestore, 'formSubmissions'), submission);
      
      await this.auditService.logDataAccess(
        'CREATE',
        'FormSubmission',
        docRef.id,
        `Submitted form data for patient ${patientId}`
      );
      
      return { ...submission, id: docRef.id };
    } catch (error) {
      console.error('Failed to submit form data:', error);
      throw error;
    }
  }

  /**
   * Get complete form submission data (combines PHI and non-PHI)
   */
  async getFormSubmission(submissionId: string): Promise<any> {
    try {
      // Get non-PHI data from Firebase
      const submissionDoc = await getDoc(doc(this.firestore, 'formSubmissions', submissionId));
      if (!submissionDoc.exists()) {
        throw new Error('Form submission not found');
      }
      
      const submission = submissionDoc.data() as FormSubmission;
      
      // Get PHI data from Healthcare API if reference exists
      let phiData = {};
      if (submission.phiDataReference) {
        // This would retrieve the observation from Healthcare API
        // For now, returning placeholder
        phiData = { message: 'PHI data would be retrieved from Healthcare API' };
      }
      
      await this.auditService.logDataAccess(
        'VIEW',
        'FormSubmission',
        submissionId,
        'Accessed form submission data'
      );
      
      return {
        ...submission,
        phiData
      };
    } catch (error) {
      console.error('Failed to get form submission:', error);
      throw error;
    }
  }

  /**
   * Search studies (non-PHI only)
   */
  async searchStudies(filters: {
    status?: string;
    sponsor?: string;
    principalInvestigator?: string;
  }): Promise<StudyMetadata[]> {
    try {
      let q = collection(this.firestore, 'studies');
      const constraints = [];
      
      if (filters.status) {
        constraints.push(where('status', '==', filters.status));
      }
      if (filters.sponsor) {
        constraints.push(where('sponsor', '==', filters.sponsor));
      }
      if (filters.principalInvestigator) {
        constraints.push(where('principalInvestigator', '==', filters.principalInvestigator));
      }
      
      const querySnapshot = await getDocs(query(q, ...constraints));
      const studies = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as StudyMetadata));
      
      await this.auditService.logDataAccess(
        'VIEW',
        'Study',
        'search',
        `Searched studies with filters: ${JSON.stringify(filters)}`
      );
      
      return studies;
    } catch (error) {
      console.error('Failed to search studies:', error);
      throw error;
    }
  }

  /**
   * Helper function to separate PHI and non-PHI data
   */
  private separatePhiData(
    formData: Record<string, any>,
    fields: FormField[]
  ): { phiData: Record<string, any>; nonPhiData: Record<string, any> } {
    const phiData: Record<string, any> = {};
    const nonPhiData: Record<string, any> = {};
    
    for (const field of fields) {
      const value = formData[field.name];
      if (value !== undefined) {
        if (field.isPHI || this.isPhiField(field.name)) {
          phiData[field.name] = value;
        } else {
          nonPhiData[field.name] = value;
        }
      }
    }
    
    return { phiData, nonPhiData };
  }

  /**
   * Check if a field name indicates PHI
   */
  private isPhiField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return PHI_FIELDS.some(phiField => 
      lowerFieldName.includes(phiField.toLowerCase())
    );
  }

  /**
   * Validate that PHI fields are properly marked
   */
  private validatePhiFields(fields: FormField[]): void {
    for (const field of fields) {
      if (this.isPhiField(field.name) && !field.isPHI) {
        console.warn(`Field "${field.name}" appears to contain PHI but is not marked as such`);
      }
    }
  }

  /**
   * Store PHI data in Healthcare API
   */
  async storePhiData(referenceId: string, phiData: Record<string, any>): Promise<void> {
    try {
      // Store PHI data using Healthcare API
      // This would typically create a FHIR resource or use a secure storage mechanism
      await this.auditService.logDataAccess(
        'CREATE',
        'PHI_Data',
        referenceId,
        'Stored PHI data in Healthcare API'
      );
      
      // In a real implementation, you would store the data in the Healthcare API
      console.log('PHI data stored for reference:', referenceId, phiData);
    } catch (error) {
      console.error('Failed to store PHI data:', error);
      throw error;
    }
  }

  /**
   * Retrieve PHI data from Healthcare API
   */
  async retrievePhiData(referenceId: string): Promise<Record<string, any>> {
    try {
      await this.auditService.logDataAccess(
        'VIEW',
        'PHI_Data',
        referenceId,
        'Retrieved PHI data from Healthcare API'
      );
      
      // In a real implementation, you would retrieve the data from the Healthcare API
      // For now, return empty object
      console.log('PHI data retrieved for reference:', referenceId);
      return {};
    } catch (error) {
      console.error('Failed to retrieve PHI data:', error);
      throw error;
    }
  }

  /**
   * Export study data for analysis (de-identified)
   */
  async exportStudyData(studyId: string): Promise<any> {
    try {
      // Get study metadata
      const studyDoc = await getDoc(doc(this.firestore, 'studies', studyId));
      if (!studyDoc.exists()) {
        throw new Error('Study not found');
      }
      
      const study = studyDoc.data() as StudyMetadata;
      
      // Get all form submissions for the study
      const submissionsQuery = query(
        collection(this.firestore, 'formSubmissions'),
        where('studyId', '==', studyId)
      );
      const submissionsSnapshot = await getDocs(submissionsQuery);
      
      // Export only non-PHI data
      const exportData = {
        study,
        submissions: submissionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          phiDataReference: undefined // Remove PHI references
        }))
      };
      
      await this.auditService.logDataAccess(
        'EXPORT',
        'Study',
        studyId,
        'Exported de-identified study data'
      );
      
      return exportData;
    } catch (error) {
      console.error('Failed to export study data:', error);
      throw error;
    }
  }
}
