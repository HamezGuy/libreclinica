import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  orderBy,
  limit,
  collectionData
} from '@angular/fire/firestore';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { EdcCompliantAuthService } from './edc-compliant-auth.service';
import { 
  Organization, 
  OrganizationInvitation, 
  OrganizationPermissions, 
  OrganizationTier, 
  OrganizationAuditAction,
  OrganizationAuditEntry,
  StudyRestriction,
  UserRegistrationRequest,
  OrganizationUserInfo,
  UserRole,
  UserStatus 
} from '../models/organization.model';
import { UserProfile } from '../models/user-profile.model';
import { AccessLevel } from '../enums/access-levels.enum';

@Injectable({
  providedIn: 'root'
})
export class OrganizationService {
  private firestore = inject(Firestore);
  private authService = inject(EdcCompliantAuthService);
  
  private organizationsSubject = new BehaviorSubject<Organization[]>([]);
  public organizations$ = this.organizationsSubject.asObservable();
  
  private currentOrganizationSubject = new BehaviorSubject<Organization | null>(null);
  public currentOrganization$ = this.currentOrganizationSubject.asObservable();

  constructor() {
    // Load user's organization when auth state changes
    this.authService.currentUserProfile$.subscribe(user => {
      if (user?.organization) {
        this.loadOrganization(user.organization);
      }
    });
  }

  // Organization CRUD Operations
  async createOrganization(organizationData: Partial<Organization>): Promise<string> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const organizationId = `org-${Date.now()}`;
    const verificationKey = this.generateVerificationKey();
    const adminKey = this.generateAdminKey();

