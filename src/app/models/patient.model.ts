import { AccessLevel } from '../enums/access-levels.enum';

// Patient Status
export type PatientStatus = 
  | 'screening'
  | 'enrolled'
  | 'active'
  | 'completed'
  | 'withdrawn'
  | 'discontinued'
  | 'lost_to_followup';

// Patient Demographics (FHIR-compliant)
export interface PatientDemographics {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other' | 'unknown';
  race?: string;
  ethnicity?: string;
  preferredLanguage?: string;
  
  // Contact Information (PHI)
  email?: string;
  phone?: string;
  alternatePhone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  
  // Emergency Contact
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
    email?: string;
  };
}

// Patient Identifiers
export interface PatientIdentifier {
  type: 'mrn' | 'ssn' | 'study_id' | 'screening_id' | 'randomization_id' | 'custom';
  value: string;
  system?: string; // Identifier system (e.g., hospital system)
  issuedBy?: string;
  issuedDate?: Date;
}

// Patient Consent
export interface PatientConsent {
  id: string;
  type: 'informed_consent' | 'data_sharing' | 'genetic_testing' | 'future_research';
  version: string;
  consentDate: Date;
  expirationDate?: Date;
  signedBy: string;
  witnessedBy?: string;
  documentUrl?: string;
  restrictions?: string[];
  withdrawnDate?: Date;
  withdrawnReason?: string;
}

// Patient Visit Subcomponent
export interface PatientVisitSubcomponent {
  id: string;
  patientId: string;
  studyId: string;
  name: string; // e.g., "Initial Checkin", "Study Phase 1", "Checkin 2"
  description?: string;
  type: 'screening' | 'baseline' | 'treatment' | 'follow_up' | 'unscheduled' | 'adverse_event';
  order: number;
  
  // Phase linkage
  phaseId?: string; // Link to StudyPhaseConfig
  phaseCode?: string; // Quick reference to phase code
  isPhaseFolder: boolean; // True if this is a phase-based folder
  
  // Visit Window
  scheduledDate?: Date;
  windowStartDate?: Date;
  windowEndDate?: Date;
  actualDate?: Date;
  
  // Status
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  completionPercentage: number;
  
  // Templates under this subcomponent
  templateIds: string[]; // Form template IDs assigned to this visit
  requiredTemplateIds: string[]; // Required templates that must be completed
  optionalTemplateIds: string[]; // Optional templates
  completedTemplates: string[];
  inProgressTemplates: string[];
  
  // Full template objects (copied from study for patient-specific data)
  formTemplates?: any[]; // Full template objects with metadata
  
  // Phase progression
  canProgressToNextPhase: boolean;
  blockingTemplates: string[]; // Templates blocking progression
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
}

// Patient Model
export interface Patient {
  id: string;
  studyId: string; // REQUIRED - Patient must belong to a study
  siteId?: string; // Study site where patient is enrolled
  
  // Identifiers
  patientNumber: string; // Study-specific patient number
  identifiers: PatientIdentifier[];
  
  // Demographics (PHI)
  demographics: PatientDemographics;
  
  // Study Enrollment
  enrollmentDate: Date;
  enrollmentStatus: PatientStatus;
  treatmentArm?: string;
  randomizationId?: string;
  
  // Consent Management
  consents: PatientConsent[];
  hasValidConsent: boolean;
  consentExpirationDate?: Date;
  
  // Visit Subcomponents (folders)
  visitSubcomponents: PatientVisitSubcomponent[];
  currentVisitId?: string;
  nextScheduledVisitId?: string;
  
  // Study Phases and Forms (copied from study for patient-specific data)
  phases?: any[]; // Patient-specific phases copied from study
  forms?: any[]; // Patient-specific form instances copied from study templates
  
  // Medical History (summary)
  medicalHistory?: {
    conditions: string[];
    medications: string[];
    allergies: string[];
    lastUpdated: Date;
  };
  
  // Study Progress
  studyProgress: {
    totalVisits: number;
    completedVisits: number;
    missedVisits: number;
    upcomingVisits: number;
    overallCompletionPercentage: number;
  };
  
  // Compliance and Alerts
  complianceScore?: number;
  activeAlerts: PatientAlert[];
  protocolDeviations: ProtocolDeviation[];
  
  // Audit Trail
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  changeHistory: PatientChangeHistory[];
  
  // Access Control
  accessRestrictions?: {
    restrictedFields: string[];
    authorizedUsers: string[];
    authorizedRoles: AccessLevel[];
  };
}

// Patient Alert
export interface PatientAlert {
  id: string;
  type: 'overdue_visit' | 'missing_data' | 'adverse_event' | 'protocol_deviation' | 'consent_expiring';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  createdDate: Date;
  resolvedDate?: Date;
  resolvedBy?: string;
}

// Protocol Deviation
export interface ProtocolDeviation {
  id: string;
  patientId: string;
  visitId?: string;
  deviationType: string;
  description: string;
  reportedDate: Date;
  reportedBy: string;
  impact: 'minor' | 'major';
  resolutionPlan?: string;
  resolvedDate?: Date;
  approvedBy?: string;
}

// Patient Change History
export interface PatientChangeHistory {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: 'created' | 'enrolled' | 'updated' | 'status_changed' | 'visit_completed' | 'withdrawn';
  changes: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

// Patient Search Criteria
export interface PatientSearchCriteria {
  studyId?: string;
  siteId?: string;
  patientNumber?: string;
  status?: PatientStatus;
  enrollmentDateFrom?: Date;
  enrollmentDateTo?: Date;
  hasOverdueVisits?: boolean;
  treatmentArm?: string;
  searchText?: string; // Search in patient number, identifiers
}

// Patient Summary for List Views
export interface PatientSummary {
  id: string;
  studyId: string;
  patientNumber: string;
  initials?: string; // First and last initials only
  status: PatientStatus;
  enrollmentDate: Date;
  currentVisit?: string;
  nextVisitDate?: Date;
  completionPercentage: number;
  hasAlerts: boolean;
  alertCount: number;
  lastActivity?: Date;
}

// Patient Permissions
export interface PatientPermissions {
  canView: boolean;
  canEdit: boolean;
  canEnroll: boolean;
  canWithdraw: boolean;
  canViewPHI: boolean;
  canManageConsent: boolean;
  canScheduleVisits: boolean;
  requiredAccessLevel: AccessLevel;
}
