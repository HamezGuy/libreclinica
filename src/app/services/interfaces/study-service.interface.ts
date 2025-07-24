import { Observable } from 'rxjs';
import { 
  Study, 
  StudySummary, 
  StudySection, 
  StudySectionSummary,
  PatientStudyEnrollment, 
  CareIndicator, 
  StudyConfiguration,
  StudyPermissions,
  StudyChange,
  PatientEnrollmentChange
} from '../../models/study.model';

/**
 * Interface for Study Management Service
 * Implements CFR 21 Part 11 compliant study management operations
 */
export interface IStudyService {
  // Study CRUD Operations
  createStudy(study: Omit<Study, 'id' | 'createdAt' | 'lastModifiedAt' | 'changeHistory'>): Promise<Study>;
  getStudy(studyId: string): Promise<Study | null>;
  updateStudy(studyId: string, updates: Partial<Study>, reason?: string): Promise<Study>;
  deleteStudy(studyId: string, reason: string): Promise<void>;
  
  // Study List Operations
  getStudies(): Observable<Study[]>;
  getStudySummaries(): Observable<StudySummary[]>;
  getStudiesByStatus(status: string): Observable<Study[]>;
  getStudiesByPhase(phase: string): Observable<Study[]>;
  
  // Study Section Management
  createStudySection(studyId: string, section: Omit<StudySection, 'id' | 'studyId'>): Promise<StudySection>;
  getStudySections(studyId: string): Promise<StudySection[]>;
  updateStudySection(sectionId: string, updates: Partial<StudySection>, reason?: string): Promise<StudySection>;
  deleteStudySection(sectionId: string, reason: string): Promise<void>;
  reorderStudySections(studyId: string, sectionIds: string[]): Promise<void>;
  
  // Study Section Summary with Care Indicators
  getStudySectionSummaries(studyId: string): Promise<StudySectionSummary[]>;
  
  // Patient Enrollment
  enrollPatient(enrollment: Omit<PatientStudyEnrollment, 'id' | 'changeHistory'>): Promise<PatientStudyEnrollment>;
  getPatientEnrollment(studyId: string, patientId: string): Promise<PatientStudyEnrollment | null>;
  updatePatientEnrollment(enrollmentId: string, updates: Partial<PatientStudyEnrollment>, reason?: string): Promise<PatientStudyEnrollment>;
  withdrawPatient(enrollmentId: string, reason: string): Promise<void>;
  
  // Patient Progress Tracking
  getPatientsByStudy(studyId: string): Promise<PatientStudyEnrollment[]>;
  updatePatientProgress(enrollmentId: string, sectionId: string, status: 'in_progress' | 'completed'): Promise<void>;
  getPatientProgress(enrollmentId: string): Promise<{ completed: string[], inProgress: string[], overdue: string[] }>;
  
  // Care Indicators Management
  getCareIndicators(filters?: { studyId?: string, patientId?: string, severity?: string }): Observable<CareIndicator[]>;
  createCareIndicator(indicator: Omit<CareIndicator, 'id' | 'createdAt'>): Promise<CareIndicator>;
  updateCareIndicator(indicatorId: string, updates: Partial<CareIndicator>): Promise<CareIndicator>;
  resolveCareIndicator(indicatorId: string, resolutionNotes: string): Promise<void>;
  
  // Study Statistics and Analytics
  getStudyStatistics(studyId: string): Promise<StudyStatistics>;
  getEnrollmentStatistics(studyId: string): Promise<EnrollmentStatistics>;
  getCompletionStatistics(studyId: string): Promise<CompletionStatistics>;
  
  // Study Configuration
  getStudyConfiguration(studyId: string): Promise<StudyConfiguration>;
  updateStudyConfiguration(studyId: string, config: StudyConfiguration): Promise<void>;
  
  // Permissions and Access Control
  getStudyPermissions(studyId: string, userId: string): Promise<StudyPermissions>;
  checkPermission(studyId: string, userId: string, action: string): Promise<boolean>;
  
  // Audit Trail and Compliance
  getStudyChangeHistory(studyId: string): Promise<StudyChange[]>;
  getPatientEnrollmentHistory(enrollmentId: string): Promise<PatientEnrollmentChange[]>;
  generateAuditReport(studyId: string, fromDate: Date, toDate: Date): Promise<AuditReport>;
  
  // Data Export and Import
  exportStudyData(studyId: string, format: 'json' | 'csv' | 'xml'): Promise<Blob>;
  importStudyData(studyId: string, data: any, format: 'json' | 'csv' | 'xml'): Promise<ImportResult>;
  
  // Study Locking and Archival (CFR 21 Part 11)
  lockStudy(studyId: string, reason: string): Promise<void>;
  unlockStudy(studyId: string, reason: string): Promise<void>;
  archiveStudy(studyId: string, reason: string): Promise<void>;
}

// Supporting Interfaces
export interface StudyStatistics {
  totalPatients: number;
  activePatients: number;
  completedPatients: number;
  withdrawnPatients: number;
  enrollmentRate: number;
  completionRate: number;
  averageStudyDuration: number;
  totalSections: number;
  totalForms: number;
  formsCompleted: number;
  formsOverdue: number;
}

export interface EnrollmentStatistics {
  plannedEnrollment: number;
  actualEnrollment: number;
  enrollmentPercentage: number;
  enrollmentRate: { date: Date, count: number }[];
  projectedCompletionDate?: Date;
  sitesActive: number;
  sitesCompleted: number;
}

export interface CompletionStatistics {
  sectionsCompleted: number;
  sectionsPending: number;
  sectionsOverdue: number;
  formsCompleted: number;
  formsPending: number;
  formsOverdue: number;
  averageCompletionTime: number;
  completionRateBySection: { sectionId: string, sectionName: string, completionRate: number }[];
}

export interface AuditReport {
  studyId: string;
  generatedAt: Date;
  generatedBy: string;
  fromDate: Date;
  toDate: Date;
  totalEvents: number;
  userActivity: { userId: string, userName: string, eventCount: number }[];
  dataChanges: { entityType: string, changeCount: number }[];
  securityEvents: { eventType: string, count: number }[];
  complianceViolations: { violationType: string, count: number, details: string[] }[];
}

export interface ImportResult {
  success: boolean;
  recordsProcessed: number;
  recordsImported: number;
  errors: { row: number, error: string }[];
  warnings: { row: number, warning: string }[];
}
