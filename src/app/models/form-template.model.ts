import { AccessLevel } from '../enums/access-levels.enum';
import { VisibilityCondition } from './survey.model';

// Template Types
export type TemplateType = 'form' | 'patient' | 'study_subject';

// PHI Field Types (FHIR-compliant)
export type PhiFieldType = 
  | 'patient_name'
  | 'patient_id' 
  | 'date_of_birth'
  | 'ssn'
  | 'address'
  | 'phone_number'
  | 'email_address'
  | 'medical_record_number'
  | 'insurance_id'
  | 'emergency_contact'
  | 'genetic_data'
  | 'biometric_identifier';

// Form Field Types
export type FormFieldType = 
  | 'text' 
  | 'textarea'
  | 'number' 
  | 'email'
  | 'phone'
  | 'date' 
  | 'time'
  | 'datetime'
  | 'select' 
  | 'multiselect'
  | 'checkbox' 
  | 'radio'
  | 'boolean'
  | 'file'
  | 'image'
  | 'nested_form'
  | 'signature'
  | 'calculated'
  | 'height'
  | 'weight'
  | 'blood_pressure'
  | 'temperature'
  | 'medication'
  | 'diagnosis'
  | PhiFieldType;

// Export alias for compatibility
export type FieldType = FormFieldType;

// Validation Rules
export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
  customValidator?: string; // Function name for custom validation
}

// PHI Classification
export interface PhiClassification {
  isPhiField: boolean;
  phiType?: PhiFieldType;
  encryptionRequired: boolean;
  accessLevel: 'public' | 'internal' | 'restricted' | 'confidential';
  auditRequired: boolean;
  dataMinimization: boolean;
  retentionPeriodDays?: number;
}

// Form Field Configuration
export interface FormField {
  id: string;
  name: string;
  type: FormFieldType;
  label: string;
  description?: string;
  helpText?: string;
  required: boolean;
  readonly: boolean;
  hidden: boolean;
  
  // Alternative property names for compatibility
  isRequired?: boolean;
  isReadonly?: boolean;
  isHidden?: boolean;
  
  // Validation
  validationRules: ValidationRule[];
  
  // Field-specific options
  options?: FormFieldOption[]; // For select, radio, checkbox
  placeholder?: string;
  defaultValue?: any;
  
  // PHI and Compliance
  isPhiField: boolean;
  phiClassification?: PhiClassification;
  auditRequired: boolean;
  linkedFormIds?: string[]; // Forms this field can link to
  patientDataMapping?: string; // FHIR Patient resource field mapping
  
  // Nested Form Support
  nestedFormId?: string; // Reference to another form template
  allowMultiple?: boolean; // For nested forms that can have multiple instances
  
  // File Upload Configuration
  allowedFileTypes?: string[]; // ['jpg', 'png', 'pdf']
  maxFileSize?: number; // in bytes
  maxFiles?: number;
  
  // Layout and Display
  width?: 'full' | 'half' | 'third' | 'quarter';
  columnPosition?: 'left' | 'right' | 'center'; // Column positioning for multi-column layout
  order: number;
  section?: string; // Group fields into sections
  
  // Calculated Fields
  calculationFormula?: string; // For calculated fields
  dependsOn?: string[]; // Field IDs this field depends on
  
  // Conditional Logic
  showWhen?: ConditionalRule[];
  requiredWhen?: ConditionalRule[];
  conditionalLogic?: ConditionalLogicRule[];
  visibilityConditions?: VisibilityCondition[];
  
  // Layout and grouping
  groupId?: string;
  
  // Custom attributes
  customAttributes?: { [key: string]: any };
  
  // Clinical field properties
  unit?: string; // Unit label for clinical fields (e.g., 'cm', 'kg', '°C')
  min?: number; // Minimum value for numeric/clinical fields
  max?: number; // Maximum value for numeric/clinical fields
  
  // Audit and Compliance
  criticalDataPoint?: boolean; // Requires additional verification
  auditTrail?: {
    trackChanges: boolean;
    reasonRequired: boolean;
  };
}

export interface FormFieldOption {
  value: any;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ConditionalRule {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_empty';
  value: any;
}

export interface ConditionalLogicRule {
  condition: string;
  action: 'show' | 'hide' | 'require' | 'disable';
  targetField: string;
  value: any;
}

// Form Section for organizing fields
export interface FormSection {
  id: string;
  name: string;
  description?: string;
  order: number;
  collapsible: boolean;
  defaultExpanded: boolean;
  fields: string[]; // Field IDs in this section
}

// Form Field Group for nested organization
export interface FormFieldGroup {
  id: string;
  name: string;
  label: string;
  description?: string;
  isCollapsible: boolean;
  isCollapsed: boolean;
  isRepeatable: boolean;
  maxRepetitions?: number;
  order: number;
  conditionalLogic?: ConditionalLogicRule[];
}

// Template Link Configuration
export interface TemplateLink {
  id: string;
  templateId: string;
  templateName: string;
  linkType: 'parent' | 'child' | 'related';
  required: boolean;
  allowMultiple: boolean;
  description?: string;
}

// Form Template
export interface FormTemplate {
  id?: string;
  studyId?: string; // Optional - templates can be global or study-specific
  patientVisitSubcomponentId?: string; // Links template to a specific patient visit subcomponent
  name: string;
  description: string;
  version: number;
  
  // Template Type Configuration
  templateType: TemplateType;
  isPatientTemplate: boolean; // Quick check for patient templates
  isStudySubjectTemplate: boolean; // Quick check for study subject templates
  
  // Template Configuration
  fields: FormField[];
  sections: FormSection[];
  fieldGroups?: FormFieldGroup[];
  conditionalLogic?: ConditionalLogicRule[];
  
