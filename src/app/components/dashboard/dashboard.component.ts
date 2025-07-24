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
import { UserProfile } from '../../models/user-profile.model';
import { FormTemplate, FormInstance as TemplateFormInstance, TemplateType, PhiFieldType, ValidationRule } from '../../models/form-template.model';
import { PhiEncryptionService } from '../../services/phi-encryption.service';
import { Study, StudySection, PatientStudyEnrollment, CareIndicator } from '../../models/study.model';
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormBuilderComponent, FormPreviewComponent, ProfileEditPopupComponent],
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
  
  private allTemplates: FormTemplate[] = [];
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
    this.loadPatients();
    this.setupPermissions();
    
    // Subscribe to current user profile changes
    this.userProfile$.pipe(takeUntil(this.destroy$)).subscribe(profile => {
      this.currentUserProfile = profile;
    });
    
    // Initialize template data for the enhanced modal
    this.templates$.pipe(takeUntil(this.destroy$)).subscribe(templates => {
      this.allTemplates = templates;
      this.filterTemplates();
    });
    
    // Subscribe to studies observable
    this.studies$.pipe(takeUntil(this.destroy$)).subscribe(studies => {
      this.studies = studies;
    });
    
    // Load care indicators
    this.studyService.getCareIndicators().pipe(takeUntil(this.destroy$)).subscribe(indicators => {
      this.careIndicators = indicators;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async setupPermissions(): Promise<void> {
    try {
      const userProfile = await this.authService.getCurrentUserProfile();
      this.permissions = {
        canView: userProfile?.accessLevel !== AccessLevel.DATA_ENTRY,
        canCreate: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN, AccessLevel.INVESTIGATOR].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canEdit: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN, AccessLevel.INVESTIGATOR].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canDelete: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canPublish: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userProfile?.accessLevel || AccessLevel.VIEWER)
      };
    } catch (error) {
      console.error('Error setting up permissions:', error);
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
    
    this.selectedTemplateForEdit = template;
    this.editingTemplateId = template.id;
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

  // Form instance management
  async createFormInstance(template: FormTemplate, patient: PatientListItem) {
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
  
  exportTemplate(template: FormTemplate): void {
    // TODO: Implement template export logic
    console.log('Exporting template:', template);
    alert('Template export is not yet implemented');
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
    if (!this.permissions.canCreate) {
      alert('You do not have permission to create studies');
      return;
    }
    
    // TODO: Open study creation modal
    console.log('Create new study modal would open here');
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
      this.patientTemplates = allTemplates.filter((template: FormTemplate) => template.templateType === 'patient');
      
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
    
    // Close patient template modal and open form builder for patient template
    this.closePatientTemplateModal();
    this.openFormBuilder();
    // TODO: Set form builder to patient template mode
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

  async deleteStudy(study: Study): Promise<void> {
    if (!this.permissions.canDelete) {
      alert('You do not have permission to delete studies');
      return;
    }
    
    if (confirm(`Are you sure you want to delete study "${study.title}"? This action cannot be undone.`)) {
      try {
        if (study.id) {
          await this.studyService.deleteStudy(study.id, 'Deleted by user');
          console.log('Study deleted successfully');
        }
      } catch (error) {
        console.error('Error deleting study:', error);
        alert('Failed to delete study. Please try again.');
      }
    }
  }

  async enrollPatientInStudy(study: Study): Promise<void> {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to enroll patients');
      return;
    }
    
    // TODO: Open patient enrollment modal
    console.log('Patient enrollment modal would open here for study:', study);
  }

  // Care Indicator Methods
  getCareIndicatorsForStudy(studyId: string): CareIndicator[] {
    return this.careIndicators.filter(indicator => indicator.studyId === studyId);
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

  async resolveCareIndicator(indicator: CareIndicator): Promise<void> {
    try {
      const resolutionNotes = prompt('Enter resolution notes:');
      if (resolutionNotes) {
        await this.studyService.resolveCareIndicator(indicator.id, resolutionNotes);
        console.log('Care indicator resolved successfully');
      }
    } catch (error) {
      console.error('Error resolving care indicator:', error);
      alert('Failed to resolve care indicator. Please try again.');
    }
  }

  // Study filtering and search
  get filteredStudies(): Study[] {
    let filtered = this.studies;
    
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(study => 
        study.title.toLowerCase().includes(query) ||
        study.protocolNumber.toLowerCase().includes(query) ||
        study.description?.toLowerCase().includes(query) ||
        study.phase?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }

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
}
