import { AccessLevel } from '../enums/access-levels.enum';
import { ElectronicSignature, FormTemplate } from './form-template.model';
import { StudyPhaseConfig, PhaseTransitionRule } from './study-phase.model';

// Study Status Types
export type StudyStatus = 
  | 'planning' 
  | 'startup' 
  | 'active' 
  | 'recruiting' 
  | 'locked' 
  | 'completed' 
  | 'terminated' 
  | 'suspended';

// Study Phase Types (Clinical Trial Phases)
export type StudyPhase = 
  | 'preclinical' 
  | 'phase_i' 
  | 'phase_ii' 
  | 'phase_iii' 
  | 'phase_iv' 
  | 'post_market';

// Study Section/Visit Types
export type StudySectionType = 
  | 'screening' 
  | 'baseline' 
  | 'treatment' 
  | 'follow_up' 
  | 'unscheduled' 
  | 'adverse_event' 
  | 'early_termination' 
  | 'completion';

// Study Group Types (Treatment Arms)
export type StudyGroupType = 
  | 'control' 
  | 'treatment' 
  | 'placebo' 
  | 'dose_low' 
  | 'dose_medium' 
  | 'dose_high' 
  | 'combination' 
  | 'observational';

// Form Instance Status within Study Context
export type StudyFormInstanceStatus = 
  | 'not_started' 
  | 'in_progress' 
  | 'completed' 
  | 'locked' 
  | 'reviewed' 
  | 'query_open' 
  | 'query_resolved' 
  | 'signed';

// Section Completion Status
export type SectionCompletionStatus = 
  | 'not_started' 
  | 'in_progress' 
  | 'pending_review' 
  | 'completed' 
  | 'locked' 
  | 'overdue';

// Patient Study Status
export type PatientStudyStatus = 
  | 'screening' 
  | 'enrolled' 
  | 'active' 
  | 'completed' 
  | 'withdrawn' 
  | 'discontinued' 
  | 'lost_to_followup';

// Care Indicator Types for Status Tracking
export type CareIndicatorType = 
  | 'overdue_form' 
  | 'missing_signature' 
  | 'data_query' 
  | 'adverse_event' 
  | 'protocol_deviation' 
  | 'visit_overdue' 
  | 'consent_expiring' 
  | 'eligibility_issue';

// Care Indicator Severity
export type CareIndicatorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Substudy Interface (for geographical locations)
export interface Substudy {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  geographicalLocation: {
    country: string;
    region?: string;
    city?: string;
    sites: string[]; // Site IDs
  };
  targetEnrollment: number;
  actualEnrollment: number;
  status: StudyStatus;
  principalInvestigator?: string;
  studyCoordinator?: string;
  regulatoryApprovals: string[];
  irbApprovals: string[];
  customAttributes?: { [key: string]: any };
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
}

// Study Group Interface (Treatment Arms/Control Groups)
export interface StudyGroup {
  id: string;
  studyId: string;
  substudyId?: string;
  name: string;
  description?: string;
  groupType: StudyGroupType;
  targetEnrollment: number;
  actualEnrollment: number;
  randomizationRatio?: number;
  interventionDescription?: string;
  dosage?: {
    amount: number;
    unit: string;
    frequency: string;
    duration?: string;
  };
  blindingLevel: 'none' | 'single' | 'double' | 'triple';
  isActive: boolean;
  eligibilityCriteria?: string[];
  exclusionCriteria?: string[];
  customAttributes?: { [key: string]: any };
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
}

// Study Form Instance (Forms filled within study context)
export interface StudyFormInstance {
  id: string;
  studyId: string;
  substudyId?: string;
  sectionId: string;
  templateId: string;
  templateName: string;
  templateVersion: string;
  patientId?: string;
  visitId?: string;
  groupId?: string;
  status: StudyFormInstanceStatus;
  formData: { [key: string]: any };
  phiData?: { [key: string]: any };
  completionPercentage: number;
  isRequired: boolean;
  dueDate?: Date;
  completedDate?: Date;
  lastModifiedDate: Date;
  filledBy: string;
  reviewedBy?: string;
  reviewedDate?: Date;
  signedBy?: string;
  signedDate?: Date;
  electronicSignature?: ElectronicSignature;
  queries: DataQuery[];
  changeHistory: FormInstanceChange[];
  customAttributes?: { [key: string]: any };
}

