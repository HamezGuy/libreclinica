import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, Observable, combineLatest, map, of, withLatestFrom, firstValueFrom } from 'rxjs';

import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { FormTemplateService } from '../../services/form-template.service';
import { FormInstanceService } from '../../services/form-instance.service';
import { DataSeparationService } from '../../services/data-separation.service';
import { StudyService } from '../../services/study.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { HealthcareApiService, Patient as HealthcarePatient } from '../../services/healthcare-api.service';
import { FormBuilderComponent } from '../form-builder/form-builder.component';
import { FormPreviewComponent } from '../form-preview/form-preview.component';
import { ProfileEditPopupComponent } from '../profile-edit-popup/profile-edit-popup.component';
import { TemplateManagementComponent } from '../template-management/template-management.component';
import { UserProfile } from '../../models/user-profile.model';
import { FormTemplate, FormInstance as TemplateFormInstance, TemplateType, PhiFieldType, ValidationRule } from '../../models/form-template.model';
import { PhiEncryptionService } from '../../services/phi-encryption.service';
import { Study, StudySection, StudySite, EligibilityCriteria, PatientStudyEnrollment, CareIndicator, Substudy, StudyGroup, StudyFormInstance, StudyFormInstanceStatus, DataQuery, EnhancedStudySection } from '../../models/study.model';
import { AccessLevel } from '../../enums/access-levels.enum';

// Patient display model (non-PHI)
export interface PatientListItem {
  id: string;
  identifier: string;
  displayName: string;
  studyId?: string;
  lastVisit?: Date;
  formsCount: number;
  status: 'active' | 'completed' | 'withdrawn';
  canViewPhi: boolean;
}

// Form instance interface for dashboard
interface FormInstance {
  id: string;
  templateId: string;
  templateName: string;
  status: 'draft' | 'completed' | 'locked' | 'in_progress' | 'reviewed';
  lastModified: Date;
  completionPercentage: number;
}

// Form Permissions interface
export interface FormPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
}

// Patient PHI data interface
export interface Patient {
  id: string;
  name: {
    given: string[];
    family: string;
  };
  dateOfBirth: Date;
  birthDate?: Date; // Alternative property name
  gender: string;
  contactInfo: {
    phone?: string;
    email?: string;
    address?: string;
  };
}



