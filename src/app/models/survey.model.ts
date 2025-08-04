export interface Survey {
  id?: string;
  title: string;
  description?: string;
  type: SurveyType;
  status: SurveyStatus;
  
  // Display settings
  displayMode: SurveyDisplayMode;
  triggerType: SurveyTriggerType;
  triggerConfig?: SurveyTriggerConfig;
  
  // Content
  questions: SurveyQuestion[];
  welcomeMessage?: string;
  thankYouMessage?: string;
  welcomeScreen?: {
    enabled: boolean;
    title: string;
    message: string;
  };
  thankYouScreen?: {
    enabled: boolean;
    title: string;
    message: string;
  };
  
  // Triggers
  triggers?: SurveyTrigger[];
  
  // Targeting
  targetAudience?: SurveyTargeting;
  targetRoles?: string[];
  targetStudies?: string[];
  targetPatientStatus?: string[];
  
  // Scheduling
  startDate?: Date;
  endDate?: Date;
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
  isActive: boolean;
  
  // Response settings
  allowAnonymous: boolean;
  allowMultipleResponses: boolean;
  responseLimit?: number;
  isAnonymous?: boolean;
  requiresAuth?: boolean;
  maxResponsesPerUser?: number;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  
  // Analytics
  responseCount?: number;
  completionRate?: number;
  averageCompletionTime?: number;
}

export type SurveyType = 'feedback' | 'satisfaction' | 'nps' | 'research' | 'screening' | 'custom';
export type SurveyStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type SurveyDisplayMode = 'popup' | 'embedded' | 'fullscreen' | 'slide-in';
export type SurveyTriggerType = 'immediate' | 'delay' | 'exit-intent' | 'scroll' | 'manual' | 'page-visit';

export interface SurveyTriggerConfig {
  delaySeconds?: number;
  scrollPercentage?: number;
  pageVisitCount?: number;
  specificPages?: string[];
  excludePages?: string[];
}

export interface SurveyTargeting {
  userRoles?: string[];
  studyIds?: string[];
  patientStatus?: string[];
  customCriteria?: { [key: string]: any };
}

export interface SurveyTrigger {
  id?: string;
  type: 'event' | 'condition' | 'schedule';
  event?: string;
  condition?: string;
  schedule?: string;
  action: string;
  enabled: boolean;
}

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  text: string;
  description?: string;
  required: boolean;
  order: number;
  
  // Conditional logic
  showIf?: QuestionCondition;
  
  // Question-specific options
  options?: QuestionOption[];
  validation?: QuestionValidation;
  
  // Layout
  layout?: QuestionLayout;
  
  // Conditional logic
  conditionalLogic?: {
    enabled: boolean;
    conditions: any[];
  };
  
  // Settings
  settings?: {
    randomizeOptions?: boolean;
    allowOther?: boolean;
    ratingMax?: number;
    scaleMin?: number;
    scaleMax?: number;
    scaleMinLabel?: string;
    scaleMaxLabel?: string;
  };
}

export type QuestionType = 
  | 'single-choice'
  | 'multiple-choice'
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'rating'
  | 'scale'
  | 'nps'
  | 'matrix'
  | 'ranking'
  | 'file-upload';

export interface QuestionOption {
  id: string;
  text: string;
  value: any;
  order: number;
  isOther?: boolean;
  otherText?: string;
}

export interface QuestionCondition {
  questionId: string;
  operator: 'equals' | 'not-equals' | 'contains' | 'greater-than' | 'less-than';
  value: any;
}

export interface QuestionValidation {
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  min?: number;
  max?: number;
  pattern?: string;
  customMessage?: string;
}

export interface QuestionLayout {
  columns?: number;
  showLabels?: boolean;
  labelPosition?: 'top' | 'left' | 'right';
}

export interface SurveyResponse {
  id?: string;
  surveyId: string;
  respondentId?: string; // Optional for anonymous surveys
  respondentType: 'patient' | 'staff' | 'anonymous';
  
  // Response data
  answers: { [questionId: string]: any };
  
  // Metadata
  startedAt: Date;
  completedAt?: Date;
  isComplete: boolean;
  completionTimeSeconds?: number;
  
  // Context
  contextData?: {
    studyId?: string;
    patientId?: string;
    formInstanceId?: string;
    pageUrl?: string;
    userAgent?: string;
  };
  
  // Tracking
  ipAddress?: string;
  deviceType?: string;
  browser?: string;
}

export interface SurveyAnalytics {
  surveyId: string;
  totalResponses: number;
  completedResponses: number;
  abandonedResponses: number;
  averageCompletionTime: number;
  responseRate: number;
  
  // Question-level analytics
  questionAnalytics: {
    [questionId: string]: {
      responseCount: number;
      skippedCount: number;
      averageTime: number;
      // For choice questions
      optionCounts?: { [optionId: string]: number };
      // For numeric questions
      average?: number;
      min?: number;
      max?: number;
    };
  };
  
  // Time-based analytics
  responsesByDay: { date: Date; count: number }[];
  responsesByHour: { hour: number; count: number }[];
  
  // Demographics
  responsesByUserType: { [type: string]: number };
  responsesByDevice: { [device: string]: number };
}
