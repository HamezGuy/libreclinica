import { FormTemplate } from './form-template.model';

// Phase Status
export type PhaseStatus = 
  | 'not_started'
  | 'in_progress' 
  | 'completed'
  | 'locked'
  | 'skipped';

// Phase Transition Rule
export interface PhaseTransitionRule {
  fromPhase: string;
  toPhase: string;
  conditions: TransitionCondition[];
  requiresApproval?: boolean;
  approvalRoles?: string[];
}

// Transition Condition
export interface TransitionCondition {
  type: 'all_required_forms_completed' | 'specific_forms_completed' | 'date_based' | 'custom';
  formIds?: string[]; // For specific_forms_completed
  daysAfterEnrollment?: number; // For date_based
  customCondition?: string; // For custom conditions
}

// Template Assignment
export interface PhaseTemplateAssignment {
  templateId: string;
  templateName: string;
  isRequired: boolean;
  order: number;
  dueAfterDays?: number; // Days after phase start
  category?: string; // e.g., 'vitals', 'labs', 'questionnaire'
  description?: string;
}

// Study Phase Configuration
export interface StudyPhaseConfig {
  id: string;
  studyId: string;
  phaseName: string;
  phaseCode: string; // Short code like 'SCR', 'BSL', 'TRT1'
  description?: string;
  order: number;
  
  // Duration
  plannedDurationDays?: number;
  windowStartDays?: number; // Days before planned date
  windowEndDays?: number; // Days after planned date
  
  // Templates
  templateAssignments: PhaseTemplateAssignment[];
  
  // Requirements
  entryRequirements?: string[]; // Text descriptions of requirements
  exitRequirements?: string[]; // Text descriptions of requirements
  
  // Metadata
  isActive: boolean;
  allowSkip: boolean;
  allowParallel: boolean; // Can run parallel with other phases
  
  // Custom attributes for flexibility
  customAttributes?: { [key: string]: any };
  
  // Audit
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
}

// Patient Phase Progress
export interface PatientPhaseProgress {
  id: string;
  patientId: string;
  studyId: string;
  phaseId: string;
  phaseName: string;
  
  // Status
  status: PhaseStatus;
  startedDate?: Date;
  completedDate?: Date;
  skippedDate?: Date;
  skippedReason?: string;
  
  // Progress tracking
  totalTemplates: number;
  requiredTemplates: number;
  completedTemplates: number;
  completedRequiredTemplates: number;
  progressPercentage: number;
  
  // Form completion tracking
  formCompletionStatus: {
    [templateId: string]: {
      isCompleted: boolean;
      completedDate?: Date;
      formInstanceId?: string;
      isRequired: boolean;
    };
  };
  
  // Validation
  canProgress: boolean;
  blockingReasons?: string[];
  
  // Audit
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
}

// Phase Template Status (for UI display)
export interface PhaseTemplateStatus {
  templateId: string;
  templateName: string;
  isRequired: boolean;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  dueDate?: Date;
  completedDate?: Date;
  formInstanceId?: string;
  completionPercentage?: number;
}

// Study Phase Summary (for dashboard views)
export interface StudyPhaseSummary {
  phaseId: string;
  phaseName: string;
  phaseCode: string;
  order: number;
  
  // Patient statistics
  totalPatients: number;
  patientsNotStarted: number;
  patientsInProgress: number;
  patientsCompleted: number;
  patientsSkipped: number;
  
  // Template statistics
  totalTemplates: number;
  requiredTemplates: number;
  averageCompletionRate: number;
  
  // Timing
  averageDurationDays?: number;
  overduePatients: number;
}