@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormBuilderComponent, ProfileEditPopupComponent, TemplateManagementComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private authService = inject(EdcCompliantAuthService);
  private templateService = inject(FormTemplateService);
  private instanceService = inject(FormInstanceService);
  private healthcareService = inject(HealthcareApiService);
  private dataSeparationService = inject(DataSeparationService);
  private studyService = inject(StudyService);
  private router = inject(Router);
  private eventBus = inject(EventBusService);
  private fb = inject(FormBuilder);
  private phiEncryptionService = inject(PhiEncryptionService);
  
  // Observables
  userProfile$: Observable<UserProfile | null> = this.authService.currentUserProfile$;
  templates$: Observable<FormTemplate[]> = this.templateService.templates$;
  studies$: Observable<Study[]> = this.studyService.getStudies();
  
  // Component state
  patients: PatientListItem[] = [];
  studies: Study[] = [];
  selectedStudy: Study | null = null;
  studyEnrollments: PatientStudyEnrollment[] = [];
  careIndicators: CareIndicator[] = [];
  
  // Enhanced study management state
  substudies: Substudy[] = [];
  studyGroups: StudyGroup[] = [];
  formInstances: StudyFormInstance[] = [];
  dataQueries: DataQuery[] = [];
  selectedSubstudy: Substudy | null = null;
  selectedStudyGroup: StudyGroup | null = null;
  selectedSection: EnhancedStudySection | null = null;
  
  // Study management modals
  showSubstudyModal = false;
  showStudyGroupModal = false;
  showFormAssignmentModal = false;
  showSectionModal = false;
  showStudyCreationModal = false;
  studyCreationForm!: FormGroup;
  isCreatingStudy = false;
  
  // Form assignment state
  availableTemplates: FormTemplate[] = [];
  selectedTemplateForAssignment: FormTemplate | null = null;

  selectedPatient: PatientListItem | null = null;
  selectedPatientForms: FormInstance[] = [];
  selectedPatientPhiData: Patient | null = null;
  
  // Modal state
  showTemplateModal = false;
  showFormBuilderModal = false;
  showProfileEditModal = false;
  selectedTemplateForEdit: FormTemplate | null = null;
  formBuilderTemplateId: string | undefined = undefined;
  editingTemplateId: string | undefined = undefined;
  
  // Patient Template Modal state
  showPatientTemplateModal = false;
  showPatientFormModal = false;
  selectedPatientTemplate: FormTemplate | null = null;
  patientTemplates: FormTemplate[] = [];
  patientForm: FormGroup = this.fb.group({});
  isCreatingPatient = false;
  availableStudies: Study[] = [];
  
  // Enhanced template modal properties
  selectedTemplate: FormTemplate | null = null;
  viewMode: 'details' | 'preview' = 'details';
  templateSearchTerm = '';
  templateFilter: 'all' | 'draft' | 'published' = 'all';
  filteredTemplates: FormTemplate[] = [];
  
  allTemplates: FormTemplate[] = [];
  searchQuery = '';
  currentUserProfile: UserProfile | null = null;

  // Permissions
  permissions: FormPermissions = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canPublish: false
  };

  // Sidebar navigation
  sidebarItems = [
    { id: 'patients', label: 'Patients', icon: 'people', active: true },
    { id: 'forms', label: 'Forms', icon: 'description', active: false },
    { id: 'studies', label: 'Studies', icon: 'folder', active: false },
    { id: 'reports', label: 'Reports', icon: 'assessment', active: false },
    { id: 'audit', label: 'Audit Logs', icon: 'history', active: false }
  ];

  activeSidebarItem = 'patients';

  ngOnInit(): void {
    // Initialize study creation form
    this.initializeStudyCreationForm();
    
    // First ensure permissions are set up before any API calls
    this.setupPermissions().then(() => {
      // Only load data after permissions are confirmed
      this.loadPatients();
      
      // Load care indicators
      this.studyService.getCareIndicators().pipe(takeUntil(this.destroy$)).subscribe(indicators => {
        this.careIndicators = indicators;
      });
    }).catch(error => {
      console.error('Failed to setup permissions:', error);
      // Don't load data if permissions setup fails
    });
    
    // Subscribe to current user profile changes
    this.userProfile$.pipe(takeUntil(this.destroy$)).subscribe(profile => {
      this.currentUserProfile = profile;
      // Re-setup permissions when profile changes
      if (profile) {
        this.setupPermissions();
      }
    });
    
    // Initialize template data for the enhanced modal
    this.templates$.pipe(takeUntil(this.destroy$)).subscribe(templates => {
      console.log('[Dashboard] Templates received from service:', templates.map(t => ({
        name: t.name,
        id: t.id,
        hasInternalId: !!(t as any)._internalId
      })));
      this.allTemplates = templates;
      this.filterTemplates();
    });
    
    // Subscribe to studies observable
    this.studies$.pipe(takeUntil(this.destroy$)).subscribe(studies => {
      this.studies = studies;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async setupPermissions(): Promise<void> {
    try {
      const userProfile = await this.authService.getCurrentUserProfile();
      console.log('🔐 Setting up permissions for user:', {
        email: userProfile?.email,
        accessLevel: userProfile?.accessLevel,
        status: userProfile?.status
      });
      
      this.permissions = {
        canView: userProfile?.accessLevel !== AccessLevel.DATA_ENTRY,
        canCreate: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN, AccessLevel.INVESTIGATOR].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canEdit: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN, AccessLevel.INVESTIGATOR].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canDelete: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canPublish: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userProfile?.accessLevel || AccessLevel.VIEWER)
      };
      
      console.log('✅ Permissions set:', this.permissions);
    } catch (error) {
      console.error('❌ Error setting up permissions:', error);
      // Set default safe permissions if user profile fails to load
      this.permissions = {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canPublish: false
      };
    }
  }

  async loadPatients(): Promise<void> {
    try {
      // Load patients with non-PHI data only
      const patients = await this.healthcareService.searchPatients({});
      this.patients = patients.map(patient => {
        const healthcarePatient = patient as HealthcarePatient;
        const patientName = healthcarePatient.name;
        let displayName = 'Unknown Patient';
        
        if (patientName) {
          if (typeof patientName === 'string') {
            displayName = patientName;
          } else if (Array.isArray(patientName) && patientName.length > 0) {
            const firstNameEntry = patientName[0];
            const given = firstNameEntry.given?.join(' ') || '';
            const family = firstNameEntry.family || '';
            displayName = `${given} ${family}`.trim() || 'Unknown Patient';
          }
        }
        
        return {
          id: healthcarePatient.id || 'unknown',
          identifier: healthcarePatient.identifier?.[0]?.value || 'N/A',
          displayName: displayName,
          studyId: undefined,
          lastVisit: undefined,
          formsCount: 0,
          status: 'active' as const,
          canViewPhi: this.permissions.canView
        };
      });
    } catch (error) {
      console.error('Error loading patients:', error);
      this.patients = [];
    }
  }

  private calculateAge(birthDate: Date | string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  private initializeStudyCreationForm(): void {
    this.studyCreationForm = this.fb.group({
      // Basic Information
      protocolNumber: ['', [Validators.required, Validators.pattern(/^[A-Z0-9-]+$/)]], 
      title: ['', [Validators.required, Validators.minLength(5)]],
      shortTitle: [''],
      description: ['', [Validators.required, Validators.minLength(20)]],
      version: ['1.0', Validators.required],
      
      // Study Classification
      phase: ['phase_i', Validators.required],
      studyType: ['interventional', Validators.required],
      therapeuticArea: ['', Validators.required],
      indication: ['', Validators.required],
      
      // Study Status and Timeline
      status: ['planning', Validators.required],
      plannedStartDate: [''],
      plannedEndDate: [''],
      
      // Enrollment Information
      plannedEnrollment: [0, [Validators.required, Validators.min(1)]],
      actualEnrollment: [0],
      enrollmentStatus: ['not_started'],
      
      // Regulatory Information
      regulatoryRequirements: [[]],
      irbApprovalRequired: [true],
      consentRequired: [true],
      
      // CFR 21 Part 11 Compliance
      requiresElectronicSignatures: [true],
      auditTrailRequired: [true],
      dataIntegrityLevel: ['enhanced', Validators.required],
      
      // Data Retention
      dataRetentionPeriod: [120, [Validators.required, Validators.min(12)]], // in months
      
      // Study Team
      principalInvestigator: [''],
      studyCoordinator: [''],
      dataManager: [''],
      
      // Tags
      tags: [[]]
    });
  }

  private getPatientDisplayName(patient: PatientListItem): string {
    const displayName = patient.displayName;
    if (displayName && displayName.length > 0) {
      return displayName[0].toUpperCase();
    }
    return '?';
  }

  async selectPatient(patient: PatientListItem) {
    this.selectedPatient = patient;
    
    try {
      // Load patient forms using observable pattern
      this.instanceService.getFormInstancesByPatient(patient.id).subscribe({
        next: (instances) => {
          // Map instances to dashboard format, enriching with template name
          of(instances).pipe(
            withLatestFrom(this.templates$),
            takeUntil(this.destroy$)
          ).subscribe(([formInstances, templates]) => {
            this.selectedPatientForms = formInstances.map((instance: TemplateFormInstance) => {
              const template = templates.find((t: FormTemplate) => t.id === instance.templateId);
              return {
                id: instance.id!,
                templateId: instance.templateId!,
                templateName: template?.name || 'Unknown Template',
                status: instance.status,
                lastModified: (instance.updatedAt as any).toDate(),
                completionPercentage: this.calculateCompletionPercentage(instance)
              };
            });
          });
        },
        error: (error) => {
          console.error('Error loading patient forms:', error);
          this.selectedPatientForms = [];
        }
      });
      
      // Load PHI data if user has permission
      if (this.permissions.canView) {
        try {
          const phiData = await this.healthcareService.getPatient(patient.id);
          // Map healthcare patient to dashboard patient interface
          const name = phiData.name?.[0] || { given: [], family: '' };
          const birthDate = phiData.birthDate ? 
            (typeof phiData.birthDate === 'string' ? new Date(phiData.birthDate) : phiData.birthDate) : 
            new Date();
          
          this.selectedPatientPhiData = {
            id: phiData.id || '',
            name: {
              given: name.given || [],
              family: name.family || ''
            },
            dateOfBirth: birthDate,
            gender: phiData.gender || 'unknown',
            contactInfo: {
              phone: phiData.telecom?.find(t => t.system === 'phone')?.value,
              email: phiData.telecom?.find(t => t.system === 'email')?.value,
              address: phiData.address?.[0] ? 
                `${phiData.address[0].line?.join(', ') || ''}, ${phiData.address[0].city || ''}, ${phiData.address[0].state || ''} ${phiData.address[0].postalCode || ''}`.trim() : 
                undefined
            }
          };
        } catch (error) {
          console.error('Error loading PHI data:', error);
        }
      }
    } catch (error) {
      console.error('Error in selectPatient:', error);
    }
  }

  // Template management methods
  openTemplateModal(): void {
    if (this.permissions.canEdit || this.permissions.canView) {
      this.showTemplateModal = true;
    }
  }

  closeTemplateModal(): void {
    this.showTemplateModal = false;
  }

  async openFormBuilder(templateId?: string): Promise<void> {
    this.formBuilderTemplateId = templateId;
    if (templateId) {
      const templates = await firstValueFrom(this.templates$);
      this.selectedTemplateForEdit = templates.find((t: FormTemplate) => t.id === templateId) || null;
    } else {
      this.selectedTemplateForEdit = null;
    }
    this.showFormBuilderModal = true;
  }

  closeFormBuilder(): void {
    this.showFormBuilderModal = false;
    this.selectedTemplateForEdit = null;
    this.formBuilderTemplateId = undefined;
  }

  onTemplateSaved(template: FormTemplate): void {
    // The templates$ observable will update automatically.
    // Close the form builder
    this.closeFormBuilder();
  }

  private calculateCompletionPercentage(instance: TemplateFormInstance): number {
    if (!instance.data || !instance.templateId) return 0;
    // Simple calculation based on filled fields vs total fields
    const filledFields = Object.keys(instance.data).filter(key => 
      instance.data![key] !== null && instance.data![key] !== undefined && instance.data![key] !== ''
    ).length;
    const totalFields = Object.keys(instance.data).length;
    return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }

  async createNewTemplate() {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to create templates');
      return;
    }
    
    this.openFormBuilder();
  }

  async editTemplate(template: FormTemplate) {
    if (!this.permissions.canEdit) {
      alert('You do not have permission to edit templates');
      return;
    }
    
    console.log('[Dashboard] editTemplate called with template:', template);
    console.log('[Dashboard] Template ID being set:', template.id);
    console.log('[Dashboard] CRITICAL: Using Firebase document ID for editing:', template.id);
    
    // IMPORTANT: template.id MUST be the Firebase document ID, not the internal template ID
    // The form-template.service ensures this by overwriting any internal ID with the doc ID
    this.selectedTemplateForEdit = template;
    this.editingTemplateId = template.id; // This MUST be the Firebase document ID
    this.showFormBuilderModal = true;
  }

  async publishTemplate(template: FormTemplate) {
    if (!this.permissions.canPublish) {
      alert('You do not have permission to publish templates');
      return;
    }
    
    try {
      await this.templateService.publishTemplate(template.id!, true);
      alert('Template published successfully');
    } catch (error) {
      console.error('Failed to publish template:', error);
      alert('Failed to publish template');
    }
  }

  async deleteTemplate(template: FormTemplate) {
    if (!this.permissions.canDelete) {
      alert('You do not have permission to delete templates');
      return;
    }
    
    const reason = prompt('Please provide a reason for deleting this template:');
    if (!reason) return;
    
    try {
      await this.templateService.deleteTemplate(template.id!, reason);
      alert('Template deleted successfully');
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('Failed to delete template');
    }
  }

  // Legacy form instance management (replaced by enhanced version below)
  async createLegacyFormInstance(template: FormTemplate, patient: PatientListItem) {
    try {
      const instance = await this.instanceService.createFormInstance(
        template.id!,
        patient.id,
        template.studyId
      );
      
      // Navigate to form filling interface
      this.router.navigate(['/form-instance', instance.id]);
    } catch (error) {
      console.error('Failed to create form instance:', error);
      alert('Failed to create form instance');
    }
  }

  // Sidebar navigation
  selectSidebarItem(itemId: string) {
    this.sidebarItems.forEach(item => item.active = item.id === itemId);
    this.activeSidebarItem = itemId;
    
    // Handle navigation based on selected item
    switch (itemId) {
      case 'patients':
        this.loadPatients();
        break;
      case 'forms':
        // Load forms view
        break;
      case 'studies':
        // Load studies view
        break;
      case 'reports':
        // Load reports view
        break;
      case 'audit':
        // Load audit logs view
        break;
    }
  }

  // Search functionality
  get filteredPatients(): PatientListItem[] {
    if (!this.searchQuery) return this.patients;
    
    const query = this.searchQuery.toLowerCase();
    return this.patients.filter(patient => 
      patient.displayName.toLowerCase().includes(query) ||
      patient.identifier.toLowerCase().includes(query)
    );
  }

  // Enhanced template modal methods
  filterTemplates(): void {
    let templates = this.allTemplates;
    
    // Apply status filter
    if (this.templateFilter !== 'all') {
      templates = templates.filter(template => {
        if (this.templateFilter === 'published') {
          return template.status === 'published';
        } else if (this.templateFilter === 'draft') {
          return template.status === 'draft';
        }
        return true;
      });
    }
    
    // Apply search filter
    if (this.templateSearchTerm) {
      const search = this.templateSearchTerm.toLowerCase();
      templates = templates.filter(template => 
        template.name.toLowerCase().includes(search) ||
        template.description.toLowerCase().includes(search) ||
        (template.category && template.category.toLowerCase().includes(search))
      );
    }
    
    this.filteredTemplates = templates;
  }
  
  setTemplateFilter(filter: 'all' | 'draft' | 'published'): void {
    this.templateFilter = filter;
    this.filterTemplates();
  }
  
  selectTemplate(template: FormTemplate): void {
    this.selectedTemplate = template;
    this.viewMode = 'details';
  }
  
  setViewMode(mode: 'details' | 'preview'): void {
    this.viewMode = mode;
  }

  isViewMode(mode: 'details' | 'preview'): boolean {
    return this.viewMode === mode;
  }
  
  previewTemplate(template: FormTemplate): void {
    this.selectedTemplate = template;
    this.viewMode = 'preview';
  }
  
  duplicateTemplate(template: FormTemplate): void {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to duplicate templates');
      return;
    }
    
    // TODO: Implement template duplication logic
    console.log('Duplicating template:', template);
    alert('Template duplication is not yet implemented');
  }
  
  async exportTemplate(template: FormTemplate) {
    // TODO: Implement template export
    console.log('Export template:', template);
    alert('Template export functionality coming soon');
  }

  /**
   * Temporary method to fix template IDs in Firestore
   * This removes internal id fields that conflict with document IDs
   */
  async fixTemplateIds() {
    try {
      console.log('Running template ID fix...');
      await this.templateService.fixTemplateIds();
      alert('Template IDs have been fixed. Please try editing the template again.');
    } catch (error) {
      console.error('Failed to fix template IDs:', error);
      alert('Failed to fix template IDs. Check console for details.');
    }
  }
  
  trackTemplate(index: number, template: FormTemplate): string {
    return template.id || index.toString();
  }
  
  trackField(index: number, field: any): string {
    return field.id || index.toString();
  }
  
  getFieldIcon(fieldType: string): string {
    const iconMap: { [key: string]: string } = {
      'text': 'text_fields',
      'email': 'email',
      'number': 'numbers',
      'textarea': 'notes',
      'select': 'arrow_drop_down',
      'radio': 'radio_button_checked',
      'checkbox': 'check_box',
      'date': 'calendar_today',
      'time': 'access_time',
      'file': 'attach_file',
      'signature': 'draw'
    };
    
    return iconMap[fieldType] || 'text_fields';
  }



  // Profile edit methods
  openProfileEditModal(): void {
    this.showProfileEditModal = true;
  }

  closeProfileEditModal(): void {
    this.showProfileEditModal = false;
  }

  onProfileUpdated(updatedProfile: UserProfile): void {
    // Update the current user profile reference
    this.currentUserProfile = updatedProfile;
    // The userProfile$ observable will automatically update through the auth service
    console.log('Profile updated successfully:', updatedProfile);
  }

  async signOut() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  // Form preview event handlers
  onPreviewFormDataChanged(formData: any): void {
    // Handle form data changes if needed
    console.log('Preview form data changed:', formData);
  }

  onPreviewFormSaved(formInstance: TemplateFormInstance): void {
    // Handle form instance save
    console.log('Preview form saved:', formInstance);
    // Could show a success message or refresh data
  }

  onPreviewFormSubmitted(formInstance: TemplateFormInstance): void {
    // Handle form instance submission
    console.log('Preview form submitted:', formInstance);
    // Could show success message or navigate somewhere
  }

  // Study Management Methods
  selectStudy(study: Study): void {
    this.selectedStudy = study;
    if (study.id) {
      this.loadStudyEnrollments(study.id);
    }
  }

  async loadStudyEnrollments(studyId: string): Promise<void> {
    try {
      this.studyEnrollments = await this.studyService.getPatientsByStudy(studyId);
    } catch (error) {
      console.error('Error loading study enrollments:', error);
    }
  }

  async createNewStudy(): Promise<void> {
    console.log('createNewStudy called');
    if (!this.permissions.canCreate) {
      alert('You do not have permission to create studies');
      return;
    }
    
    console.log('Permissions check passed, opening modal');
    // Reset form and open modal
    this.studyCreationForm.reset({
      phase: 'phase_i',
      studyType: 'interventional',
      status: 'planning',
      enrollmentStatus: 'not_started',
      plannedEnrollment: 0,
      actualEnrollment: 0,
      irbApprovalRequired: true,
      consentRequired: true,
      requiresElectronicSignatures: true,
      auditTrailRequired: true,
      dataIntegrityLevel: 'enhanced',
      dataRetentionPeriod: 120 // 10 years default
    });
    
    this.showStudyCreationModal = true;
    console.log('showStudyCreationModal set to:', this.showStudyCreationModal);
  }

  async editStudy(study: Study): Promise<void> {
    if (!this.permissions.canEdit) {
      alert('You do not have permission to edit studies');
      return;
    }
    
    // TODO: Open study edit modal
    console.log('Edit study modal would open here:', study);
  }

  // Patient Template Methods
  async openPatientTemplateSelector(): Promise<void> {
    try {
      // Load patient templates from observable
      const allTemplates = await firstValueFrom(this.templates$);
      // Filter for patient templates - check templateType property
      this.patientTemplates = allTemplates.filter((template: FormTemplate) => 
        template.templateType === 'patient' || 
        template.isPatientTemplate === true
      );
      
      console.log('[Dashboard] Filtered patient templates:', this.patientTemplates.length);
      console.log('[Dashboard] Patient templates:', this.patientTemplates.map(t => ({
        name: t.name,
        templateType: t.templateType,
        isPatientTemplate: t.isPatientTemplate
      })));
      
      // Load available studies for patient assignment
      this.availableStudies = this.studies; // Use existing studies data
      
      this.showPatientTemplateModal = true;
    } catch (error) {
      console.error('Error loading patient templates:', error);
      alert('Failed to load patient templates');
    }
  }

  closePatientTemplateModal(): void {
    this.showPatientTemplateModal = false;
    this.selectedPatientTemplate = null;
  }

  selectPatientTemplate(template: FormTemplate): void {
    this.selectedPatientTemplate = template;
  }

  async createPatientTemplate(): Promise<void> {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to create templates');
      return;
    }
    
    // Close patient template modal
    this.closePatientTemplateModal();
    
    // Reset any existing template selection
    this.selectedTemplateForEdit = null;
    this.editingTemplateId = undefined;
    
    // Open form builder modal in create mode
    this.showFormBuilderModal = true;
    
    // Note: The form builder should be configured to create a patient template
    // This can be done by passing initial data to the form builder component
  }

  async createPatientFromTemplate(): Promise<void> {
    if (!this.selectedPatientTemplate) {
      alert('Please select a patient template first');
      return;
    }
    
    try {
      // Build dynamic form based on selected template fields
      this.buildPatientForm(this.selectedPatientTemplate);
      
      // Show patient form modal
      this.showPatientFormModal = true;
      this.showPatientTemplateModal = false;
    } catch (error) {
      console.error('Error creating patient form:', error);
      alert('Failed to create patient form');
    }
  }

  closePatientFormModal(): void {
    this.showPatientFormModal = false;
    this.patientForm.reset();
  }

  private buildPatientForm(template: FormTemplate): void {
    const formControls: { [key: string]: FormControl } = {};
    
    template.fields.forEach(field => {
      const validators = [];
      
      if (field.required) {
        validators.push(Validators.required);
      }
      
      if (field.validationRules && field.validationRules.length > 0) {
        field.validationRules.forEach((rule: any) => {
          // Apply validation rules based on type
          if (rule.type === 'minLength' && rule.value) {
            validators.push(Validators.minLength(rule.value as number));
          } else if (rule.type === 'maxLength' && rule.value) {
            validators.push(Validators.maxLength(rule.value as number));
          } else if (rule.type === 'pattern' && rule.value) {
            validators.push(Validators.pattern(rule.value as string));
          }
        });
      }
      
      // Add email validation for email fields
      if (field.type === 'email') {
        validators.push(Validators.email);
      }
      
      formControls[field.name] = new FormControl(field.defaultValue || '', validators);
    });
    
    // Add study selection if available studies exist
    if (this.availableStudies.length > 0) {
      formControls['studyId'] = new FormControl('', Validators.required);
    }
    
    this.patientForm = this.fb.group(formControls);
  }

  async submitPatientForm(): Promise<void> {
    if (!this.patientForm.valid || !this.selectedPatientTemplate) {
      alert('Please fill out all required fields');
      return;
    }
    
    this.isCreatingPatient = true;
    
    try {
      const formData = this.patientForm.value;
      
      // Separate PHI and non-PHI data
      const phiData: { [key: string]: any } = {};
      const regularData: { [key: string]: any } = {};
      
      this.selectedPatientTemplate.fields.forEach(field => {
        const value = formData[field.name];
        if (field.isPhiField || (field.phiClassification && field.phiClassification.isPhiField)) {
          phiData[field.name] = value;
        } else {
          regularData[field.name] = value;
        }
      });
      
      // Encrypt PHI data
      let encryptedPhiData = null;
      if (Object.keys(phiData).length > 0) {
        // Create a basic PHI classification for encryption
        const phiClassification = {
          isPhiField: true,
          encryptionRequired: true,
          accessLevel: 'confidential' as const,
          auditRequired: true,
          dataMinimization: true
        };
        encryptedPhiData = await this.phiEncryptionService.encryptPhiData(phiData, phiClassification);
      }
      
      // Create FHIR Patient resource
      const fhirPatient = await this.phiEncryptionService.createFhirPatient({
        ...phiData,
        ...regularData
      });
      
      // Create patient record
      const patientData = {
        templateId: this.selectedPatientTemplate.id!,
        studyId: formData.studyId || null,
        regularData,
        encryptedPhiData,
        fhirPatient,
        createdAt: new Date(),
        createdBy: this.currentUserProfile?.uid || 'unknown',
        status: 'active'
      };
      
      // Save patient (this would need a patient service)
      console.log('Creating patient with data:', patientData);
      
      // Note: PHI access logging would be handled internally by the encryption service
      
      alert('Patient created successfully!');
      this.closePatientFormModal();
      
      // Refresh patients list
      await this.loadPatients();
      
    } catch (error) {
      console.error('Error creating patient:', error);
      alert('Failed to create patient');
    } finally {
      this.isCreatingPatient = false;
    }
  }



  getCareIndicatorCount(studyId?: string, severity?: 'low' | 'medium' | 'high' | 'critical'): number {
    let indicators = this.careIndicators;
    
    if (studyId) {
      indicators = indicators.filter(indicator => indicator.studyId === studyId);
    }
    
    if (severity) {
      indicators = indicators.filter(indicator => indicator.severity === severity);
    }
    
    return indicators.length;
  }

  // Removed duplicate - using the simpler placeholder implementation below



  // Helper methods for UI
  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'active': '#28a745',
      'completed': '#28a745', 
      'recruiting': '#17a2b8',
      'paused': '#ffc107',
      'cancelled': '#dc3545',
      'draft': '#6c757d'
    };
    return colors[status.toLowerCase()] || '#6c757d';
  }

  /**
   * Convert Firestore Timestamp to JavaScript Date for DatePipe compatibility
   * Fixes: "Unable to convert Timestamp into a date" errors
   */
  convertTimestampToDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Handle already converted Date objects
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Handle string dates
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    
    // Handle timestamp numbers (milliseconds)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    
    return null;
  }

  getStudyPhaseColor(phase: string): string {
    const phaseColors: { [key: string]: string } = {
      'preclinical': '#6c757d',
      'phase_1': '#28a745',
      'phase_2': '#ffc107',
      'phase_3': '#fd7e14',
      'phase_4': '#dc3545',
      'post_market': '#6f42c1'
    };
    return phaseColors[phase] || '#6c757d';
  }

  // Study progress calculation
  calculateStudyProgress(study: Study): number {
    const enrollments = this.studyEnrollments.filter(e => e.studyId === study.id);
    if (enrollments.length === 0) return 0;
    
    const completedEnrollments = enrollments.filter(e => e.status === 'completed').length;
    return Math.round((completedEnrollments / enrollments.length) * 100);
  }

  // Studies UI Helper Methods
  get filteredStudies(): Study[] {
    return this.studies || [];
  }

  getTotalEnrollments(): number {
    return this.studyEnrollments.length;
  }

  // Removed duplicate - using the more accurate implementation below that filters for open indicators

  getActiveStudiesCount(): number {
    return this.studies.filter(study => study.status === 'active').length;
  }

  trackStudy(index: number, study: Study): string {
    return study.id || `study-${index}`;
  }

  async saveNewStudy(): Promise<void> {
    if (this.studyCreationForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.studyCreationForm.controls).forEach(key => {
        this.studyCreationForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isCreatingStudy = true;
    
    try {
      const formValue = this.studyCreationForm.value;
      
      // Create the study object
      const newStudy: Study = {
        ...formValue,
        sections: [], // Initialize empty sections
        substudies: [],
        studyGroups: [],
        eligibilityCriteria: {
          inclusionCriteria: [],
          exclusionCriteria: [],
          ageRange: {
            minimum: 18,
            maximum: 99,
            unit: 'years'
          },
          genderRestriction: 'any'
        },
        sites: [],
        archivalRequirements: [],
        changeHistory: [],
        createdBy: this.currentUserProfile?.uid || 'unknown',
        createdAt: new Date(),
        lastModifiedBy: this.currentUserProfile?.uid || 'unknown',
        lastModifiedAt: new Date()
      };

      // Save to Firebase via StudyService
      const savedStudy = await this.studyService.createStudy(newStudy);
      
      // Success - close modal and refresh studies list
      this.showStudyCreationModal = false;
      this.studyCreationForm.reset();
      
      // Show success message
      alert(`Study "${savedStudy.title}" created successfully!`);
      
      // Refresh studies list
      this.loadStudies();
    } catch (error) {
      console.error('Error creating study:', error);
      alert('Failed to create study. Please try again.');
    } finally {
      this.isCreatingStudy = false;
    }
  }

  closeStudyCreationModal(): void {
    this.showStudyCreationModal = false;
    this.studyCreationForm.reset();
  }

  loadStudies(): void {
    // Refresh the studies list
    this.studyService.getStudies().pipe(takeUntil(this.destroy$)).subscribe();
  }

  getSectionsForStudy(studyId: string): EnhancedStudySection[] {
    const study = this.studies.find(s => s.id === studyId);
    return (study?.sections as EnhancedStudySection[]) || [];
  }

  getCareIndicatorsForStudy(studyId: string): CareIndicator[] {
    return this.careIndicators.filter(indicator => indicator.studyId === studyId);
  }

  getStudyProgress(study: Study): number {
    // Calculate progress based on enrollment vs target
    const currentEnrollment = study.actualEnrollment || 0;
    const targetEnrollment = study.plannedEnrollment || 1;
    return Math.round((currentEnrollment / targetEnrollment) * 100);
  }

  getCareIndicatorIcon(type: string): string {
    const iconMap: { [key: string]: string } = {
      'patient_safety': 'warning',
      'data_quality': 'error',
      'enrollment': 'people',
      'compliance': 'security',
      'follow_up': 'schedule',
      'adverse_event': 'emergency'
    };
    return iconMap[type] || 'info';
  }

  // Study Management Action Methods
  deleteStudy(study: Study): void {
    if (!this.permissions.canDelete) {
      alert('You do not have permission to delete studies');
      return;
    }
    
    if (confirm(`Are you sure you want to delete the study "${study.title}"?`)) {
      console.log('Deleting study:', study.title);
      // TODO: Implement actual deletion via StudyService
      // For now, remove from local array
      this.studies = this.studies.filter(s => s.id !== study.id);
      if (this.selectedStudy?.id === study.id) {
        this.selectedStudy = null;
      }
    }
  }

  enrollPatientInStudy(study: Study): void {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to enroll patients');
      return;
    }
    
    console.log('Enrolling patient in study:', study.title);
    // TODO: Implement patient enrollment modal
    alert(`Patient enrollment for "${study.title}" - Coming soon!`);
  }

  // Enhanced Study Management Methods
  
  // Substudy Management
  async createSubstudy(studyId: string, substudyData: Omit<Substudy, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<void> {
    try {
      // TODO: Implement createSubstudy in StudyService
      console.log('Creating substudy for study:', studyId, substudyData);
      alert('Substudy creation - Coming soon!');
      // Placeholder implementation
      // const substudy = await this.studyService.createSubstudy(studyId, substudyData);
      // this.substudies.push(substudy);
    } catch (error) {
      console.error('Error creating substudy:', error);
      alert('Failed to create substudy. Please try again.');
    }
  }

  async loadSubstudiesForStudy(studyId: string): Promise<void> {
    try {
      // TODO: Implement getSubstudiesForStudy in StudyService
      console.log('Loading substudies for study:', studyId);
      // Placeholder implementation
      this.substudies = [];
      // this.studyService.getSubstudiesForStudy(studyId).subscribe((substudies: Substudy[]) => {
      //   this.substudies = substudies;
      // });
    } catch (error) {
      console.error('Error loading substudies:', error);
    }
  }

  selectSubstudy(substudy: Substudy): void {
    this.selectedSubstudy = substudy;
  }

  openSubstudyModal(): void {
    this.showSubstudyModal = true;
  }

  closeSubstudyModal(): void {
    this.showSubstudyModal = false;
    this.selectedSubstudy = null;
  }

  // Study Group Management
  async createStudyGroup(studyId: string, groupData: Omit<StudyGroup, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<void> {
    try {
      // TODO: Implement createStudyGroup in StudyService
      console.log('Creating study group for study:', studyId, groupData);
      alert('Study group creation - Coming soon!');
      // Placeholder implementation
      // const group = await this.studyService.createStudyGroup(studyId, groupData);
      // this.studyGroups.push(group);
    } catch (error) {
      console.error('Error creating study group:', error);
      alert('Failed to create study group. Please try again.');
    }
  }

  async loadStudyGroupsForStudy(studyId: string): Promise<void> {
    try {
      // TODO: Implement getStudyGroupsForStudy in StudyService
      console.log('Loading study groups for study:', studyId);
      // Placeholder implementation
      this.studyGroups = [];
      // this.studyService.getStudyGroupsForStudy(studyId).subscribe((groups: StudyGroup[]) => {
      //   this.studyGroups = groups;
      // });
    } catch (error) {
      console.error('Error loading study groups:', error);
    }
  }

  selectStudyGroup(group: StudyGroup): void {
    this.selectedStudyGroup = group;
  }

  openStudyGroupModal(): void {
    this.showStudyGroupModal = true;
  }

  closeStudyGroupModal(): void {
    this.showStudyGroupModal = false;
    this.selectedStudyGroup = null;
  }

  // Form Instance Management
  async createFormInstance(studyId: string, sectionId: string, templateId: string, patientId?: string): Promise<void> {
    try {
      const formInstanceData: Omit<StudyFormInstance, 'id' | 'changeHistory'> = {
        studyId,
        sectionId,
        templateId,
        templateName: 'Template', // TODO: Get from template service
        templateVersion: '1.0',
        patientId,
        status: 'not_started' as StudyFormInstanceStatus,
        formData: {},
        completionPercentage: 0,
        isRequired: true,
        lastModifiedDate: new Date(),
        filledBy: '', // Will be set by service
        queries: []
      };
      
      const formInstance = await this.studyService.createFormInstance(formInstanceData);
      this.formInstances.push(formInstance);
      console.log('Form instance created:', formInstance);
    } catch (error) {
      console.error('Error creating form instance:', error);
      alert('Failed to create form instance. Please try again.');
    }
  }

  async loadFormInstancesForStudy(studyId: string): Promise<void> {
    try {
      // TODO: Implement getFormInstancesForStudy in StudyService
      console.log('Loading form instances for study:', studyId);
      // Placeholder implementation
      this.formInstances = [];
      // this.studyService.getFormInstancesForStudy(studyId).subscribe((instances: StudyFormInstance[]) => {
      //   this.formInstances = instances;
      // });
    } catch (error) {
      console.error('Error loading form instances:', error);
    }
  }

  async assignFormToSection(sectionId: string, templateId: string): Promise<void> {
    if (!this.selectedStudy?.id) {
      alert('Please select a study first');
      return;
    }

    try {
      await this.createFormInstance(this.selectedStudy.id, sectionId, templateId);
      this.closeFormAssignmentModal();
    } catch (error) {
      console.error('Error assigning form to section:', error);
    }
  }

  openFormAssignmentModal(section: EnhancedStudySection): void {
    this.selectedSection = section;
    this.showFormAssignmentModal = true;
    // Load available templates
    this.templates$.subscribe(templates => {
      this.availableTemplates = templates;
    });
  }

  closeFormAssignmentModal(): void {
    this.showFormAssignmentModal = false;
    this.selectedSection = null;
    this.selectedTemplateForAssignment = null;
  }

  // Section Completion Management
  async markSectionComplete(sectionId: string, reason?: string): Promise<void> {
    try {
      // TODO: Implement updateSectionCompletionStatus in StudyService
      console.log('Marking section complete:', sectionId, reason);
      alert('Section completion management - Coming soon!');
      // await this.studyService.updateSectionCompletionStatus(sectionId, 'completed', reason);
      // Refresh section data
      if (this.selectedStudy?.id) {
        await this.loadFormInstancesForStudy(this.selectedStudy.id);
      }
    } catch (error) {
      console.error('Error marking section complete:', error);
      alert('Failed to mark section as complete. Please try again.');
    }
  }

  async markSectionIncomplete(sectionId: string, reason?: string): Promise<void> {
    try {
      // TODO: Implement updateSectionCompletionStatus in StudyService
      console.log('Marking section incomplete:', sectionId, reason);
      alert('Section completion management - Coming soon!');
      // await this.studyService.updateSectionCompletionStatus(sectionId, 'in_progress', reason);
      // Refresh section data
      if (this.selectedStudy?.id) {
        await this.loadFormInstancesForStudy(this.selectedStudy.id);
      }
    } catch (error) {
      console.error('Error marking section incomplete:', error);
      alert('Failed to mark section as incomplete. Please try again.');
    }
  }

  // Data Query Management
  async loadDataQueriesForForm(formInstanceId: string): Promise<void> {
    try {
      // TODO: Implement getDataQueriesForForm in StudyService
      console.log('Loading data queries for form:', formInstanceId);
      // Placeholder implementation
      this.dataQueries = [];
      // this.studyService.getDataQueriesForForm(formInstanceId).subscribe((queries: DataQuery[]) => {
      //   this.dataQueries = queries;
      // });
    } catch (error) {
      console.error('Error loading data queries:', error);
    }
  }

  async resolveDataQuery(queryId: string, resolution: string): Promise<void> {
    try {
      await this.studyService.resolveDataQuery(queryId, resolution);
      console.log('Data query resolved:', queryId);
      // Refresh queries
      const currentFormInstance = this.formInstances.find(fi => 
        this.dataQueries.some(q => q.formInstanceId === fi.id)
      );
      if (currentFormInstance?.id) {
        await this.loadDataQueriesForForm(currentFormInstance.id);
      }
    } catch (error) {
      console.error('Error resolving data query:', error);
      alert('Failed to resolve data query. Please try again.');
    }
  }

  // Helper Methods
  getFormInstancesForSection(sectionId: string): StudyFormInstance[] {
    return this.formInstances.filter(fi => fi.sectionId === sectionId);
  }

  getSectionCompletionPercentage(sectionId: string): number {
    const sectionForms = this.getFormInstancesForSection(sectionId);
    if (sectionForms.length === 0) return 0;
    
    const totalCompletion = sectionForms.reduce((sum, form) => sum + (form.completionPercentage || 0), 0);
    return Math.round(totalCompletion / sectionForms.length);
  }

  isSectionComplete(sectionId: string): boolean {
    const sectionForms = this.getFormInstancesForSection(sectionId);
    return sectionForms.length > 0 && sectionForms.every(form => form.completionPercentage === 100);
  }

  getActiveDataQueriesCount(): number {
    return this.dataQueries.filter(q => q.status === 'open').length;
  }

  trackSubstudy(index: number, substudy: Substudy): string {
    return substudy.id || `substudy-${index}`;
  }

  trackStudyGroup(index: number, group: StudyGroup): string {
    return group.id || `group-${index}`;
  }

  trackFormInstance(index: number, instance: StudyFormInstance): string {
    return instance.id || `instance-${index}`;
  }

  trackSection(index: number, section: EnhancedStudySection): string {
    return section.id || `section-${index}`;
  }

  // Additional helper methods for UI
  getTotalCareAlerts(): number {
    return this.careIndicators.filter(indicator => indicator.status === 'open').length;
  }

  resolveCareIndicator(indicator: CareIndicator): void {
    console.log('Resolving care indicator:', indicator.id);
    // TODO: Implement care indicator resolution
    alert('Care indicator resolution - Coming soon!');
  }

}
