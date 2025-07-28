import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { OrganizationService } from '../../services/organization.service';
import { Organization } from '../../models/organization.model';

@Component({
  selector: 'app-authentication',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './authentication.component.html',
  styleUrls: ['./authentication.component.scss']
})
export class AuthenticationComponent implements OnInit {
  isLoading = false;
  errorMessage: string | null = null;
  loginForm!: FormGroup;
  registerForm!: FormGroup;
  hidePassword = true;
  activeTab: 'login' | 'register' = 'login';
  availableOrganizations: Organization[] = [];

  constructor(
    private authService: EdcCompliantAuthService,
    private router: Router,
    private fb: FormBuilder,
    private organizationService: OrganizationService
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']);
      }
    });

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });

    this.registerForm = this.fb.group({
      displayName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      organizationId: ['', [Validators.required]],
      accessLevel: ['', [Validators.required]]
    });
    
    // Load available organizations
    this.loadOrganizations();
  }

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    try {
      await this.authService.signInWithGoogle();
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during sign-in.';
      console.error('Google Sign-In failed:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async signInWithEmail(): Promise<void> {
    if (this.loginForm.invalid) {
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    try {
      const { email, password } = this.loginForm.value;
      await this.authService.loginWithCredentials({ email, password });
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during sign-in.';
      console.error('Email Sign-In failed:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async registerWithEmail(): Promise<void> {
    if (this.registerForm.invalid) {
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    try {
      const { displayName, email, password, organizationId, accessLevel } = this.registerForm.value;
      await this.authService.register({ 
        displayName, 
        email, 
        password,
        organization: organizationId,
        role: accessLevel
      });
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during registration.';
      console.error('Registration failed:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadOrganizations(): Promise<void> {
    try {
      // First ensure default test organization exists
      await this.organizationService.ensureDefaultTestOrganization();
      
      // Then load available organizations
      this.availableOrganizations = await this.organizationService.getAvailableOrganizations();
      
      // If there's only one organization (our test org), auto-select it
      if (this.availableOrganizations.length === 1) {
        this.registerForm.patchValue({ organizationId: this.availableOrganizations[0].id });
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
      // Create a fallback test organization if none exist
      this.availableOrganizations = [{
        id: 'test-org-default',
        name: 'test-organization',
        displayName: 'Test Research Organization',
        type: 'research_institution',
        tier: 'enterprise',
        status: 'active',
        verificationKey: 'TEST-ORG-2024',
        adminKey: 'ADMIN-TEST-2024',
        contactInfo: {
          email: 'admin@test-org.com',
          phone: '+1-555-0123',
          website: 'https://test-org.example.com',
          address: {
            street: '123 Research Blvd',
            city: 'Test City',
            state: 'TC',
            postalCode: '12345',
            country: 'USA'
          }
        },
        settings: {
          allowSelfRegistration: true,
          requireAdminApproval: false,
          maxUsers: 1000,
          maxStudies: 100,
          allowedStudyTypes: ['interventional', 'observational'],
          dataRetentionDays: 2555,
          requireMFA: false,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false,
            expirationDays: 0,
            preventReuse: 3
          },
          sessionTimeout: 3600
        },
        studyAccess: {
          defaultStudyAccess: 'ADMIN' as any,
          studyRestrictions: [],
          allowCrossStudyAccess: true
        },
        compliance: {
          hipaaCompliant: true,
          gdprCompliant: true,
          cfr21Part11: true,
          iso27001: false,
          customCertifications: ['HIPAA', '21 CFR Part 11', 'GDPR']
        },
        admins: [],
        superAdmins: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system',
        auditTrail: [],
        metadata: {
          description: 'Default test organization for development and testing',
          tags: ['test', 'development'],
          customFields: {}
        }
      } as Organization];
      this.registerForm.patchValue({ organizationId: this.availableOrganizations[0].id });
    }
  }
}