// Data Query for Form Instances
export interface DataQuery {
  id: string;
  formInstanceId: string;
  fieldId: string;
  queryType: 'clarification' | 'discrepancy' | 'missing_data' | 'range_check' | 'consistency_check';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  status: 'open' | 'responded' | 'resolved' | 'closed';
  createdBy: string;
  createdAt: Date;
  assignedTo?: string;
  response?: string;
  respondedBy?: string;
  respondedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
}

// Form Instance Change Tracking
export interface FormInstanceChange {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: 'created' | 'modified' | 'completed' | 'reviewed' | 'signed' | 'query_added' | 'query_resolved';
  fieldChanges?: { [fieldId: string]: { oldValue: any; newValue: any } };
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

// Enhanced Section with Form Instance Management
export interface EnhancedStudySection {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  type: StudySectionType;
  order: number;
  scheduledDay?: number;
  windowStart?: number;
  windowEnd?: number;
  isOptional: boolean;
  allowUnscheduled: boolean;
  status: SectionCompletionStatus;
  completionCriteria: {
    allFormsRequired: boolean;
    minimumFormsRequired?: number;
    specificFormsRequired?: string[]; // Form template IDs
    reviewRequired: boolean;
    signatureRequired: boolean;
  };
  formTemplates: StudySectionFormTemplate[];
  formInstances: StudyFormInstance[];
  totalPatients: number;
  patientsCompleted: number;
  patientsInProgress: number;
  patientsOverdue: number;
  estimatedDuration?: number;
  instructions?: string;
  prerequisiteSections?: string[];
  customAttributes?: { [key: string]: any };
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
}

// Form Template within Study Section
export interface StudySectionFormTemplate {
  id: string;
  templateId: string;
  templateName: string;
  templateVersion: string;
  order: number;
  isRequired: boolean;
  completionRequired: boolean;
  signatureRequired: boolean;
  reviewRequired: boolean;
  daysToComplete?: number;
  showConditions?: ConditionalRule[];
  requiredConditions?: ConditionalRule[];
  applicableGroups?: string[]; // Study group IDs
  customAttributes?: { [key: string]: any };
}

// Main Study Interface
export interface Study {
  id?: string;
  protocolNumber: string; // Unique study identifier
  title: string;
  shortTitle?: string;
  description: string;
  version: string;
  
  // Study Classification
  phase: StudyPhase;
  studyType: 'interventional' | 'observational' | 'registry' | 'expanded_access';
  therapeuticArea: string;
  indication: string;
  
  // Study Status and Timeline
  status: StudyStatus;
  plannedStartDate?: Date;
  actualStartDate?: Date;
  plannedEndDate?: Date;
  actualEndDate?: Date;
  
  // Enrollment Information
  plannedEnrollment: number;
  actualEnrollment: number;
  enrollmentStatus: 'not_started' | 'recruiting' | 'completed' | 'terminated';
  
  // Patient Management
  patientIds: string[]; // Direct list of patient Firebase GUIDs for quick access
  
  // Enhanced Study Structure
  sections: EnhancedStudySection[];
  phases: StudyPhaseConfig[]; // Chronological phases with metadata
  phaseTransitionRules: PhaseTransitionRule[]; // Rules for phase progression
  substudies: Substudy[];
  studyGroups: StudyGroup[];
  eligibilityCriteria: EligibilityCriteria;
  sites: StudySite[];
  
  // Regulatory Information
  regulatoryRequirements: string[]; // FDA, EMA, etc.
  irbApprovalRequired: boolean;
  consentRequired: boolean;
  
  // CFR 21 Part 11 Compliance
  requiresElectronicSignatures: boolean;
  auditTrailRequired: boolean;
  dataIntegrityLevel: 'basic' | 'enhanced' | 'strict';
  
  // Data Retention
  dataRetentionPeriod: number; // in months
  archivalRequirements: string[];
  
