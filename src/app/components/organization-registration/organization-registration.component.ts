import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject } from 'rxjs';

import { OrganizationService } from '../../services/organization.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { 
  Organization, 
  OrganizationType, 
  OrganizationTier,
  UserRegistrationRequest 
} from '../../models/organization.model';
import { AccessLevel } from '../../enums/access-levels.enum';

@Component({
  selector: 'app-organization-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './organization-registration.component.html',
  styleUrl: './organization-registration.component.scss'
})
export class OrganizationRegistrationComponent implements OnInit {
  private fb = inject(FormBuilder);
  private orgService = inject(OrganizationService);
  private authService = inject(EdcCompliantAuthService);
  private router = inject(Router);

  // Form Groups
  organizationForm: FormGroup;
  verificationForm: FormGroup;
  userRegistrationForm: FormGroup;

  // Component State
  currentStep = 1;
  totalSteps = 3;
  isLoading = false;
  verifiedOrganization: Organization | null = null;
  registrationRequest: UserRegistrationRequest | null = null;

  // Form Options
  organizationTypes: { value: OrganizationType; label: string }[] = [
    { value: 'hospital', label: 'Hospital' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'research_institution', label: 'Research Institution' },
    { value: 'pharmaceutical', label: 'Pharmaceutical Company' },
    { value: 'cro', label: 'Contract Research Organization (CRO)' },
    { value: 'university', label: 'University' },
    { value: 'government', label: 'Government Agency' },
    { value: 'other', label: 'Other' }
  ];

  organizationTiers: { value: OrganizationTier; label: string; description: string }[] = [
    { 
      value: 'basic', 
      label: 'Basic', 
      description: 'Up to 10 users, 5 studies' 
    },
    { 
      value: 'professional', 
      label: 'Professional', 
      description: 'Up to 50 users, 25 studies' 
    },
    { 
      value: 'enterprise', 
      label: 'Enterprise', 
      description: 'Up to 500 users, 100 studies' 
    },
    { 
      value: 'academic', 
      label: 'Academic', 
      description: 'Up to 100 users, 50 studies (discounted)' 
    }
  ];

  accessLevels: { value: AccessLevel; label: string; description: string }[] = [
    { 
      value: AccessLevel.DATA_ENTRY, 
      label: 'Data Entry', 
      description: 'Basic form completion and data entry' 
    },
    { 
      value: AccessLevel.INVESTIGATOR, 
      label: 'Investigator', 
      description: 'Study management and patient oversight' 
    },
    { 
      value: AccessLevel.ADMIN, 
      label: 'Administrator', 
      description: 'User management and system configuration' 
    }
  ];

  // Error and Success Messages
  errorMessage = '';
  successMessage = '';

