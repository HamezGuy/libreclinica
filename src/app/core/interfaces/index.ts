/**
 * Core Interfaces for EDC System
 * All services must implement these interfaces for dependency injection
 */

import { Observable } from 'rxjs';
import { UserProfile } from '../../models/user-profile.model';
import { AccessLevel, ComplianceRegion } from '../../enums/access-levels.enum';

// Event System Interfaces
export interface IEvent {
  id: string;
  type: string;
  timestamp: Date;
  userId: string;
  metadata?: any;
}

export interface IEventHandler<T extends IEvent> {
  handle(event: T): Observable<void>;
  canHandle(event: IEvent): boolean;
}

export interface IEventBus {
  publish<T extends IEvent>(event: T): void;
  subscribe<T extends IEvent>(eventType: string, handler: IEventHandler<T>): void;
  unsubscribe(eventType: string, handler: IEventHandler<any>): void;
  getEventStream<T extends IEvent>(eventType?: string): Observable<T>;
  onEvent<T extends IEvent>(eventType: string): Observable<T>;
}

// Audit Service Interface
export interface IAuditService {
  logEvent(event: AuditEvent): Observable<void>;
  queryLogs(filters: AuditFilters): Observable<AuditLog[]>;
  exportLogs(startDate: Date, endDate: Date): Observable<string>;
}

export interface AuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
  compliance?: string[];
}

export interface AuditLog extends AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: string;
  resourceType?: string;
}

// Healthcare API Interface
export interface IHealthcareApiService {
  createPatient(patient: FhirPatient): Observable<FhirPatient>;
  getPatient(patientId: string): Observable<FhirPatient>;
  updatePatient(patientId: string, patient: Partial<FhirPatient>): Observable<FhirPatient>;
  deletePatient(patientId: string): Observable<void>;
  searchPatients(query: PatientSearchQuery): Observable<FhirPatient[]>;
  createObservation(observation: FhirObservation): Observable<FhirObservation>;
  getObservations(patientId: string): Observable<FhirObservation[]>;
}