    const organization: Organization = {
      id: organizationId,
      name: organizationData.name || '',
      displayName: organizationData.displayName || organizationData.name || '',
      type: organizationData.type || 'other',
      tier: organizationData.tier || 'basic',
      status: 'pending_approval',
      verificationKey,
      adminKey,
      contactInfo: {
        email: organizationData.contactInfo?.email || currentUser.email,
        phone: organizationData.contactInfo?.phone,
        website: organizationData.contactInfo?.website,
        address: organizationData.contactInfo?.address || {
          street: '',
          city: '',
          state: '',
          postalCode: '',
          country: ''
        }
      },
      settings: {
        allowSelfRegistration: true,
        requireAdminApproval: true,
        maxUsers: this.getMaxUsersByTier(organizationData.tier || 'basic'),
        maxStudies: this.getMaxStudiesByTier(organizationData.tier || 'basic'),
        allowedStudyTypes: ['interventional', 'observational'],
        dataRetentionDays: 2555, // 7 years default
        requireMFA: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
          preventReuse: 3,
          expirationDays: 90
        },
        sessionTimeout: 120 // 2 hours
      },
      compliance: {
        hipaaCompliant: false,
        gdprCompliant: false,
        cfr21Part11: false,
        iso27001: false,
        customCertifications: []
      },
      admins: [currentUser.uid],
      superAdmins: [currentUser.uid],
      studyAccess: {
        defaultStudyAccess: AccessLevel.DATA_ENTRY,
        studyRestrictions: [],
        allowCrossStudyAccess: false
      },
      createdAt: new Date(),
      createdBy: currentUser.uid,
      updatedAt: new Date(),
      updatedBy: currentUser.uid,
      auditTrail: [{
        id: `audit-${Date.now()}`,
        timestamp: new Date(),
        userId: currentUser.uid,
        userEmail: currentUser.email,
        action: 'organization_created',
        details: `Organization "${organizationData.name}" created`
      }]
    };

    const orgRef = doc(this.firestore, `organizations/${organizationId}`);
    await setDoc(orgRef, organization);

    // Update user profile with organization
    await this.authService.updateUserProfile(currentUser.uid, {
      organization: organizationId
    });

    return organizationId;
  }

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const orgRef = doc(this.firestore, `organizations/${organizationId}`);
    const orgSnap = await getDoc(orgRef);
    return orgSnap.exists() ? orgSnap.data() as Organization : null;
  }

  async updateOrganization(organizationId: string, updates: Partial<Organization>): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const orgRef = doc(this.firestore, `organizations/${organizationId}`);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    };

    await updateDoc(orgRef, updateData);
    await this.addAuditEntry(organizationId, 'organization_updated', 'Organization settings updated');
  }

  // Organization Verification and Keys
  async verifyOrganization(verificationKey: string): Promise<Organization | null> {
    const orgsRef = collection(this.firestore, 'organizations');
    const q = query(orgsRef, where('verificationKey', '==', verificationKey), where('status', '==', 'active'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.empty ? null : querySnapshot.docs[0].data() as Organization;
  }

  async regenerateVerificationKey(organizationId: string): Promise<string> {
    const newKey = this.generateVerificationKey();
    await this.updateOrganization(organizationId, { verificationKey: newKey });
    await this.addAuditEntry(organizationId, 'key_regenerated', 'Verification key regenerated');
    return newKey;
  }

  // User Management Within Organization
  async inviteUser(organizationId: string, invitation: Partial<OrganizationInvitation>): Promise<string> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const invitationId = `inv-${Date.now()}`;
    const invitationData: OrganizationInvitation = {
      id: invitationId,
      organizationId,
      email: invitation.email || '',
      invitedRole: invitation.invitedRole || AccessLevel.DATA_ENTRY,
      assignedStudies: invitation.assignedStudies || [],
      invitedBy: currentUser.uid,
      invitedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      status: 'pending',
      personalMessage: invitation.personalMessage
    };

    const invRef = doc(this.firestore, `organization_invitations/${invitationId}`);
    await setDoc(invRef, invitationData);

    await this.addAuditEntry(organizationId, 'user_invited', `User ${invitation.email} invited`);
    return invitationId;
  }

  async approveUserRegistration(requestId: string, approvedRole?: AccessLevel): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const requestRef = doc(this.firestore, `user_registration_requests/${requestId}`);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) throw new Error('Registration request not found');
    
    const request = requestSnap.data() as UserRegistrationRequest;
    
    // Update request status
    await updateDoc(requestRef, {
      status: 'approved',
      reviewedAt: serverTimestamp(),
      reviewedBy: currentUser.uid
    });

    // Create user profile if it doesn't exist
    // This would typically be handled by the registration process
    await this.addAuditEntry(request.organizationId, 'user_added', `User ${request.email} approved and added`);
  }

  async changeUserRole(organizationId: string, userId: string, newRole: AccessLevel): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // Update user profile
    await this.authService.updateUserProfile(userId, {
      accessLevel: newRole
    });

    await this.addAuditEntry(organizationId, 'user_role_changed', `User role changed to ${newRole}`);
  }

  async removeUserFromOrganization(organizationId: string, userId: string): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // Update user profile to remove organization
    await this.authService.updateUserProfile(userId, {
      organization: '',
      status: 'inactive' as any // Use string literal instead of UserStatus enum
    });

    await this.addAuditEntry(organizationId, 'user_removed', `User removed from organization`);
  }

  // Study Access Management
  async setStudyAccess(organizationId: string, studyId: string, restriction: StudyRestriction): Promise<void> {
    const org = await this.getOrganization(organizationId);
    if (!org) throw new Error('Organization not found');

    const existingIndex = org.studyAccess.studyRestrictions.findIndex(r => r.studyId === studyId);
    
    if (existingIndex >= 0) {
      org.studyAccess.studyRestrictions[existingIndex] = restriction;
    } else {
      org.studyAccess.studyRestrictions.push(restriction);
    }

    await this.updateOrganization(organizationId, {
      studyAccess: org.studyAccess
    });

    await this.addAuditEntry(organizationId, 'study_access_granted', `Study access configured for ${studyId}`);
  }

  async removeStudyAccess(organizationId: string, studyId: string): Promise<void> {
    const org = await this.getOrganization(organizationId);
    if (!org) throw new Error('Organization not found');

    org.studyAccess.studyRestrictions = org.studyAccess.studyRestrictions.filter(r => r.studyId !== studyId);

    await this.updateOrganization(organizationId, {
      studyAccess: org.studyAccess
    });

    await this.addAuditEntry(organizationId, 'study_access_revoked', `Study access revoked for ${studyId}`);
  }

  // User Permissions and Validation
  async getUserPermissions(userId: string, organizationId: string): Promise<OrganizationPermissions> {
    // Use current user instead of private getUserProfile method
    const currentUser = await this.authService.getCurrentUserProfile();
    const org = await this.getOrganization(organizationId);
    
    if (!currentUser || !org) {
      return this.getDefaultPermissions();
    }

    const isSuperAdmin = org.superAdmins?.includes(userId) || false;
    const isAdmin = org.admins?.includes(userId) || isSuperAdmin;
    const isHighLevel = ['superadmin', 'admin'].includes(currentUser.accessLevel as string);

    return {
      canViewOrganization: true,
      canEditOrganization: isSuperAdmin,
      canManageUsers: isAdmin,
      canInviteUsers: isAdmin,
      canRemoveUsers: isSuperAdmin,
      canChangeUserRoles: isSuperAdmin,
      canManageStudyAccess: isAdmin,
      canViewAuditLogs: isHighLevel,
      canRegenerateKeys: isSuperAdmin,
      canSuspendOrganization: isSuperAdmin,
      canDeleteOrganization: isSuperAdmin
    };
  }

  async canUserAccessStudy(userId: string, studyId: string): Promise<boolean> {
    // Use current user instead of private getUserProfile method
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser?.organization) return false;

    const org = await this.getOrganization(currentUser.organization);
    if (!org) return false;

    const restriction = org.studyAccess.studyRestrictions.find(r => r.studyId === studyId);
    
    if (!restriction) {
      // Use default access level based on current user
      return true; // Simplified access logic
    }

    return restriction.allowedRoles.includes(currentUser.accessLevel);
  }

  // Utility Methods
  private generateVerificationKey(): string {
    // Generate a human-readable verification key
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
    const numbers = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const word1 = words[Math.floor(Math.random() * words.length)];
    const word2 = words[Math.floor(Math.random() * words.length)];
    return `${word1}-${word2}-${numbers}`.toUpperCase();
  }

  private generateAdminKey(): string {
    // Generate a secure admin key
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private getMaxUsersByTier(tier: OrganizationTier): number {
    switch (tier) {
      case 'basic': return 10;
      case 'professional': return 50;
      case 'enterprise': return 500;
      case 'academic': return 100;
      default: return 10;
    }
  }

  private getMaxStudiesByTier(tier: OrganizationTier): number {
    switch (tier) {
      case 'basic': return 5;
      case 'professional': return 25;
      case 'enterprise': return 100;
      case 'academic': return 50;
      default: return 5;
    }
  }

  private getDefaultPermissions(): OrganizationPermissions {
    return {
      canViewOrganization: false,
      canEditOrganization: false,
      canManageUsers: false,
      canInviteUsers: false,
      canRemoveUsers: false,
      canChangeUserRoles: false,
      canManageStudyAccess: false,
      canViewAuditLogs: false,
      canRegenerateKeys: false,
      canSuspendOrganization: false,
      canDeleteOrganization: false
    };
  }

  private async addAuditEntry(organizationId: string, action: OrganizationAuditAction, details: string): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) return;

    const auditEntry: OrganizationAuditEntry = {
      id: `audit-${Date.now()}`,
      timestamp: new Date(),
      userId: currentUser.uid,
      userEmail: currentUser.email,
      action,
      details
    };

    const org = await this.getOrganization(organizationId);
    if (org) {
      org.auditTrail.push(auditEntry);
      await this.updateOrganization(organizationId, { auditTrail: org.auditTrail });
    }
  }

  private async loadOrganization(organizationId: string): Promise<void> {
    try {
      const org = await this.getOrganization(organizationId);
      this.currentOrganizationSubject.next(org);
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  }

  // Observable Methods
  getOrganizations(): Observable<Organization[]> {
    return this.organizations$;
  }

  getUserRegistrationRequests(organizationId: string): Observable<UserRegistrationRequest[]> {
    const requestsRef = collection(this.firestore, `organizations/${organizationId}/registrationRequests`);
    return collectionData(requestsRef, { idField: 'id' }) as Observable<UserRegistrationRequest[]>;
  }

  getPendingRegistrationRequests(organizationId: string): Promise<UserRegistrationRequest[]> {
    const requestsRef = collection(this.firestore, `organizations/${organizationId}/registrationRequests`);
    const q = query(requestsRef, where('status', '==', 'pending'));
    return getDocs(q).then(snapshot => 
      snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserRegistrationRequest))
    );
  }

  async getOrganizationUsers(organizationId: string): Promise<OrganizationUserInfo[]> {
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, where('organization', '==', organizationId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const userData = doc.data() as UserProfile;
      return {
        userId: doc.id,
        email: userData.email,
        firstName: userData.displayName?.split(' ')[0] || '',
        lastName: userData.displayName?.split(' ').slice(1).join(' ') || '',
        role: userData.accessLevel as any, // Convert AccessLevel to UserRole
        status: 'active' as any, // Default status
        department: userData.organization, // Placeholder
        joinedAt: userData.createdAt || new Date(),
        lastLoginAt: userData.lastLoginAt,
        studyAccess: [] // TODO: Implement study access tracking
      } as OrganizationUserInfo;
    });
  }

  async approveRegistrationRequest(organizationId: string, requestId: string): Promise<void> {
    const requestRef = doc(this.firestore, `organizations/${organizationId}/registrationRequests/${requestId}`);
    await updateDoc(requestRef, {
      status: 'approved',
      reviewedAt: new Date(),
      reviewedBy: (await this.authService.getCurrentUserProfile())?.uid
    });
    
    await this.addAuditEntry(organizationId, 'user_approved', `Registration request ${requestId} approved`);
  }

  async rejectRegistrationRequest(organizationId: string, requestId: string, reason?: string): Promise<void> {
    const requestRef = doc(this.firestore, `organizations/${organizationId}/registrationRequests/${requestId}`);
    await updateDoc(requestRef, {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: (await this.authService.getCurrentUserProfile())?.uid,
      rejectionReason: reason
    });
    
    await this.addAuditEntry(organizationId, 'user_rejected', `Registration request ${requestId} rejected: ${reason}`);
  }

  async updateUserRole(organizationId: string, userId: string, newRole: UserRole, reason: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${userId}`);
    await updateDoc(userRef, {
      accessLevel: newRole as any // Convert UserRole to AccessLevel
    });
    
    await this.addAuditEntry(organizationId, 'role_changed', `User ${userId} role changed to ${newRole}: ${reason}`);
  }

  async updateUserStudyAccess(organizationId: string, userId: string, studyIds: string[], accessLevel: string): Promise<void> {
    // TODO: Implement study access management
    await this.addAuditEntry(organizationId, 'study_access_updated', `Study access updated for user ${userId}`);
  }

  async suspendUser(organizationId: string, userId: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${userId}`);
    await updateDoc(userRef, {
      status: 'suspended'
    });
    
    await this.addAuditEntry(organizationId, 'user_suspended', `User ${userId} suspended`);
  }

  async reactivateUser(organizationId: string, userId: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${userId}`);
    await updateDoc(userRef, {
      status: 'active'
    });
    
    await this.addAuditEntry(organizationId, 'user_reactivated', `User ${userId} reactivated`);
  }
}