  // Study Team
  principalInvestigator?: string;
  studyCoordinator?: string;
  dataManager?: string;
  
  // Audit and Compliance
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  changeHistory: StudyChange[];
  
  // Additional Metadata
  customAttributes?: { [key: string]: any };
  tags: string[];
}

// Study Section (Visit/Phase)
export interface StudySection {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  type: StudySectionType;
  order: number; // Chronological order
  
  // Timing Configuration
  scheduledDay?: number; // Day relative to study start/enrollment
  windowStart?: number; // Visit window start (days)
  windowEnd?: number; // Visit window end (days)
  isOptional: boolean;
  allowUnscheduled: boolean;
  
  // Form Requirements
  requiredForms: StudySectionForm[];
  optionalForms: StudySectionForm[];
  
  // Section Status
  status: 'active' | 'locked' | 'disabled';
  requiresSignature: boolean;
  
  // Conditional Logic
  prerequisiteSections?: string[]; // Section IDs that must be completed first
  skipConditions?: ConditionalRule[];
  
  // Metadata
  estimatedDuration?: number; // in minutes
  instructions?: string;
  customAttributes?: { [key: string]: any };
}

// Form within a Study Section
export interface StudySectionForm {
  id: string;
  templateId: string;
  templateName: string;
  order: number;
  isRequired: boolean;
  
  // Form Status Tracking
  completionRequired: boolean;
  signatureRequired: boolean;
  reviewRequired: boolean;
  
  // Conditional Logic
  showConditions?: ConditionalRule[];
  requiredConditions?: ConditionalRule[];
  
  // Timing
  expectedCompletionTime?: number; // in minutes
  deadlineHours?: number; // Hours after section start
}

// Patient Enrollment in Study
export interface PatientStudyEnrollment {
  id?: string;
  studyId: string;
  patientId: string;
  
  // Enrollment Information
  enrollmentDate: Date;
  enrollmentNumber: string; // Sequential study-specific ID
  randomizationId?: string;
  treatmentArm?: string;
  patientNumber?: string; // Patient identifier number
  enrollmentStatus?: PatientStudyStatus; // Enrollment status
  siteId?: string; // Site identifier
  
  // Current Status
  status: PatientStudyStatus;
  currentSection?: string; // Current section ID
  currentPhase?: string; // Current phase ID
  nextScheduledVisit?: Date;
  
  // Progress Tracking
  completedSections: string[];
  sectionsInProgress: string[];
  overdueSections: string[];
  phaseProgress?: { [phaseId: string]: { status: string; progress: number } }; // Phase progress tracking
  
  // Care Indicators
  careIndicators: CareIndicator[];
  
  // Dates and Timeline
  studyStartDate?: Date;
  lastVisitDate?: Date;
  nextVisitDate?: Date;
  studyCompletionDate?: Date;
  withdrawalDate?: Date;
  withdrawalReason?: string;
  
  // Audit Trail
  enrolledBy: string;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  changeHistory: PatientEnrollmentChange[];
}

// Care Indicator for Status Tracking
export interface CareIndicator {
  id: string;
  type: CareIndicatorType;
  severity: CareIndicatorSeverity;
  title: string;
  description: string;
  
  // Related Entities
  studyId?: string;
  patientId?: string;
  sectionId?: string;
  formId?: string;
  
  // Status and Resolution
  status: 'open' | 'acknowledged' | 'resolved' | 'overridden';
  createdAt: Date;
  dueDate?: Date;
  overdueDays?: number;
  
  // Resolution Information
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  
  // Audit Trail
  createdBy: string;
  assignedTo?: string;
  escalationLevel: number;
}

// Study Site Information
export interface StudySite {
  id: string;
  studyId: string;
  siteNumber: string;
  siteName: string;
  
  // Contact Information
  principalInvestigator: string;
  coordinatorName?: string;
  contactEmail: string;
  contactPhone?: string;
  
  // Address
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  
  // Site Status
  status: 'pending' | 'activated' | 'recruiting' | 'completed' | 'terminated';
  activationDate?: Date;
  targetEnrollment: number;
  actualEnrollment: number;
  
