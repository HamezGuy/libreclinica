import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import { OrganizationService } from '../../services/organization.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { StudyService } from '../../services/study.service';
import { Organization, UserRegistrationRequest, UserRole, OrganizationUserInfo } from '../../models/organization.model';
import { UserProfile } from '../../models/user-profile.model';
import { Study } from '../../models/study.model';

interface UserManagementFilters {
  role: UserRole | 'all';
  status: 'active' | 'pending' | 'suspended' | 'all';
  searchTerm: string;
}

@Component({
  selector: 'app-admin-user-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-user-management.component.html',
  styleUrls: ['./admin-user-management.component.scss']
})
export class AdminUserManagementComponent implements OnInit {
  private orgService = inject(OrganizationService);
  private authService = inject(EdcCompliantAuthService);
  private studyService = inject(StudyService);
  private fb = inject(FormBuilder);

  // Component State
  currentUser: UserProfile | null = null;
  currentOrganization: Organization | null = null;
  organizationUsers: OrganizationUserInfo[] = [];
  pendingRequests: UserRegistrationRequest[] = [];
  availableStudies: Study[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // UI State
  selectedUser: OrganizationUserInfo | null = null;
  showUserModal = false;
  showInviteModal = false;
  showStudyAccessModal = false;
  showRoleChangeModal = false;

  // Forms
  inviteForm!: FormGroup;
  roleChangeForm!: FormGroup;
  studyAccessForm!: FormGroup;

  // Type assertion helper to avoid Angular template type checking issues
  asAny(value: any): any {
    return value;
  }

  // Filters
  private filtersSubject = new BehaviorSubject<UserManagementFilters>({
    role: 'all',
    status: 'all',
    searchTerm: ''
  });

  // Filtered users observable
  filteredUsers$: Observable<OrganizationUserInfo[]>;

  // Available roles based on current user permissions
  availableRoles: UserRole[] = [];

  constructor() {
    // Initialize forms
    this.inviteForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      role: ['data_entry', Validators.required],
      department: [''],
      message: ['']
    });

    this.roleChangeForm = this.fb.group({
      userId: ['', Validators.required],
      newRole: ['', Validators.required],
      reason: ['', Validators.required]
    });

    this.studyAccessForm = this.fb.group({
      userId: ['', Validators.required],
      studyIds: [[]],
      accessLevel: ['read', Validators.required]
    });

