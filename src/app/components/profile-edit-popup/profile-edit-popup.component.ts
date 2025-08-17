import { Component, EventEmitter, Input, Output, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfile } from '../../models/user-profile.model';
import { AccessLevel, UserStatus, ComplianceRegion } from '../../enums/access-levels.enum';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { LanguageService, Language } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-profile-edit-popup',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './profile-edit-popup.component.html',
  styleUrls: ['./profile-edit-popup.component.scss']
})
export class ProfileEditPopupComponent implements OnInit {
  @Input() userProfile: UserProfile | null = null;
  @Input() isVisible = false;
  @Output() closePopup = new EventEmitter<void>();
  @Output() profileUpdated = new EventEmitter<UserProfile>();

  private authService = inject(EdcCompliantAuthService);
  private languageService = inject(LanguageService);

  // Form model
  profileForm: {
    displayName: string;
    username: string;
    email: string;
    phoneNumber: string;
    organization: string;
    title: string;
    accessLevel: AccessLevel;
    status: UserStatus;
    complianceRegion: ComplianceRegion;
    language: string;
  } = {
    displayName: '',
    username: '',
    email: '',
    phoneNumber: '',
    organization: '',
    title: '',
    accessLevel: AccessLevel.VIEWER,
    status: UserStatus.ACTIVE,
    complianceRegion: ComplianceRegion.GLOBAL,
    language: 'en'
  };

  // Enum references for template
  AccessLevel = AccessLevel;
  UserStatus = UserStatus;
  ComplianceRegion = ComplianceRegion;

  // Get enum keys for dropdowns
  accessLevelOptions = Object.values(AccessLevel);
  userStatusOptions = Object.values(UserStatus);
  complianceRegionOptions = Object.values(ComplianceRegion);
  
  // Language options
  availableLanguages: Language[] = [];
  currentLanguage: Language | null = null;

  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    // Load available languages
    this.availableLanguages = this.languageService.getLanguages();
    this.currentLanguage = this.languageService.getCurrentLanguage();
    
    if (this.userProfile) {
      this.populateForm();
    }
  }

  ngOnChanges(): void {
    if (this.userProfile && this.isVisible) {
      this.populateForm();
    }
  }

  private populateForm(): void {
    if (!this.userProfile) return;

    this.profileForm = {
      displayName: this.userProfile.displayName || '',
      username: this.userProfile.username || '',
      email: this.userProfile.email || '',
      language: this.currentLanguage?.code || 'en',
      phoneNumber: this.userProfile.phoneNumber || '',
      organization: this.userProfile.organization || '',
      title: this.userProfile.title || '',
      accessLevel: this.userProfile.accessLevel || AccessLevel.VIEWER,
      status: this.userProfile.status || UserStatus.ACTIVE,
      complianceRegion: this.userProfile.complianceRegion || ComplianceRegion.GLOBAL
    };
  }

  async onSave(): Promise<void> {
    if (!this.userProfile) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Create update object with only changed fields
      const updates: Partial<UserProfile> = {};
      
      if (this.profileForm.displayName !== this.userProfile.displayName) {
        updates.displayName = this.profileForm.displayName;
      }
      if (this.profileForm.username !== this.userProfile.username) {
        updates.username = this.profileForm.username;
      }
      if (this.profileForm.phoneNumber !== (this.userProfile.phoneNumber || '')) {
        updates.phoneNumber = this.profileForm.phoneNumber;
      }
      if (this.profileForm.organization !== (this.userProfile.organization || '')) {
        updates.organization = this.profileForm.organization;
      }
      if (this.profileForm.title !== (this.userProfile.title || '')) {
        updates.title = this.profileForm.title;
      }
      if (this.profileForm.accessLevel !== this.userProfile.accessLevel) {
        updates.accessLevel = this.profileForm.accessLevel;
        // Update permissions based on new access level
        updates.permissions = this.authService.getDefaultPermissions(this.profileForm.accessLevel);
      }
      if (this.profileForm.status !== this.userProfile.status) {
        updates.status = this.profileForm.status;
      }
      if (this.profileForm.complianceRegion !== this.userProfile.complianceRegion) {
        updates.complianceRegion = this.profileForm.complianceRegion;
      }
      
      // Check if language changed
      if (this.profileForm.language !== this.currentLanguage?.code) {
        // Set the new language (this will handle the UI update)
        this.languageService.setLanguage(this.profileForm.language);
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        await this.authService.updateUserProfile(this.userProfile.uid, updates);
        
        // Emit updated profile
        const updatedProfile = { ...this.userProfile, ...updates };
        this.profileUpdated.emit(updatedProfile);
      }

      this.onClose();
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      this.errorMessage = error.message || 'Failed to update profile. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  onClose(): void {
    this.errorMessage = '';
    this.closePopup.emit();
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }

  // Helper method to get display name for enum values
  getAccessLevelDisplayName(level: AccessLevel): string {
    switch (level) {
      case AccessLevel.SUPER_ADMIN: return 'Super Admin';
      case AccessLevel.ADMIN: return 'Admin';
      case AccessLevel.INVESTIGATOR: return 'Investigator';
      case AccessLevel.MONITOR: return 'Monitor';
      case AccessLevel.DATA_ENTRY: return 'Data Entry';
      case AccessLevel.VIEWER: return 'Viewer';
      default: return level;
    }
  }

  getUserStatusDisplayName(status: UserStatus): string {
    switch (status) {
      case UserStatus.ACTIVE: return 'Active';
      case UserStatus.INACTIVE: return 'Inactive';
      case UserStatus.SUSPENDED: return 'Suspended';
      case UserStatus.PENDING_APPROVAL: return 'Pending Approval';
      default: return status;
    }
  }

  getComplianceRegionDisplayName(region: ComplianceRegion): string {
    switch (region) {
      case ComplianceRegion.INDIA: return 'India';
      case ComplianceRegion.GLOBAL: return 'Global';
      default: return region;
    }
  }
}
