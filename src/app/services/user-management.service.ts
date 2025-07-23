import { Injectable, inject, Inject } from '@angular/core';
import { 
  Firestore, 
  doc, 
  getDoc,
  updateDoc,
  serverTimestamp 
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { UserProfile } from '../models/user-profile.model';
import { AccessLevel, UserStatus } from '../enums/access-levels.enum';
import { IEventBus, UserRoleChangedEvent, UserStatusChangedEvent } from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';

/**
 * Event-driven User Management Service
 * Handles user role and status changes with comprehensive audit logging
 */
@Injectable({
  providedIn: 'root'
})
export class UserManagementService {
  private firestore = inject(Firestore);

  constructor(@Inject(EVENT_BUS_TOKEN) private eventBus: IEventBus) {}

  /**
   * Update user access level (role) with event-driven audit logging
   */
  async updateUserAccessLevel(
    targetUserId: string, 
    newAccessLevel: AccessLevel, 
    changedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      // Get current user profile to capture old role
      const userRef = doc(this.firestore, 'users', targetUserId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }
      
      const currentProfile = userDoc.data() as UserProfile;
      const oldRole = currentProfile.accessLevel;
      
      // Update the user's role and permissions
      const newPermissions = this.getDefaultPermissions(newAccessLevel);
      
      await updateDoc(userRef, {
        accessLevel: newAccessLevel,
        permissions: newPermissions,
        updatedAt: serverTimestamp()
      });
      
      // Publish role changed event
      const roleChangedEvent: UserRoleChangedEvent = {
        id: `role_changed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'USER_ROLE_CHANGED',
        timestamp: new Date(),
        userId: changedBy,
        targetUserId: targetUserId,
        targetUserEmail: currentProfile.email,
        oldRole: oldRole,
        newRole: newAccessLevel,
        changedBy: changedBy,
        reason: reason
      };
      
      this.eventBus.publish(roleChangedEvent);
      
    } catch (error) {
      console.error('Error updating user access level:', error);
      throw error;
    }
  }

  /**
   * Update user status with event-driven audit logging
   */
  async updateUserStatus(
    targetUserId: string, 
    newStatus: UserStatus, 
    changedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      // Get current user profile to capture old status
      const userRef = doc(this.firestore, 'users', targetUserId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }
      
      const currentProfile = userDoc.data() as UserProfile;
      const oldStatus = currentProfile.status;
      
      // Update the user's status
      await updateDoc(userRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      
      // Publish status changed event
      const statusChangedEvent: UserStatusChangedEvent = {
        id: `status_changed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'USER_STATUS_CHANGED',
        timestamp: new Date(),
        userId: changedBy,
        targetUserId: targetUserId,
        targetUserEmail: currentProfile.email,
        oldStatus: oldStatus,
        newStatus: newStatus,
        changedBy: changedBy,
        reason: reason
      };
      
      this.eventBus.publish(statusChangedEvent);
      
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  }

  /**
   * Approve pending user (changes status from PENDING_APPROVAL to ACTIVE)
   */
  async approveUser(targetUserId: string, approvedBy: string): Promise<void> {
    await this.updateUserStatus(
      targetUserId, 
      UserStatus.ACTIVE, 
      approvedBy, 
      'User approved for system access'
    );
  }

  /**
   * Suspend user account
   */
  async suspendUser(targetUserId: string, suspendedBy: string, reason: string): Promise<void> {
    await this.updateUserStatus(
      targetUserId, 
      UserStatus.SUSPENDED, 
      suspendedBy, 
      reason
    );
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(targetUserId: string, deactivatedBy: string, reason: string): Promise<void> {
    await this.updateUserStatus(
      targetUserId, 
      UserStatus.INACTIVE, 
      deactivatedBy, 
      reason
    );
  }

  /**
   * Promote user to higher access level
   */
  async promoteUser(
    targetUserId: string, 
    newRole: AccessLevel, 
    promotedBy: string, 
    reason: string
  ): Promise<void> {
    await this.updateUserAccessLevel(targetUserId, newRole, promotedBy, reason);
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const userDoc = await getDoc(doc(this.firestore, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Get default permissions based on access level
   */
  private getDefaultPermissions(accessLevel: AccessLevel): any {
    switch (accessLevel) {
      case AccessLevel.SUPER_ADMIN:
        return {
          canCreateStudy: true,
          canEditStudy: true,
          canDeleteStudy: true,
          canViewAllData: true,
          canExportData: true,
          canManageUsers: true,
          canViewAuditLogs: true,
          canApproveChanges: true
        };
      case AccessLevel.ADMIN:
        return {
          canCreateStudy: true,
          canEditStudy: true,
          canDeleteStudy: false,
          canViewAllData: true,
          canExportData: true,
          canManageUsers: true,
          canViewAuditLogs: true,
          canApproveChanges: true
        };
      case AccessLevel.INVESTIGATOR:
        return {
          canCreateStudy: false,
          canEditStudy: true,
          canDeleteStudy: false,
          canViewAllData: false,
          canExportData: true,
          canManageUsers: false,
          canViewAuditLogs: false,
          canApproveChanges: false
        };
      case AccessLevel.MONITOR:
        return {
          canCreateStudy: false,
          canEditStudy: false,
          canDeleteStudy: false,
          canViewAllData: true,
          canExportData: false,
          canManageUsers: false,
          canViewAuditLogs: true,
          canApproveChanges: false
        };
      case AccessLevel.DATA_ENTRY:
        return {
          canCreateStudy: false,
          canEditStudy: true,
          canDeleteStudy: false,
          canViewAllData: false,
          canExportData: false,
          canManageUsers: false,
          canViewAuditLogs: false,
          canApproveChanges: false
        };
      case AccessLevel.VIEWER:
      default:
        return {
          canCreateStudy: false,
          canEditStudy: false,
          canDeleteStudy: false,
          canViewAllData: false,
          canExportData: false,
          canManageUsers: false,
          canViewAuditLogs: false,
          canApproveChanges: false
        };
    }
  }
}
