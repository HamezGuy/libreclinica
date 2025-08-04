import { Timestamp } from '@angular/fire/firestore';

export interface FormInstance {
  id?: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  patientId: string;
  studyId: string;
  phaseId: string;
  phaseCode: string;
  visitSubcomponentId: string;
  
  // Form data
  formData: any; // JSON data containing form responses
  
  // Status tracking
  status: 'not_started' | 'in_progress' | 'completed' | 'locked' | 'missed';
  completionPercentage: number;
  isRequired: boolean;
  
  // Validation
  isValid: boolean;
  validationErrors?: ValidationError[];
  
  // Timestamps
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  lastModifiedAt?: Timestamp;
  lockedAt?: Timestamp;
  
  // User tracking
  createdBy: string;
  lastModifiedBy?: string;
  completedBy?: string;
  lockedBy?: string;
  
  // Additional metadata
  notes?: string;
  attachments?: FormAttachment[];
  auditTrail?: AuditEntry[];
}

export interface ValidationError {
  fieldPath: string;
  errorType: string;
  message: string;
}

export interface FormAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: Timestamp;
  uploadedBy: string;
  url?: string;
}

export interface AuditEntry {
  id: string;
  action: 'created' | 'updated' | 'completed' | 'locked' | 'unlocked' | 'deleted';
  timestamp: Timestamp;
  userId: string;
  userName: string;
  changes?: any;
  reason?: string;
}

export interface FormInstanceCreateRequest {
  templateId: string;
  templateName: string;
  templateVersion: number;
  patientId: string;
  studyId: string;
  phaseId: string;
  phaseCode: string;
  visitSubcomponentId: string;
  isRequired: boolean;
}