export interface FhirPatient {
  id?: string;
  resourceType: 'Patient';
  identifier?: Array<{
    system: string;
    value: string;
  }>;
  name?: Array<{
    use?: string;
    family?: string;
    given?: string[];
  }>;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: Array<{
    use?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

export interface FhirObservation {
  id?: string;
  resourceType: 'Observation';
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  code: {
    coding: Array<{
      system: string;
      code: string;
      display?: string;
    }>;
  };
  subject: {
    reference: string;
  };
  effectiveDateTime?: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system?: string;
    code?: string;
  };
}

export interface PatientSearchQuery {
  name?: string;
  identifier?: string;
  birthdate?: string;
  gender?: string;
}

// Data Repository Interfaces
export interface IRepository<T> {
  create(entity: T): Observable<T>;
  findById(id: string): Observable<T | null>;
  findAll(filters?: any): Observable<T[]>;
  update(id: string, entity: Partial<T>): Observable<T>;
  delete(id: string): Observable<void>;
}

export interface IStudyRepository extends IRepository<Study> {
  findByInvestigator(investigatorId: string): Observable<Study[]>;
  findActive(): Observable<Study[]>;
}

export interface IFormRepository extends IRepository<FormTemplate> {
  findByStudy(studyId: string): Observable<FormTemplate[]>;
  findPublished(): Observable<FormTemplate[]>;
}

// Data Models
export interface Study {
  id?: string;
  name: string;
  protocol: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'active' | 'completed' | 'suspended';
  investigatorId: string;
  siteIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FormTemplate {
  id?: string;
  studyId: string;
  name: string;
  version: string;
  fields: FormField[];
  status: 'draft' | 'published' | 'deprecated';
  phiFields: string[]; // Field IDs that contain PHI
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FormField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'radio';
  label: string;
  required: boolean;
  validation?: any;
  options?: string[];
  isPhi: boolean;
}

// Authentication Interface
export interface IAuthService {
  login(): Observable<UserProfile>;
  logout(): Observable<void>;
  getCurrentUser(): Observable<UserProfile | null>;
  hasRole(role: AccessLevel): Observable<boolean>;
  isAuthenticated(): Observable<boolean>;
}

// Notification Interface
export interface INotificationService {
  success(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  info(message: string): void;
}

// Storage Strategy Interface
export interface IStorageStrategy {
  store(key: string, data: any): Observable<void>;
  retrieve(key: string): Observable<any>;
  remove(key: string): Observable<void>;
  exists(key: string): Observable<boolean>;
}

// Factory Interfaces
export interface IServiceFactory {
  createAuditService(): IAuditService;
  createHealthcareService(): IHealthcareApiService;
  createAuthService(): IAuthService;
}

// Event Types
export interface DocumentSavedEvent extends IEvent {
  type: 'DOCUMENT_SAVED';
  documentId: string;
  documentType: string;
  data: any;
}

export interface PatientCreatedEvent extends IEvent {
  type: 'PATIENT_CREATED';
  patientId: string;
  patientData: FhirPatient;
}

export interface FormSubmittedEvent extends IEvent {
  type: 'FORM_SUBMITTED';
  formId: string;
  studyId: string;
  patientId: string;
  data: any;
}

export interface AuditRequiredEvent extends IEvent {
  type: 'AUDIT_REQUIRED';
  auditData: AuditEvent;
}

export interface UserLoginEvent extends IEvent {
  type: 'USER_LOGIN';
  userEmail: string;
  authMethod: 'google' | 'sso' | 'mfa' | 'password';
  ipAddress?: string;
  userAgent?: string;
  sessionId: string;
}

export interface UserLogoutEvent extends IEvent {
  type: 'USER_LOGOUT';
  userEmail: string;
  sessionId: string;
  reason: 'manual' | 'timeout' | 'forced';
  clientInfo: {
    ipAddress: string;
    userAgent: string;
  };
  compliance: {
    region: ComplianceRegion;
    is21CFRPart11Compliant: boolean;
    isHIPAACompliant: boolean;
  };
}

export interface AuthenticationFailedEvent extends IEvent {
  type: 'AUTHENTICATION_FAILED';
  userEmail: string;
  authMethod: 'google' | 'sso' | 'mfa' | 'password' | 'registration';
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserCreatedEvent extends IEvent {
  type: 'USER_CREATED';
  userEmail: string;
  userProfile: any; // UserProfile type
  createdBy: string;
  registrationMethod: 'google' | 'manual' | 'import' | 'password';
}

export interface UserRoleChangedEvent extends IEvent {
  type: 'USER_ROLE_CHANGED';
  targetUserId: string;
  targetUserEmail: string;
  oldRole: string;
  newRole: string;
  changedBy: string;
  reason?: string;
}

export interface UserStatusChangedEvent extends IEvent {
  type: 'USER_STATUS_CHANGED';
  targetUserId: string;
  targetUserEmail: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  reason?: string;
}

export interface DataAccessEvent extends IEvent {
  type: 'DATA_ACCESS';
  resourceType: string;
  resourceId: string;
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT';
  dataType: 'PHI' | 'NON_PHI' | 'MIXED';
  details: string;
}

export interface DataModificationEvent extends IEvent {
  type: 'DATA_MODIFICATION';
  resourceType: string;
  resourceId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValue?: any;
  newValue?: any;
  changeReason?: string;
}

// Form Management Events
export interface FormTemplateCreatedEvent extends IEvent {
  type: 'FORM_TEMPLATE_CREATED';
  templateId: string;
  templateName: string;
  studyId?: string;
  createdBy: string;
  templateData: any;
}

export interface FormTemplateModifiedEvent extends IEvent {
  type: 'FORM_TEMPLATE_MODIFIED';
  templateId: string;
  templateName: string;
  studyId?: string;
  modifiedBy: string;
  changes: any;
  oldVersion: number;
  newVersion: number;
}

export interface FormTemplatePublishedEvent extends IEvent {
  type: 'FORM_TEMPLATE_PUBLISHED';
  templateId: string;
  templateName: string;
  studyId?: string;
  publishedBy: string;
  version: number;
  approvalRequired: boolean;
}

export interface FormTemplateDeletedEvent extends IEvent {
  type: 'FORM_TEMPLATE_DELETED';
  templateId: string;
  templateName: string;
  studyId?: string;
  deletedBy: string;
  reason: string;
  version: number;
}

export interface FormInstanceCreatedEvent extends IEvent {
  type: 'FORM_INSTANCE_CREATED';
  instanceId: string;
  templateId: string;
  patientId?: string;
  studyId?: string;
  createdBy: string;
}

export interface FormInstanceSubmittedEvent extends IEvent {
  type: 'FORM_INSTANCE_SUBMITTED';
  instanceId: string;
  templateId: string;
  patientId?: string;
  studyId?: string;
  submittedBy: string;
  formData: any;
  containsPhi: boolean;
}

export interface FormInstanceSignedEvent extends IEvent {
  type: 'FORM_INSTANCE_SIGNED';
  instanceId: string;
  templateId: string;
  signedBy: string;
  signatureMethod: string;
  signatureMeaning: string;
  documentHash: string;
}

export interface FormValidationFailedEvent extends IEvent {
  type: 'FORM_VALIDATION_FAILED';
  instanceId: string;
  templateId: string;
  validationErrors: any[];
  attemptedBy: string;
}

// Configuration Interface
export interface IConfigService {
  get<T>(key: string): T;
  set(key: string, value: any): void;
  getEnvironment(): 'development' | 'staging' | 'production';
}
