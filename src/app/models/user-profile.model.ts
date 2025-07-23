import { AccessLevel, UserStatus, ComplianceRegion } from '../enums/access-levels.enum';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  organization?: string;
  phoneNumber?: string;
  accessLevel: AccessLevel;
  status: UserStatus;
  complianceRegion: ComplianceRegion;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
  permissions: UserPermissions;
  assignedStudies?: string[];
  auditTrail?: AuditEntry[];
  
  // EDC Compliance fields (21 CFR Part 11, HIPAA, GDPR)
  emailVerified?: boolean;
  lastPasswordChange?: Date;
  passwordExpiresAt?: Date | null;
  requireMFA?: boolean;
  mfaEnabled?: boolean;
  agreedToTerms?: boolean;
  agreedToTermsDate?: Date | null;
  trainingCompleted?: boolean;
  trainingCompletedDate?: Date | null;
  dataPrivacyConsent?: boolean;
  dataPrivacyConsentDate?: Date | null;
  
  // Additional security fields
  failedLoginAttempts?: number;
  accountLockedUntil?: Date | null;
  lastSecurityReview?: Date;
  authorizedIPAddresses?: string[];
  title?: string;
}

export interface UserPermissions {
  canCreateStudy: boolean;
  canEditStudy: boolean;
  canDeleteStudy: boolean;
  canViewAllData: boolean;
  canExportData: boolean;
  canManageUsers: boolean;
  canViewAuditLogs: boolean;
  canApproveChanges: boolean;
}

export interface AuditEntry {
  timestamp: Date;
  userId: string;
  action: string;
  details: string;
  performedBy?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}