  // Template Linking
  parentTemplateId?: string;
  childTemplateIds: string[];
  linkedTemplates: TemplateLink[];
  
  // PHI and Healthcare Compliance
  phiDataFields: string[]; // Field IDs containing PHI
  healthcareApiConfig?: {
    projectId: string;
    datasetId: string;
    fhirStoreId: string;
    encryptionKeyId?: string;
  };
  fhirResourceType?: 'Patient' | 'Observation' | 'Encounter' | 'Condition' | 'MedicationStatement';
  hipaaCompliant: boolean;
  gdprCompliant: boolean;
  
  // Status and Lifecycle
  status: 'draft' | 'review' | 'published' | 'deprecated' | 'archived';
  publishedAt?: Date;
  deprecatedAt?: Date;
  
  // Permissions and Access
  createdBy: string;
  lastModifiedBy: string;
  updatedBy?: string;
  approvedBy?: string;
  approvalDate?: Date;
  
  // Compliance Settings
  requiresElectronicSignature: boolean;
  requiresSignature?: boolean; // Alternative property name
  isPhiForm?: boolean;
  dataRetentionPeriod?: number; // in years
  complianceRegions: string[]; // ['INDIA', 'EU', 'US']
  phiEncryptionEnabled: boolean;
  phiAccessLogging: boolean;
  phiDataMinimization: boolean;
  phiRetentionPolicy?: {
    retentionPeriodDays: number;
    autoDeleteEnabled: boolean;
    archiveBeforeDelete: boolean;
  };
  allowSavePartial: boolean; // Allow saving incomplete forms
  allowPartialSave?: boolean; // Alternative property name
  requiresReview: boolean; // Requires review before submission
  allowEditing: boolean; // Allow editing after submission
  maxSubmissions?: number;
  expirationDate?: Date;
  instructions?: string;
  
  // Nested Forms
  parentFormId?: string; // If this is a nested form
  childFormIds: string[]; // Child forms that can be embedded
  
  // Metadata
  tags: string[];
  category: string; // 'patient', 'visit', 'adverse_event', 'lab_result', etc.
  estimatedCompletionTime?: number; // in minutes
  metadata?: {
    studyPhase?: string;
    therapeuticArea?: string;
    regulatoryRequirements?: string[];
    dataRetentionPeriod?: number;
    backupFrequency?: string;
  };
  
  // Custom styling
  customCss?: string;
  
  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
  
  // Audit Trail
  changeHistory: FormTemplateChange[];
  
  // Additional fields for operations
  reason?: string; // For deletion or modification reasons
}

export interface FormTemplateChange {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: 'created' | 'modified' | 'published' | 'deprecated' | 'archived';
  changes: any; // Detailed change log
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  electronicSignature?: ElectronicSignature;
}

export interface ElectronicSignature {
  signerId: string;
  signerEmail: string;
  signerName: string;
  timestamp: Date;
  meaning: string; // What the signature represents
  method: 'password' | 'biometric' | 'token' | 'certificate';
  ipAddress: string;
  userAgent: string;
  documentHash: string; // Hash of the signed document
}

// Form Instance (filled form)
export interface FormInstance {
  id?: string;
  templateId: string;
  templateVersion: number;
  studyId?: string;
  patientId?: string;
  visitId?: string;
  patientVisitSubcomponentId?: string; // Links instance to patient visit subcomponent
  
  // Form Data
  data: Record<string, any>; // Field ID -> Value mapping
  phiData?: Record<string, any>; // PHI data stored separately
  attachments: FormAttachment[];
  
  // Status
  status: 'draft' | 'in_progress' | 'completed' | 'reviewed' | 'locked';
  completionPercentage: number;
  
  // Workflow
  submittedBy?: string;
  submittedAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  lockedBy?: string;
  lockedAt?: Date;
  
  // Signatures
  signatures: ElectronicSignature[];
  
  // Nested Form Instances
  nestedForms: Record<string, FormInstance[]>; // Field ID -> Nested form instances
  
  // Audit and Compliance
  lastModifiedBy: string;
  lastModifiedAt: Date;
  changeHistory: FormInstanceChange[];
  
  // Metadata
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FormInstanceChange {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: 'created' | 'modified' | 'submitted' | 'reviewed' | 'locked';
  fieldChanges: FieldChange[];
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FieldChange {
  fieldId: string;
  fieldName: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'modified' | 'removed';
}

export interface FormAttachment {
  id: string;
  fieldId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: Date;
  storageUrl: string;
  isPhiRelated: boolean;
  checksum: string; // For integrity verification
}

// Form Validation Result
export interface FormValidationResult {
  isValid: boolean;
  errors: FormValidationError[];
  warnings: FormValidationWarning[];
}

export interface FormValidationError {
  fieldId: string;
  fieldName: string;
  message: string;
  errorType: 'required' | 'format' | 'range' | 'custom';
}

export interface FormValidationWarning {
  fieldId: string;
  fieldName: string;
  message: string;
  warningType: 'data_quality' | 'missing_optional' | 'unusual_value';
}

// Form Builder Configuration
export interface FormBuilderConfig {
  availableFieldTypes: FormFieldType[];
  maxFieldsPerForm: number;
  maxNestingLevel: number;
  allowedFileTypes: string[];
  maxFileSize: number;
  enableConditionalLogic: boolean;
  enableCalculatedFields: boolean;
  enableElectronicSignatures: boolean;
  complianceMode: 'basic' | 'cfr21' | 'dpdp' | 'full';
}

// Permission Checks
export interface FormPermissions {
  canView: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canSign: boolean;
  canReview: boolean;
  requiredAccessLevel: AccessLevel;
}