    // Set up filtered users observable
    this.filteredUsers$ = combineLatest([
      this.filtersSubject.asObservable(),
      this.getOrganizationUsersObservable()
    ]).pipe(
      map(([filters, users]) => this.filterUsers(users, filters))
    );
  }

  ngOnInit(): void {
    this.initializeComponent();
  }

  private async initializeComponent(): Promise<void> {
    this.isLoading = true;
    try {
      // Get current user and organization
      this.currentUser = await this.authService.getCurrentUserProfile();
      if (!this.currentUser || !this.currentUser.organization) {
        throw new Error('User not authenticated or not associated with an organization');
      }

      // Load organization data
      this.currentOrganization = await this.orgService.getOrganization(this.currentUser.organization);
      if (!this.currentOrganization) {
        throw new Error('Organization not found');
      }

      // Set available roles based on current user permissions
      this.setAvailableRoles();

      // Load organization users and pending requests
      await Promise.all([
        this.loadOrganizationUsers(),
        this.loadPendingRequests(),
        this.loadAvailableStudies()
      ]);

    } catch (error) {
      console.error('Error initializing admin user management:', error);
      this.errorMessage = 'Failed to load user management data. Please refresh and try again.';
    } finally {
      this.isLoading = false;
    }
  }

  private setAvailableRoles(): void {
    if (!this.currentUser) return;

    // Convert AccessLevel to UserRole comparison
    const userAccessLevel = this.currentUser.accessLevel;
    
    // Superadmins can assign any role
    if (userAccessLevel === 'superadmin' as any) {
      this.availableRoles = ['data_entry', 'investigator', 'admin', 'superadmin'];
    }
    // Admins can assign roles below their level
    else if (userAccessLevel === 'admin' as any) {
      this.availableRoles = ['data_entry', 'investigator', 'admin'];
    }
    // Investigators can only invite data entry users  
    else if (userAccessLevel === 'investigator' as any) {
      this.availableRoles = ['data_entry'];
    }
    else {
      this.availableRoles = [];
    }
  }

  private async loadOrganizationUsers(): Promise<void> {
    if (!this.currentOrganization) return;
    
    try {
      this.organizationUsers = await this.orgService.getOrganizationUsers(this.currentOrganization.id);
    } catch (error) {
      console.error('Error loading organization users:', error);
    }
  }

  private async loadPendingRequests(): Promise<void> {
    if (!this.currentOrganization) return;
    
    try {
      this.pendingRequests = await this.orgService.getPendingRegistrationRequests(this.currentOrganization.id);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  }

  private async loadAvailableStudies(): Promise<void> {
    if (!this.currentOrganization) return;
    
    try {
      // Get studies that this organization has access to
      this.availableStudies = await this.studyService.getStudiesForOrganization(this.currentOrganization.id);
    } catch (error) {
      console.error('Error loading available studies:', error);
    }
  }

  private getOrganizationUsersObservable(): Observable<OrganizationUserInfo[]> {
    // Return observable that emits current users array
    return new BehaviorSubject(this.organizationUsers).asObservable();
  }

  private filterUsers(users: OrganizationUserInfo[], filters: UserManagementFilters): OrganizationUserInfo[] {
    return users.filter(user => {
      // Role filter
      if (filters.role !== 'all' && user.role !== filters.role) {
        return false;
      }

      // Status filter
      if (filters.status !== 'all' && user.status !== filters.status) {
        return false;
      }

      // Search term filter
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const email = user.email.toLowerCase();
        const department = user.department?.toLowerCase() || '';
        
        if (!fullName.includes(searchTerm) && 
            !email.includes(searchTerm) && 
            !department.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  }

  // Filter Methods
  updateFilters(updates: Partial<UserManagementFilters>): void {
    const currentFilters = this.filtersSubject.value;
    this.filtersSubject.next({ ...currentFilters, ...updates });
  }

  onRoleFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.updateFilters({ role: target.value as UserRole | 'all' });
  }

  onStatusFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.updateFilters({ status: target.value as 'active' | 'pending' | 'suspended' | 'all' });
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.updateFilters({ searchTerm: target.value });
  }

  // User Management Actions
  selectUser(user: OrganizationUserInfo): void {
    this.selectedUser = user;
    this.showUserModal = true;
  }

  async inviteUser(): Promise<void> {
    if (this.inviteForm.invalid || !this.currentOrganization) {
      this.markFormGroupTouched(this.inviteForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const formData = this.inviteForm.value;
      await this.orgService.inviteUser(this.currentOrganization.id, {
        email: formData.email,
        invitedRole: formData.role,
        assignedStudies: [],
        personalMessage: formData.message
      });

      this.successMessage = `Invitation sent to ${formData.email} successfully!`;
      this.inviteForm.reset();
      this.showInviteModal = false;
      
      // Reload pending requests
      await this.loadPendingRequests();

    } catch (error) {
      console.error('Error inviting user:', error);
      this.errorMessage = 'Failed to send invitation. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async approveRegistrationRequest(request: UserRegistrationRequest): Promise<void> {
    if (!this.currentOrganization) return;

    this.isLoading = true;
    try {
      await this.orgService.approveRegistrationRequest(this.currentOrganization.id, request.id);
      this.successMessage = `Registration request for ${request.email} approved successfully!`;
      
      // Reload data
      await Promise.all([
        this.loadOrganizationUsers(),
        this.loadPendingRequests()
      ]);

    } catch (error) {
      console.error('Error approving registration request:', error);
      this.errorMessage = 'Failed to approve registration request. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async rejectRegistrationRequest(request: UserRegistrationRequest): Promise<void> {
    if (!this.currentOrganization) return;

    this.isLoading = true;
    try {
      await this.orgService.rejectRegistrationRequest(this.currentOrganization.id, request.id);
      this.successMessage = `Registration request for ${request.email} rejected.`;
      
      // Reload pending requests
      await this.loadPendingRequests();

    } catch (error) {
      console.error('Error rejecting registration request:', error);
      this.errorMessage = 'Failed to reject registration request. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async changeUserRole(): Promise<void> {
    if (this.roleChangeForm.invalid || !this.currentOrganization) {
      this.markFormGroupTouched(this.roleChangeForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const formData = this.roleChangeForm.value;
      await this.orgService.updateUserRole(
        this.currentOrganization.id,
        formData.userId,
        formData.newRole,
        formData.reason
      );

      this.successMessage = 'User role updated successfully!';
      this.roleChangeForm.reset();
      this.showRoleChangeModal = false;
      
      // Reload organization users
      await this.loadOrganizationUsers();

    } catch (error) {
      console.error('Error changing user role:', error);
      this.errorMessage = 'Failed to update user role. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async updateStudyAccess(): Promise<void> {
    if (this.studyAccessForm.invalid || !this.currentOrganization) {
      this.markFormGroupTouched(this.studyAccessForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const formData = this.studyAccessForm.value;
      await this.orgService.updateUserStudyAccess(
        this.currentOrganization.id,
        formData.userId,
        formData.studyIds,
        formData.accessLevel
      );

      this.successMessage = 'Study access updated successfully!';
      this.studyAccessForm.reset();
      this.showStudyAccessModal = false;
      
      // Reload organization users
      await this.loadOrganizationUsers();

    } catch (error) {
      console.error('Error updating study access:', error);
      this.errorMessage = 'Failed to update study access. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async suspendUser(user: OrganizationUserInfo): Promise<void> {
    if (!this.currentOrganization) return;

    const confirmed = confirm(`Are you sure you want to suspend ${user.firstName} ${user.lastName}? They will lose access to all studies and data.`);
    if (!confirmed) return;

    this.isLoading = true;
    try {
      await this.orgService.suspendUser(this.currentOrganization.id, user.userId);
      this.successMessage = `${user.firstName} ${user.lastName} has been suspended.`;
      
      // Reload organization users
      await this.loadOrganizationUsers();

    } catch (error) {
      console.error('Error suspending user:', error);
      this.errorMessage = 'Failed to suspend user. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async reactivateUser(user: OrganizationUserInfo): Promise<void> {
    if (!this.currentOrganization) return;

    this.isLoading = true;
    try {
      await this.orgService.reactivateUser(this.currentOrganization.id, user.userId);
      this.successMessage = `${user.firstName} ${user.lastName} has been reactivated.`;
      
      // Reload organization users
      await this.loadOrganizationUsers();

    } catch (error) {
      console.error('Error reactivating user:', error);
      this.errorMessage = 'Failed to reactivate user. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  // Modal Management
  openInviteModal(): void {
    this.showInviteModal = true;
    this.inviteForm.patchValue({ role: this.availableRoles[0] || 'data_entry' });
  }

  openRoleChangeModal(user: OrganizationUserInfo): void {
    this.roleChangeForm.patchValue({
      userId: user.userId,
      newRole: user.role
    });
    this.showRoleChangeModal = true;
  }

  openStudyAccessModal(user: OrganizationUserInfo): void {
    this.studyAccessForm.patchValue({
      userId: user.userId,
      studyIds: user.studyAccess?.map(access => access.studyId) || [],
      accessLevel: user.studyAccess?.[0]?.accessLevel || 'read'
    });
    this.showStudyAccessModal = true;
  }

  closeModal(): void {
    this.showUserModal = false;
    this.showInviteModal = false;
    this.showStudyAccessModal = false;
    this.showRoleChangeModal = false;
    this.selectedUser = null;
    this.errorMessage = '';
    this.successMessage = '';
  }

  // Utility Methods
  canManageUser(user: OrganizationUserInfo): boolean {
    if (!this.currentUser) return false;
    
    // Users can't manage themselves
    if (user.userId === this.currentUser.uid) return false;
    
    const userAccessLevel = this.currentUser.accessLevel;
    
    // Superadmins can manage anyone
    if (userAccessLevel === 'superadmin' as any) return true;
    
    // Admins can manage users below their level
    if (userAccessLevel === 'admin' as any) {
      return ['data_entry', 'investigator'].includes(user.role);
    }
    
    // Investigators can only manage data entry users
    if (userAccessLevel === 'investigator' as any) {
      return user.role === 'data_entry';
    }
    
    return false;
  }

  canChangeRole(user: OrganizationUserInfo, newRole: UserRole): boolean {
    if (!this.currentUser) return false;
    
    // Check if user can be managed
    if (!this.canManageUser(user)) return false;
    
    // Check if new role is available to assign
    return this.availableRoles.includes(newRole);
  }

  getRoleDisplayName(role: UserRole): string {
    const roleNames = {
      data_entry: 'Data Entry',
      investigator: 'Investigator',
      admin: 'Administrator',
      superadmin: 'Super Administrator'
    };
    return roleNames[role] || role;
  }

  getStatusDisplayName(status: string): string {
    const statusNames: Record<string, string> = {
      active: 'Active',
      pending: 'Pending',
      suspended: 'Suspended',
      inactive: 'Inactive'
    };
    return statusNames[status] || status;
  }

  getStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
      active: 'status-active',
      pending: 'status-pending',
      suspended: 'status-suspended',
      inactive: 'status-inactive'
    };
    return statusClasses[status] || 'status-unknown';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  // Study selection handler for modal
  onStudySelectionChange(event: Event, studyId: string): void {
    const target = event.target as HTMLInputElement;
    const currentStudyIds = this.studyAccessForm.get('studyIds')?.value || [];
    
    if (target.checked) {
      // Add study ID if not already present
      if (!currentStudyIds.includes(studyId)) {
        this.studyAccessForm.patchValue({
          studyIds: [...currentStudyIds, studyId]
        });
      }
    } else {
      // Remove study ID
      this.studyAccessForm.patchValue({
        studyIds: currentStudyIds.filter((id: string) => id !== studyId)
      });
    }
  }

  // Track functions for ngFor performance
  trackUser(index: number, user: OrganizationUserInfo): string {
    return user.userId;
  }

  trackRequest(index: number, request: UserRegistrationRequest): string {
    return request.id;
  }

  trackStudy(index: number, study: Study): string {
    return study.id || `study-${index}`;
  }
}
