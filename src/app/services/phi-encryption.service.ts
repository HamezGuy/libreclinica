import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PhiClassification, PhiFieldType } from '../models/form-template.model';

export interface EncryptedPhiData {
  encryptedValue: string;
  encryptionKeyId: string;
  algorithm: string;
  timestamp: Date;
  fieldType: PhiFieldType;
  accessLevel: string;
}

export interface PhiDecryptionRequest {
  encryptedData: EncryptedPhiData;
  userId: string;
  reason: string;
  accessLevel: string;
}

export interface HealthcareApiConfig {
  projectId: string;
  datasetId: string;
  fhirStoreId: string;
  encryptionKeyId?: string;
  location: string;
}

@Injectable({
  providedIn: 'root'
})
export class PhiEncryptionService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'https://healthcare.googleapis.com/v1';
  
  // Default configuration - should be overridden by environment settings
  private defaultConfig: HealthcareApiConfig = {
    projectId: 'data-entry-project-465905',
    datasetId: 'edc-dataset',
    fhirStoreId: 'edc-fhir-store',
    location: 'us-central1',
    encryptionKeyId: 'projects/data-entry-project-465905/locations/us-central1/keyRings/edc-key-ring/cryptoKeys/phi-encryption-key'
  };

  /**
   * Encrypts PHI data using Google Cloud Healthcare API
   */
  async encryptPhiData(
    value: any, 
    phiClassification: PhiClassification,
    config?: HealthcareApiConfig
  ): Promise<EncryptedPhiData> {
    if (!phiClassification.isPhiField || !phiClassification.encryptionRequired) {
      throw new Error('Field is not marked for PHI encryption');
    }

    const apiConfig = config || this.defaultConfig;
    
    try {
      // Convert value to string for encryption
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      // Use Google Cloud KMS for encryption
      const encryptionUrl = `https://cloudkms.googleapis.com/v1/${apiConfig.encryptionKeyId}:encrypt`;
      
      const encryptionRequest = {
        plaintext: btoa(stringValue) // Base64 encode
      };

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`
      });

      const response = await this.http.post<any>(encryptionUrl, encryptionRequest, { headers }).toPromise();

      return {
        encryptedValue: response.ciphertext,
        encryptionKeyId: apiConfig.encryptionKeyId || 'default',
        algorithm: 'AES-256-GCM',
        timestamp: new Date(),
        fieldType: phiClassification.phiType || 'patient_id',
        accessLevel: phiClassification.accessLevel
      };
    } catch (error) {
      console.error('PHI encryption failed:', error);
      throw new Error(`PHI encryption failed: ${error}`);
    }
  }

  /**
   * Decrypts PHI data using Google Cloud Healthcare API
   */
  async decryptPhiData(
    encryptedData: EncryptedPhiData,
    userId: string,
    reason: string
  ): Promise<any> {
    try {
      // Log access attempt for audit trail
      await this.logPhiAccess(userId, encryptedData, reason);

      const decryptionUrl = `https://cloudkms.googleapis.com/v1/${encryptedData.encryptionKeyId}:decrypt`;
      
      const decryptionRequest = {
        ciphertext: encryptedData.encryptedValue
      };

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`
      });

      const response = await this.http.post<any>(decryptionUrl, decryptionRequest, { headers }).toPromise();
      
      // Decode base64 and parse if necessary
      const decryptedString = atob(response.plaintext);
      
      try {
        return JSON.parse(decryptedString);
      } catch {
        return decryptedString;
      }
    } catch (error) {
      console.error('PHI decryption failed:', error);
      throw new Error(`PHI decryption failed: ${error}`);
    }
  }

  /**
   * Creates a FHIR Patient resource from form data
   */
  async createFhirPatient(
    patientData: Record<string, any>,
    config?: HealthcareApiConfig
  ): Promise<any> {
    const apiConfig = config || this.defaultConfig;
    
    // Map form data to FHIR Patient resource
    const fhirPatient = this.mapToFhirPatient(patientData);
    
    const fhirUrl = `${this.baseUrl}/projects/${apiConfig.projectId}/locations/${apiConfig.location}/datasets/${apiConfig.datasetId}/fhirStores/${apiConfig.fhirStoreId}/fhir/Patient`;
    
    const headers = new HttpHeaders({
      'Content-Type': 'application/fhir+json',
      'Authorization': `Bearer ${await this.getAccessToken()}`
    });

    try {
      const response = await this.http.post<any>(fhirUrl, fhirPatient, { headers }).toPromise();
      return response;
    } catch (error) {
      console.error('FHIR Patient creation failed:', error);
      throw new Error(`FHIR Patient creation failed: ${error}`);
    }
  }

  /**
   * Retrieves a FHIR Patient resource
   */
  async getFhirPatient(patientId: string, config?: HealthcareApiConfig): Promise<any> {
    const apiConfig = config || this.defaultConfig;
    
    const fhirUrl = `${this.baseUrl}/projects/${apiConfig.projectId}/locations/${apiConfig.location}/datasets/${apiConfig.datasetId}/fhirStores/${apiConfig.fhirStoreId}/fhir/Patient/${patientId}`;
    
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${await this.getAccessToken()}`
    });

    try {
      return await this.http.get<any>(fhirUrl, { headers }).toPromise();
    } catch (error) {
      console.error('FHIR Patient retrieval failed:', error);
      throw new Error(`FHIR Patient retrieval failed: ${error}`);
    }
  }

  /**
   * Maps form data to FHIR Patient resource format
   */
  private mapToFhirPatient(patientData: Record<string, any>): any {
    const patient: any = {
      resourceType: 'Patient',
      id: patientData['patientId'] || this.generatePatientId(),
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        security: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
            code: 'R',
            display: 'restricted'
          }
        ]
      },
      identifier: [],
      name: [],
      telecom: [],
      address: [],
      contact: []
    };

    // Map patient name
    if (patientData['firstName'] || patientData['lastName']) {
      patient.name.push({
        use: 'official',
        family: patientData['lastName'],
        given: patientData['firstName'] ? [patientData['firstName']] : []
      });
    }

    // Map date of birth
    if (patientData['dateOfBirth']) {
      patient.birthDate = patientData['dateOfBirth'];
    }

    // Map gender
    if (patientData['gender']) {
      patient.gender = patientData['gender'].toLowerCase();
    }

    // Map identifiers
    if (patientData['medicalRecordNumber']) {
      patient.identifier.push({
        use: 'usual',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'MR',
            display: 'Medical record number'
          }]
        },
        value: patientData['medicalRecordNumber']
      });
    }

    if (patientData['ssn']) {
      patient.identifier.push({
        use: 'official',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'SS',
            display: 'Social Security number'
          }]
        },
        value: patientData['ssn']
      });
    }

    // Map contact information
    if (patientData['phone']) {
      patient.telecom.push({
        system: 'phone',
        value: patientData['phone'],
        use: 'home'
      });
    }

    if (patientData['email']) {
      patient.telecom.push({
        system: 'email',
        value: patientData['email'],
        use: 'home'
      });
    }

    // Map address
    if (patientData['address']) {
      patient.address.push({
        use: 'home',
        line: [patientData['address'].street],
        city: patientData['address'].city,
        state: patientData['address'].state,
        postalCode: patientData['address'].postalCode,
        country: patientData['address'].country
      });
    }

    return patient;
  }

  /**
   * Logs PHI access for audit trail
   */
  private async logPhiAccess(
    userId: string, 
    encryptedData: EncryptedPhiData, 
    reason: string
  ): Promise<void> {
    // Implementation would integrate with your audit logging system
    console.log(`PHI Access Log: User ${userId} accessed ${encryptedData.fieldType} data. Reason: ${reason}`);
    
    // In a real implementation, this would call your audit service
    // await this.auditService.logPhiAccess({
    //   userId,
    //   fieldType: encryptedData.fieldType,
    //   accessLevel: encryptedData.accessLevel,
    //   reason,
    //   timestamp: new Date(),
    //   encryptionKeyId: encryptedData.encryptionKeyId
    // });
  }

  /**
   * Gets access token for Google Cloud APIs
   */
  private async getAccessToken(): Promise<string> {
    // In a real implementation, this would use proper authentication
    // For development, you might use a service account key or OAuth
    
    // This is a placeholder - you'll need to implement proper authentication
    return 'placeholder-access-token';
  }

  /**
   * Generates a unique patient ID
   */
  private generatePatientId(): string {
    return `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validates PHI field configuration
   */
  validatePhiConfiguration(phiClassification: PhiClassification): boolean {
    if (!phiClassification.isPhiField) {
      return true; // Non-PHI fields don't need validation
    }

    // Check required properties for PHI fields
    if (!phiClassification.phiType) {
      console.error('PHI field must have a phiType specified');
      return false;
    }

    if (!phiClassification.accessLevel) {
      console.error('PHI field must have an accessLevel specified');
      return false;
    }

    if (phiClassification.encryptionRequired && !phiClassification.retentionPeriodDays) {
      console.warn('PHI field with encryption should have retention period specified');
    }

    return true;
  }

  /**
   * Gets PHI field configuration based on field type
   */
  getDefaultPhiConfiguration(phiType: PhiFieldType): PhiClassification {
    const configurations: Record<PhiFieldType, PhiClassification> = {
      patient_name: {
        isPhiField: true,
        phiType: 'patient_name',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555 // 7 years
      },
      patient_id: {
        isPhiField: true,
        phiType: 'patient_id',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: false,
        retentionPeriodDays: 2555
      },
      date_of_birth: {
        isPhiField: true,
        phiType: 'date_of_birth',
        encryptionRequired: true,
        accessLevel: 'confidential',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      ssn: {
        isPhiField: true,
        phiType: 'ssn',
        encryptionRequired: true,
        accessLevel: 'confidential',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      address: {
        isPhiField: true,
        phiType: 'address',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      phone_number: {
        isPhiField: true,
        phiType: 'phone_number',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      email_address: {
        isPhiField: true,
        phiType: 'email_address',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      medical_record_number: {
        isPhiField: true,
        phiType: 'medical_record_number',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: false,
        retentionPeriodDays: 2555
      },
      insurance_id: {
        isPhiField: true,
        phiType: 'insurance_id',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      emergency_contact: {
        isPhiField: true,
        phiType: 'emergency_contact',
        encryptionRequired: true,
        accessLevel: 'restricted',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      },
      genetic_data: {
        isPhiField: true,
        phiType: 'genetic_data',
        encryptionRequired: true,
        accessLevel: 'confidential',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 3650 // 10 years for genetic data
      },
      biometric_identifier: {
        isPhiField: true,
        phiType: 'biometric_identifier',
        encryptionRequired: true,
        accessLevel: 'confidential',
        auditRequired: true,
        dataMinimization: true,
        retentionPeriodDays: 2555
      }
    };

    return configurations[phiType];
  }
}
