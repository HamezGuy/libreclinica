import { AccessLevel } from '../enums/access-levels.enum';

// Organization Status Types
export type OrganizationStatus = 
  | 'active' 
  | 'inactive' 
  | 'suspended' 
  | 'pending_approval'
  | 'deactivated';

// Organization Types
export type OrganizationType = 
  | 'hospital' 
  | 'clinic' 
  | 'research_institution' 
  | 'pharmaceutical' 
  | 'cro' 
  | 'university' 
  | 'government' 
  | 'other';

// Organization Tier for different feature access
export type OrganizationTier = 
  | 'basic' 
  | 'professional' 
  | 'enterprise' 
  | 'academic';

// User Roles within Organization
export type UserRole = 
  | 'data_entry' 
  | 'investigator'
  | 'admin'
  | 'superadmin';

// User Status within Organization
export type UserStatus = 
  | 'active'
  | 'pending' 
  | 'suspended'
  | 'inactive';

// Main Organization Interface
export interface Organization {
  id: string;
  name: string;
  displayName: string;
  type: OrganizationType;
  tier: OrganizationTier;
  status: OrganizationStatus;
  
  // Organization Keys for User Verification
  verificationKey: string; // Public key users enter during registration
  adminKey: string; // Private key for admin operations
  
  // Contact Information
  contactInfo: {
    email: string;
    phone?: string;
    website?: string;
    address: {
      street: string;
      city: string;
      state: string;  
      postalCode: string;
      country: string;
    };
  };
  
  // Organization Settings
  settings: {
    allowSelfRegistration: boolean;
    requireAdminApproval: boolean;
    maxUsers: number;
    maxStudies: number;
    allowedStudyTypes: string[];
    dataRetentionDays: number;
    requireMFA: boolean;
    passwordPolicy: PasswordPolicy;
    sessionTimeout: number; // minutes
  };
  
  // Compliance and Security
  compliance: {
    hipaaCompliant: boolean;
    gdprCompliant: boolean;
    cfr21Part11: boolean;
    iso27001: boolean;
    customCertifications: string[];
  };
  
  // Organization Management
  admins: string[]; // User IDs with admin access
  superAdmins: string[]; // User IDs with super admin access
  
  // Study Access Control
  studyAccess: {
    defaultStudyAccess: AccessLevel;
    studyRestrictions: StudyRestriction[];
    allowCrossStudyAccess: boolean;
  };
  
  // Audit and Tracking
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  lastActivity?: Date;
  auditTrail: OrganizationAuditEntry[];
  
  // Billing and Usage (if applicable)
  billing?: {
    plan: string;
    billingEmail: string;
    nextBillingDate?: Date;
    usageStats: UsageStats;
  };
  
  // Custom metadata
  metadata?: { [key: string]: any };
}

// Password Policy Configuration
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventReuse: number; // Number of previous passwords to prevent reuse
  expirationDays: number; // 0 = never expires
}

// Study Access Restrictions by Role
export interface StudyRestriction {
  studyId: string;
  allowedRoles: AccessLevel[];
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canExport: boolean;
    canEnrollPatients: boolean;
    canLockForms: boolean;
  };
  restrictedSections?: string[]; // Section IDs that are restricted
}

// Organization Audit Trail
export interface OrganizationAuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: OrganizationAuditAction;
  details: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: any; // Before/after values for modifications
}

// Organization Audit Actions
export type OrganizationAuditAction = 
  | 'organization_created'
  | 'organization_updated'
  | 'user_added'
  | 'user_removed'
  | 'user_invited'
  | 'user_approved'
  | 'user_rejected'
  | 'user_suspended'
  | 'user_reactivated'
  | 'user_role_changed'
  | 'role_changed'
  | 'study_access_granted'
  | 'study_access_revoked'
  | 'study_access_updated'
  | 'settings_updated'
  | 'key_regenerated'
  | 'organization_suspended'
  | 'organization_reactivated';

// Usage Statistics
export interface UsageStats {
  activeUsers: number;
  totalStudies: number;
  totalPatients: number;
  totalForms: number;
  storageUsedMB: number;
  monthlyLogins: number;
  lastUpdated: Date;
}

// User Registration Request (pending approval)
export interface UserRegistrationRequest {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  requestedRole: AccessLevel;
  role: UserRole; // Alias for requestedRole for compatibility
  verificationKey: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  submittedAt: Date; // Alias for requestedAt for compatibility
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  isVerified: boolean;
  
  // Additional Information
  jobTitle?: string;
  department?: string;
  supervisorEmail?: string;
  reasonForAccess?: string;
}

// Organization User Information (for user management)
export interface OrganizationUserInfo {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  department?: string;
  joinedAt: Date;
  lastLoginAt?: Date;
  studyAccess?: StudyAccessInfo[];
}

// Study Access Information for Users
export interface StudyAccessInfo {
  studyId: string;
  studyTitle?: string;
  accessLevel: 'read' | 'write' | 'admin';
  grantedAt: Date;
  grantedBy: string;
}

// Organization Invitation (sent by admins)
export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  invitedRole: AccessLevel;
  assignedStudies: string[];
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  personalMessage?: string;
}

// Organization Summary for Lists
export interface OrganizationSummary {
  id: string;
  name: string;
  displayName: string;
  type: OrganizationType;
  tier: OrganizationTier;
  status: OrganizationStatus;
  activeUsers: number;
  totalStudies: number;
  lastActivity?: Date;
  complianceLevel: number; // 0-100% based on enabled compliance features
}

// Organization Permissions for Current User
export interface OrganizationPermissions {
  canViewOrganization: boolean;
  canEditOrganization: boolean;
  canManageUsers: boolean;
  canInviteUsers: boolean;
  canRemoveUsers: boolean;
  canChangeUserRoles: boolean;
  canManageStudyAccess: boolean;
  canViewAuditLogs: boolean;
  canRegenerateKeys: boolean;
  canSuspendOrganization: boolean;
  canDeleteOrganization: boolean;
}