  constructor() {
    this.organizationForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      displayName: [''],
      type: ['', Validators.required],
      tier: ['basic', Validators.required],
      contactEmail: ['', [Validators.required, Validators.email]],
      contactPhone: [''],
      website: [''],
      street: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      postalCode: ['', Validators.required],
      country: ['', Validators.required],
      allowSelfRegistration: [true],
      requireAdminApproval: [true],
      requireMFA: [false]
    });

    this.verificationForm = this.fb.group({
      verificationKey: ['', [Validators.required, Validators.pattern(/^[A-Z]+-[A-Z]+-\d{4}$/)]],
      userEmail: ['', [Validators.required, Validators.email]],
      displayName: ['', Validators.required]
    });

    this.userRegistrationForm = this.fb.group({
      displayName: ['', Validators.required],
      jobTitle: [''],
      department: [''],
      requestedRole: [AccessLevel.DATA_ENTRY, Validators.required],
      supervisorEmail: ['', Validators.email],
      reasonForAccess: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    // Auto-populate user info if available
    this.authService.currentUserProfile$.subscribe(user => {
      if (user) {
        this.verificationForm.patchValue({
          userEmail: user.email,
          displayName: user.displayName
        });
        this.userRegistrationForm.patchValue({
          displayName: user.displayName
        });
      }
    });
  }

  // Step Navigation
  nextStep(): void {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep = step;
    }
  }

  // Step 1: Create Organization
  async createOrganization(): Promise<void> {
    if (this.organizationForm.invalid) {
      this.markFormGroupTouched(this.organizationForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const formData = this.organizationForm.value;
      
      const organizationData = {
        name: formData.name,
        displayName: formData.displayName || formData.name,
        type: formData.type,
        tier: formData.tier,
        contactInfo: {
          email: formData.contactEmail,
          phone: formData.contactPhone,
          website: formData.website,
          address: {
            street: formData.street,
            city: formData.city,
            state: formData.state,
            postalCode: formData.postalCode,
            country: formData.country
          }
        },
        settings: {
          allowSelfRegistration: formData.allowSelfRegistration,
          requireAdminApproval: formData.requireAdminApproval,
          maxUsers: 100, // Default value
          maxStudies: 50, // Default value
          allowedStudyTypes: ['clinical_trial', 'observational', 'registry'], // Default types
          dataRetentionDays: 2555, // 7 years default
          requireMFA: formData.requireMFA,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            maxAge: 90,
            preventReuse: 5,
            expirationDays: 90
          },
          sessionTimeout: 3600 // 1 hour in seconds
        }
      };

      const organizationId = await this.orgService.createOrganization(organizationData);
      
      this.successMessage = `Organization created successfully! Your verification key will be provided after approval.`;
      
      // Move to verification step (for demonstration - in practice, admin approval would be required first)
      setTimeout(() => {
        this.nextStep();
      }, 2000);

    } catch (error) {
      console.error('Error creating organization:', error);
      this.errorMessage = 'Failed to create organization. Please check your information and try again.';
    } finally {
      this.isLoading = false;
    }
  }

  // Step 2: Verify Organization
  async verifyOrganization(): Promise<void> {
    if (this.verificationForm.invalid) {
      this.markFormGroupTouched(this.verificationForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { verificationKey } = this.verificationForm.value;
      
      const organization = await this.orgService.verifyOrganization(verificationKey);
      
      if (!organization) {
        this.errorMessage = 'Invalid verification key. Please check the key provided by your organization administrator.';
        return;
      }

      if (organization.status !== 'active') {
        this.errorMessage = 'Organization is not currently active. Please contact your administrator.';
        return;
      }

      this.verifiedOrganization = organization;
      this.successMessage = `Successfully verified with ${organization.displayName}!`;
      
      // Auto-populate organization info in user registration
      this.userRegistrationForm.patchValue({
        displayName: this.verificationForm.value.displayName
      });

      setTimeout(() => {
        this.nextStep();
      }, 1500);

    } catch (error) {
      console.error('Error verifying organization:', error);
      this.errorMessage = 'Failed to verify organization. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  // Step 3: Complete User Registration
  async completeRegistration(): Promise<void> {
    if (this.userRegistrationForm.invalid || !this.verifiedOrganization) {
      this.markFormGroupTouched(this.userRegistrationForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const formData = this.userRegistrationForm.value;
      const currentUser = await this.authService.getCurrentUserProfile();
      
      if (!currentUser) {
        this.errorMessage = 'User authentication required. Please log in and try again.';
        return;
      }

      // Create registration request
      const registrationRequest: Partial<UserRegistrationRequest> = {
        organizationId: this.verifiedOrganization.id,
        email: currentUser.email,
        displayName: formData.displayName,
        requestedRole: formData.requestedRole,
        verificationKey: this.verificationForm.value.verificationKey,
        status: 'pending',
        requestedAt: new Date(),
        jobTitle: formData.jobTitle,
        department: formData.department,
        supervisorEmail: formData.supervisorEmail,
        reasonForAccess: formData.reasonForAccess
      };

      // In a real implementation, this would create a registration request
      // For now, we'll directly update the user profile if self-registration is allowed
      if (this.verifiedOrganization.settings.allowSelfRegistration && !this.verifiedOrganization.settings.requireAdminApproval) {
        await this.authService.updateUserProfile(currentUser.uid, {
          organization: this.verifiedOrganization.id,
          accessLevel: formData.requestedRole,
          displayName: formData.displayName
        });
        
        this.successMessage = 'Registration completed successfully! You now have access to your organization.';
        
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 2000);
      } else {
        this.successMessage = 'Registration request submitted successfully! An administrator will review your request and notify you via email.';
        
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      }

    } catch (error) {
      console.error('Error completing registration:', error);
      this.errorMessage = 'Failed to complete registration. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  // Form Validation Helpers
  isFieldInvalid(formGroup: FormGroup, fieldName: string): boolean {
    const field = formGroup.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(formGroup: FormGroup, fieldName: string): string {
    const field = formGroup.get(fieldName);
    if (field && field.errors && (field.dirty || field.touched)) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['email']) return 'Please enter a valid email address';
      if (field.errors['minlength']) return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
      if (field.errors['pattern']) return 'Invalid format (expected: WORD-WORD-0000)';
    }
    return '';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  // UI Helper Methods
  get canGoToStep2(): boolean {
    return this.organizationForm.valid || this.verifiedOrganization !== null;
  }

  get canGoToStep3(): boolean {
    return this.verifiedOrganization !== null;
  }

  get stepProgress(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  // Reset and Navigation
  resetForm(): void {
    this.currentStep = 1;
    this.organizationForm.reset();
    this.verificationForm.reset();
    this.userRegistrationForm.reset();
    this.verifiedOrganization = null;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelRegistration(): void {
    if (confirm('Are you sure you want to cancel the registration process? All entered data will be lost.')) {
      this.router.navigate(['/login']);
    }
  }
}