  // Regulatory
  irbApprovalDate?: Date;
  irbApprovalExpiry?: Date;
  regulatoryApprovals: string[];
}

// Eligibility Criteria
export interface EligibilityCriteria {
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  ageRange?: {
    minimum?: number;
    maximum?: number;
    unit: 'years' | 'months' | 'days';
  };
  genderRestriction?: 'male' | 'female' | 'any';
  customCriteria?: CriteriaRule[];
}

// Criteria Rule for Complex Eligibility
export interface CriteriaRule {
  id: string;
  description: string;
  fieldId?: string; // Form field to check
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in_range';
  value: any;
  required: boolean;
}

// Conditional Rule (reused from form template)
export interface ConditionalRule {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_empty';
  value: any;
}

// Study Change Tracking
export interface StudyChange {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: 'created' | 'modified' | 'activated' | 'locked' | 'completed' | 'terminated';
  changes: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  electronicSignature?: ElectronicSignature;
}

// Patient Enrollment Change Tracking
export interface PatientEnrollmentChange {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: 'enrolled' | 'status_changed' | 'section_completed' | 'withdrawn';
  changes: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

// Study Summary for List Views
export interface StudySummary {
  id: string;
  protocolNumber: string;
  title: string;
  shortTitle?: string;
  phase: StudyPhase;
  status: StudyStatus;
  
  // Enrollment Statistics
  plannedEnrollment: number;
  actualEnrollment: number;
  enrollmentPercentage: number;
  
  // Timeline
  plannedStartDate?: Date;
  actualStartDate?: Date;
  plannedEndDate?: Date;
  daysRemaining?: number;
  
  // Care Indicators Summary
  totalCareIndicators: number;
  criticalIndicators: number;
  highPriorityIndicators: number;
  overdueItems: number;
  
  // Recent Activity
  lastActivity?: Date;
  lastActivityDescription?: string;
  
  // Quick Stats
  totalSections: number;
  completedSections: number;
  totalForms: number;
  completedForms: number;
}

// Study Section Summary with Care Indicators
export interface StudySectionSummary {
  id: string;
  name: string;
  type: StudySectionType;
  order: number;
  
  // Form Statistics
  totalForms: number;
  completedForms: number;
  overdueForms: number;
  formsRequiringSignature: number;
  
  // Patient Progress
  patientsCompleted: number;
  patientsInProgress: number;
  patientsOverdue: number;
  
  // Care Indicators
  careIndicators: CareIndicator[];
  needsAttention: boolean;
  attentionLevel: CareIndicatorSeverity;
}

// Study Permissions
export interface StudyPermissions {
  canView: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canEnrollPatients: boolean;
  canLockStudy: boolean;
  canViewPHI: boolean;
  canManageSites: boolean;
  canGenerateReports: boolean;
  requiredAccessLevel: AccessLevel;
}

// Study Configuration Options
export interface StudyConfiguration {
  maxEnrollment: number;
  allowedSites: string[];
  dataValidationRules: ValidationRule[];
  autoLockRules: AutoLockRule[];
  notificationSettings: NotificationSettings;
  complianceSettings: ComplianceSettings;
}

// Auto Lock Rules for CFR Compliance
export interface AutoLockRule {
  id: string;
  description: string;
  condition: 'time_based' | 'completion_based' | 'manual';
  triggerValue?: any;
  lockLevel: 'form' | 'section' | 'patient' | 'study';
}

// Notification Settings
export interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  overdueFormAlerts: boolean;
  careIndicatorAlerts: boolean;
  enrollmentMilestones: boolean;
  reminderDaysBefore: number;
}

// CFR 21 Part 11 Compliance Settings
export interface ComplianceSettings {
  requireElectronicSignatures: boolean;
  auditTrailLevel: 'basic' | 'detailed' | 'comprehensive';
  dataIntegrityChecks: boolean;
  accessControlLevel: 'basic' | 'role_based' | 'attribute_based';
  encryptionRequired: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  archivalPolicy: string;
}

// Validation Rule (reused from form template)
export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
  customValidator?: string;
}
