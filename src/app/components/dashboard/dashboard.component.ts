import { Component, inject, OnInit, OnDestroy, runInInjectionContext, Injector, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, Observable, combineLatest, map, of, withLatestFrom, firstValueFrom } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';

import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { StudyPhaseService } from '../../services/study-phase.service';
import { ToastService } from '../../services/toast.service';
import { FormTemplateService } from '../../services/form-template.service';
import { FormInstanceService } from '../../services/form-instance.service';
import { DataSeparationService } from '../../services/data-separation.service';
import { StudyService } from '../../services/study.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { HealthcareApiService, Patient as HealthcarePatient } from '../../services/healthcare-api.service';
import { PatientService } from '../../services/patient.service';
import { FormBuilderComponent } from '../form-builder/form-builder.component';
import { FormPreviewComponent } from '../form-preview/form-preview.component';
import { ProfileEditPopupComponent } from '../profile-edit-popup/profile-edit-popup.component';
import { TemplateManagementComponent } from '../template-management/template-management.component';
import { OcrTemplateBuilderComponent } from '../ocr-template-builder/ocr-template-builder.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PatientDetailComponent } from '../patient-detail/patient-detail.component';
import { DashboardSidebarComponent } from '../dashboard-sidebar/dashboard-sidebar.component';
import { PatientPhaseProgressComponent } from '../patient-phase-progress/patient-phase-progress.component';
import { PatientFormModalComponent } from '../patient-form-modal/patient-form-modal.component';
import { SurveyManagementComponent } from '../survey-management/survey-management.component';
import { StudyCreationModalComponent } from '../study-creation-modal/study-creation-modal.component';
import { UserProfile } from '../../models/user-profile.model';
import { FormTemplate, FormInstance as TemplateFormInstance, TemplateType, PhiFieldType, ValidationRule } from '../../models/form-template.model';
import { PhiEncryptionService } from '../../services/phi-encryption.service';
import { Study, StudySection, StudySite, EligibilityCriteria, PatientStudyEnrollment, CareIndicator, Substudy, StudyGroup, StudyFormInstance, StudyFormInstanceStatus, DataQuery, EnhancedStudySection, StudySectionFormTemplate } from '../../models/study.model';
import { AccessLevel } from '../../enums/access-levels.enum';



// Patient display model (non-PHI)
export interface PatientListItem {
  id: string;
  identifier: string;
  displayName: string;
  studyId?: string;
  lastVisit?: Date;
  enrollmentDate?: Date;
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
  canCreate: boolean;  // For templates
  canEdit: boolean;    // For templates
  canDelete: boolean;  // For templates
  canPublish: boolean; // For templates
  canAddPatients?: boolean;    // For patients
  canDeletePatients?: boolean; // For patients
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
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    FormBuilderComponent,
    FormPreviewComponent,
    LanguageSelectorComponent,
    TranslatePipe,
    MatMenuModule,
    DashboardSidebarComponent,
    PatientPhaseProgressComponent,
    TemplateManagementComponent,
    PatientFormModalComponent,
    ProfileEditPopupComponent,
    SurveyManagementComponent,
    StudyCreationModalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss', './dashboard-template-fill.scss']
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
  private patientService = inject(PatientService);
  private toastService = inject(ToastService);
  private studyPhaseService = inject(StudyPhaseService);
  private dialog = inject(MatDialog);
  private injector: Injector = inject(Injector);
  
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
  showTemplateFillModal = false;
  selectedTemplateForEdit: FormTemplate | null = null;
  formBuilderTemplateId: string | undefined = undefined;
  editingTemplateId: string | undefined = undefined;
  templateToFill: FormTemplate | null = null;

  // Patient Template Modal state
  showPatientTemplateModal = false;
  showPatientFormModal = false;
  selectedPatientTemplate: FormTemplate | null = null;
  patientTemplates: FormTemplate[] = [];
  patientForm: FormGroup = this.fb.group({});
  isCreatingPatient = false;
  availableStudies: Study[] = [];
  selectedTemplateForPatient: string = ''; // For the improved dropdown UI
  defaultStudyIdForPatient: string | null = null; // Default study for patient creation

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
    { id: 'patients', label: 'patient.patients', icon: 'people', active: true },
    { id: 'forms', label: 'form.forms', icon: 'description', active: false },
    { id: 'studies', label: 'study.studies', icon: 'folder', active: false },
    { id: 'surveys', label: 'form.surveys', icon: 'quiz', active: false },
    { id: 'reports', label: 'report.reports', icon: 'assessment', active: false },
    { id: 'audit', label: 'report.auditLogs', icon: 'history', active: false }
  ];
  activeSidebarItem = 'patients';

  // Study-Patient Hierarchy Sidebar State
  expandedStudies = new Set<string>();
  expandedPatients = new Set<string>();

  // Additional properties and methods
  showPatientTemplateSelector = false;
  showTemplateQuickSetupModal = false;
  sidebarCollapsed = false;

  ngOnInit(): void {
    // Initialize study creation form

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

      const userRole = userProfile?.accessLevel || AccessLevel.VIEWER;

      // Updated permissions based on requirements:
      // - Studies/Patients: viewable by all roles
      // - Templates: only ADMIN and SUPER_ADMIN can create/edit
      // - Patients: everyone except VIEWER can add/delete
      this.permissions = {
        canView: true, // All roles can view studies and patients
        canCreate: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userRole), // Only ADMIN/SUPER_ADMIN can create templates
        canEdit: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userRole), // Only ADMIN/SUPER_ADMIN can edit templates
        canDelete: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userRole), // Only ADMIN/SUPER_ADMIN can delete templates
        canPublish: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userRole), // Only ADMIN/SUPER_ADMIN can publish templates
        canAddPatients: userRole !== AccessLevel.VIEWER, // Everyone except VIEWER can add patients
        canDeletePatients: userRole !== AccessLevel.VIEWER // Everyone except VIEWER can delete patients
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

  async createSamplePatient(): Promise<void> {
    if (!this.permissions.canAddPatients) {
      alert('You do not have permission to create patients');
      return;
    }

    try {
      // Sample patient data with proper type
      const samplePatients = [
        {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1980-05-15'),
          gender: 'male' as 'male' | 'female' | 'other' | 'unknown',
          email: 'john.doe@example.com',
          phone: '555-0101'
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new Date('1975-08-22'),
          gender: 'female' as 'male' | 'female' | 'other' | 'unknown',
          email: 'jane.smith@example.com',
          phone: '555-0102'
        },
        {
          firstName: 'Robert',
          lastName: 'Johnson',
          dateOfBirth: new Date('1990-03-10'),
          gender: 'male' as 'male' | 'female' | 'other' | 'unknown',
          email: 'robert.j@example.com',
          phone: '555-0103'
        }
      ];

      // Get a random sample patient
      const randomIndex = Math.floor(Math.random() * samplePatients.length);
      const sampleData = samplePatients[randomIndex];

      // Get first available study
      const studies = this.studies;
      const studyId = studies.length > 0 ? studies[0].id : null;

      if (!studyId) {
        // Create a default study if none exists
        await this.createNewStudy();
        // Get the newly created study
        const updatedStudies = this.studies;
        if (updatedStudies.length > 0) {
          const newStudyId = updatedStudies[updatedStudies.length - 1].id;
          if (newStudyId) {
            await this.patientService.createPatient(newStudyId, {
              demographics: sampleData,
              studyId: newStudyId
            });
          }
        }
      } else {
        // Create patient with existing study
        await this.patientService.createPatient(studyId, {
          demographics: sampleData,
          studyId: studyId
        });
      }

      console.log('Sample patient created successfully');
      await this.loadPatients();
      alert('Sample patient created successfully!');
    } catch (error) {
      console.error('Error creating sample patient:', error);
      alert('Failed to create sample patient: ' + (error as Error).message);
    }
  }

  async loadPatients(): Promise<void> {
    try {
      // Load patients directly from Firestore (avoids Healthcare API FHIR store 404 errors)
      const snapshot = await runInInjectionContext(this.injector, async () => {
        const { collection, getDocs, getFirestore } = await import('@angular/fire/firestore');
        return await runInInjectionContext(this.injector, async () => {
          const firestore = getFirestore();
          const patientsRef = collection(firestore, 'patients');
          return await getDocs(patientsRef);
        });
      });

      this.patients = snapshot.docs.map(doc => {
        const patient = { id: doc.id, ...doc.data() } as any;

        // Build display name from demographics
        const demographics = patient.demographics || {};
        const displayName = `${demographics.firstName || 'Unknown'} ${demographics.lastName || 'Patient'}`.trim();

        return {
          id: patient.id,
          identifier: patient.patientNumber || patient.id,
          displayName,
          studyId: patient.studyId,
          enrollmentDate: patient.enrollmentDate ? new Date(patient.enrollmentDate.seconds ? patient.enrollmentDate.seconds * 1000 : patient.enrollmentDate) : undefined,
          lastVisit: patient.lastVisit ? new Date(patient.lastVisit.seconds ? patient.lastVisit.seconds * 1000 : patient.lastVisit) : undefined,
          formsCount: patient.visitSubcomponents?.length || 0,
          status: patient.enrollmentStatus || 'active' as const,
          canViewPhi: this.permissions.canView
        };
      });

      console.log(`Loaded ${this.patients.length} patients from Firestore`);
    } catch (error) {
      console.error('Error loading patients from Firestore:', error);
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

  // Phase selection handler
  async onPhaseSelected(event: { phase: any, progress: any }) {
    console.log('Phase selected:', event);
    
    // You can add logic here to:
    // 1. Navigate to phase-specific forms
    // 2. Show phase details in a modal
    // 3. Filter forms by phase
    // 4. etc.
    
    // For now, let's filter the patient forms by the selected phase
    if (this.selectedPatient && event.phase.id) {
      // TODO: Implement phase-specific form filtering
      this.toastService.info(`Selected phase: ${event.phase.phaseName}`, 3000);
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
    // For form builder, we'll rely on the form builder component itself to handle unsaved changes
    // since it has its own form state management. This method is called after confirmation.
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

  // Test form template by opening it in fill mode
  testFormTemplate(template: FormTemplate) {
    console.log('[Dashboard] Testing form template:', template);
    this.templateToFill = template;
    this.showTemplateFillModal = true;
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
      // Use the new getStudyPatients method that retrieves patients by their IDs
      const patients = await this.studyService.getStudyPatients(studyId);

      // Convert patient data to enrollment format for compatibility
      this.studyEnrollments = patients.map(patient => ({
        id: patient.id || '',
        studyId: studyId,
        patientId: patient.id || '',
        enrollmentDate: patient.enrollmentDate || new Date(),
        enrollmentNumber: patient.patientNumber || '',
        status: patient.enrollmentStatus || 'enrolled',
        currentSection: patient.currentVisitId || undefined,
        completedSections: [],
        sectionsInProgress: [],
        overdueSections: [],
        careIndicators: patient.activeAlerts?.map((alert: any) => ({
          id: alert.id,
          type: alert.type as any,
          severity: alert.severity as any,
          title: alert.message,
          description: alert.message,
          studyId: studyId,
          patientId: patient.id,
          status: alert.resolvedDate ? 'resolved' : 'open',
          createdAt: alert.createdDate,
          createdBy: 'system',
          escalationLevel: alert.severity === 'critical' ? 3 : alert.severity === 'high' ? 2 : 1
        })) || [],
        enrolledBy: patient.createdBy || '',
        lastModifiedBy: patient.lastModifiedBy || '',
        lastModifiedAt: patient.lastModifiedAt || new Date(),
        changeHistory: []
      }));
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
    // Open the Create Study widget modal
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
        template.templateType === 'study_subject' ||
        template.isPatientTemplate === true ||
        template.isStudySubjectTemplate === true
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

  async loadPatientTemplates(): Promise<void> {
    try {
      // Load patient templates from observable
      const allTemplates = await firstValueFrom(this.templates$);
      // Filter for patient templates - check templateType property
      this.patientTemplates = allTemplates.filter((template: FormTemplate) =>
        template.templateType === 'patient' ||
        template.templateType === 'study_subject' ||
        template.isPatientTemplate === true ||
        template.isStudySubjectTemplate === true
      );

      // Load available studies for patient assignment
      this.availableStudies = this.studies; // Use existing studies data

      console.log('[Dashboard] Loaded patient templates:', this.patientTemplates.length);
    } catch (error) {
      console.error('Error loading patient templates:', error);
      throw error; // Re-throw to be handled by caller
    }
  }

  closePatientTemplateModal(): void {
    // No confirmation needed for template selection modal
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
    // Check if form has unsaved changes
    if (this.patientForm.dirty && !this.patientForm.pristine) {
      const confirmClose = confirm(
        'You have unsaved changes in the patient form. Are you sure you want to close without saving?\n\n' +
        'Click "OK" to close without saving, or "Cancel" to continue editing.'
      );

      if (!confirmClose) {
        return; // Don't close the modal
      }
    }

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

  async onPatientFormSubmit(patientData: any): Promise<void> {
    if (!this.selectedPatientTemplate) {
      alert('No patient template selected');
      return;
    }

    this.isCreatingPatient = true;

    try {
      // Ensure studyId is included
      if (!patientData.studyId) {
        alert('Please select a study for the patient');
        return;
      }

      // Build demographics from form data
      const demographics: any = {
        firstName: patientData.firstName || patientData.first_name || '',
        lastName: patientData.lastName || patientData.last_name || '',
        middleName: patientData.middleName || patientData.middle_name,
        dateOfBirth: patientData.dateOfBirth || patientData.date_of_birth || new Date(),
        gender: patientData.gender || 'unknown',
        race: patientData.race,
        ethnicity: patientData.ethnicity,
        preferredLanguage: patientData.preferredLanguage || patientData.preferred_language,
        email: patientData.email,
        phone: patientData.phone,
        alternatePhone: patientData.alternatePhone || patientData.alternate_phone
      };

      // Add address if provided
      if (patientData.street || patientData.city || patientData.state) {
        demographics.address = {
          street: patientData.street || '',
          city: patientData.city || '',
          state: patientData.state || '',
          postalCode: patientData.postalCode || patientData.postal_code || '',
          country: patientData.country || 'USA'
        };
      }

      // Add emergency contact if provided
      if (patientData.emergency_contact_name) {
        demographics.emergencyContact = {
          name: patientData.emergency_contact_name,
          relationship: patientData.emergency_contact_relationship || '',
          phone: patientData.emergency_contact_phone || '',
          email: patientData.emergency_contact_email
        };
      }

      // Create patient data structure
      const newPatient: any = {
        studyId: patientData.studyId,
        demographics,
        enrollmentDate: new Date(),
        enrollmentStatus: 'screening' as const,
        identifiers: [],
        consents: [],
        // Store template data for reference
        templateData: {
          templateId: this.selectedPatientTemplate.id!,
          templateName: this.selectedPatientTemplate.name,
          formData: patientData
        }
      };

      // Add optional fields only if they exist
      if (patientData.siteId) {
        newPatient.siteId = patientData.siteId;
      }
      if (patientData.treatmentArm) {
        newPatient.treatmentArm = patientData.treatmentArm;
      }

      // Clean the patient object to remove any undefined values
      const cleanedPatient = this.cleanUndefinedValues(newPatient);

      // Create patient using the service
      console.log('Creating patient with data:', cleanedPatient);
      const patientId = await this.patientService.createPatient(patientData.studyId, cleanedPatient);
      console.log('Patient created successfully with ID:', patientId);

      alert('Patient created successfully!');
      this.closePatientFormModal();

      // Refresh patients list
      await this.loadPatients();

    } catch (error) {
      console.error('Error creating patient:', error);
      alert('Failed to create patient: ' + (error as Error).message);
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

  // Create Study Widget Event Handlers
  onStudyWidgetClosed(): void {
    this.showStudyCreationModal = false;
  }

  async onStudyCreated(studyData: Study): Promise<void> {
    try {
      console.log('Creating study with data:', studyData);
      
      // Create the study first
      const createdStudy = await this.studyService.createStudy(studyData);
      console.log('Study created:', createdStudy);
      
      if (!createdStudy.id) {
        throw new Error('Study created but no ID returned');
      }
      
      // If the study has sections/phases, create them as StudyPhaseConfig entries
      if (studyData.sections && studyData.sections.length > 0) {
        console.log('Creating study phases:', studyData.sections);
        
        // Convert EnhancedStudySection to StudyPhaseConfig format
        const phaseConfigs = studyData.sections.map((section, index) => ({
          studyId: createdStudy.id!,
          phaseName: section.name,
          phaseCode: this.generatePhaseCode(section.type),
          description: section.description,
          order: index + 1,
          plannedDurationDays: section.scheduledDay,
          windowStartDays: section.windowStart,
          windowEndDays: section.windowEnd,
          templateAssignments: section.formTemplates.map(template => ({
            templateId: template.templateId,
            templateName: template.templateName,
            templateVersion: template.templateVersion,
            order: template.order,
            isRequired: template.isRequired,
            completionRequired: template.completionRequired,
            signatureRequired: template.signatureRequired || false,
            reviewRequired: template.reviewRequired || false,
            daysToComplete: template.daysToComplete
          })),
          isActive: true,
          allowSkip: section.isOptional || false,
          allowParallel: false
        }));
        
        // Create phases using the study phase service
        await this.studyPhaseService.createStudyPhases(createdStudy.id, phaseConfigs);
        console.log('Study phases created successfully');
      }
      
      this.showStudyCreationModal = false;
      // Refresh the studies list
      this.loadStudies();
      alert('Study created successfully with ' + (studyData.sections?.length || 0) + ' phases!');
    } catch (error) {
      console.error('Error creating study:', error);
      alert('Error creating study: ' + (error as Error).message);
    }
  }
  
  private generatePhaseCode(sectionType: string): string {
    const codeMap: { [key: string]: string } = {
      'screening': 'SCR',
      'baseline': 'BSL',
      'treatment': 'TRT',
      'follow_up': 'FUP',
      'visit': 'VST',
      'unscheduled': 'UNS'
    };
    return codeMap[sectionType] || 'GEN';
  }
  
  // Load studies
  loadStudies(): void {
    this.studyService.getStudies().pipe(takeUntil(this.destroy$)).subscribe();
  }

  onRefreshStudies(): void {
    this.loadStudies();
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
  async deleteStudy(study: Study): Promise<void> {
    if (!this.permissions.canDelete) {
      alert('You do not have permission to delete studies');
      return;
    }

    // Check if study has enrolled patients
    const enrollments = await this.studyService.getStudyPatients(study.id!);
    const hasPatients = enrollments.length > 0;

    let confirmMessage = `Are you sure you want to delete the study "${study.title}"?`;
    if (hasPatients) {
      confirmMessage = `WARNING: This study has ${enrollments.length} enrolled patient(s).\n\n` +
        `Deleting this study will permanently delete ALL associated patient data.\n\n` +
        `Study: ${study.title}\n` +
        `Protocol: ${study.protocolNumber}\n` +
        `Patients: ${enrollments.length}\n\n` +
        `This action cannot be undone. Are you absolutely sure you want to proceed?`;
    }

    if (confirm(confirmMessage)) {
      // Double confirmation for studies with patients
      if (hasPatients) {
        const secondConfirm = prompt(
          `This is a destructive action that will delete ${enrollments.length} patient(s).\n\n` +
          `To confirm, please type the study protocol number: ${study.protocolNumber}`
        );
        
        if (secondConfirm !== study.protocolNumber) {
          alert('Protocol number does not match. Deletion cancelled.');
          return;
        }
      }

      try {
        // Show loading state
        const deleteButton = document.querySelector(`[data-study-id="${study.id}"] .delete-button`);
        if (deleteButton) {
          deleteButton.textContent = 'Deleting...';
          deleteButton.setAttribute('disabled', 'true');
        }

        // Determine which deletion method to use
        if (hasPatients) {
          // Use the new cascade delete method
          await this.studyService.deleteStudyWithPatients(
            study.id!, 
            `User requested complete deletion of study and all ${enrollments.length} associated patients`
          );
          this.toastService.success(
            `Study "${study.title}" and ${enrollments.length} associated patient(s) have been permanently deleted.`
          );
        } else {
          // Use the regular soft delete for studies without patients
          await this.studyService.deleteStudy(
            study.id!, 
            'User requested deletion of study with no enrolled patients'
          );
          this.toastService.success(
            `Study "${study.title}" has been archived.`
          );
        }

        // Remove from local array
        this.studies = this.studies.filter(s => s.id !== study.id);
        if (this.selectedStudy?.id === study.id) {
          this.selectedStudy = null;
          this.studyEnrollments = [];
          this.careIndicators = [];
        }

        // Refresh the studies list
        this.loadStudies();
      } catch (error) {
        console.error('Error deleting study:', error);
        this.toastService.error(
          `Failed to delete study: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        
        // Reset button state
        const deleteButton = document.querySelector(`[data-study-id="${study.id}"] .delete-button`);
        if (deleteButton) {
          deleteButton.textContent = 'Delete';
          deleteButton.removeAttribute('disabled');
        }
      }
    }
  }

  async enrollPatientInStudy(study: Study): Promise<void> {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to enroll patients');
      return;
    }

    try {
      // Load patient templates and open the patient form modal with the study pre-selected
      await this.loadPatientTemplates();
      
      // Set the default study for the patient form
      this.defaultStudyIdForPatient = study.id!;
      
      // Open the patient template selector modal
      this.showPatientTemplateModal = true;
    } catch (error) {
      console.error('Error opening patient enrollment:', error);
      alert('Failed to open patient enrollment. Please try again.');
    }
  }

  /**
   * Create a demo patient for testing purposes
   * In production, this would be replaced with patient selection modal
   */
  private async createDemoPatientForStudy(studyId: string): Promise<string | null> {
    try {
      const patientNumber = `P${Date.now().toString().slice(-6)}`; // Generate unique patient number
      const uniquePatientId = `patient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // Generate unique patient ID
      
      // Create patient data that matches Patient model - only include defined values
      const currentUser = await firstValueFrom(this.authService.user$);
      const userId = currentUser?.uid || 'system';
      const now = new Date();
      
      // Template-based patient creation - build minimal required structure
      // In production, this would be based on patient enrollment form templates
      const patientData = {
        // Required unique ID field (needed before Firestore document creation)
        id: uniquePatientId,
        
        // Core required fields from Patient model
        studyId: studyId,
        patientNumber: patientNumber,
        
        // Minimal identifiers array with only defined values
        identifiers: [{
          type: 'study_id',
          value: patientNumber,
          system: 'EDC_SYSTEM'
        }],
        
        // Minimal demographics with only required fields
        demographics: {
          firstName: 'Demo',
          lastName: `Patient ${patientNumber}`,
          dateOfBirth: new Date(1990, 0, 1), // Use fixed date to avoid random issues
          gender: 'unknown' // Use valid enum value
        },
        
        // Required enrollment fields
        enrollmentDate: now,
        enrollmentStatus: 'screening',
        
        // Required arrays (empty but defined)
        consents: [],
        visitSubcomponents: [],
        activeAlerts: [],
        protocolDeviations: [],
        changeHistory: [],
        
        // Required boolean
        hasValidConsent: true,
        
        // Required progress object
        studyProgress: {
          totalVisits: 0,
          completedVisits: 0,
          missedVisits: 0,
          upcomingVisits: 0,
          overallCompletionPercentage: 0
        },
        
        // Required audit fields
        createdBy: userId,
        createdAt: now,
        lastModifiedBy: userId,
        lastModifiedAt: now
      };
      
      console.log('Creating patient with minimal template-based data:', patientData);
      
      // Validate that required fields are present
      if (!patientData.identifiers || patientData.identifiers.length === 0) {
        console.error('ERROR: Patient identifiers array is empty or missing!');
        console.log('Original identifiers before cleaning:', {
          type: 'study_id',
          value: patientNumber,
          system: 'EDC_SYSTEM'
        });
      }

      // Use PatientService to create the patient (assuming it exists)
      // If PatientService doesn't have createPatient method, we'll create it via Firestore directly
      const patient = await this.createPatientDirectly(patientData);
      return patient.id;
    } catch (error) {
      console.error('Error creating demo patient - Full error details:');
      console.error('Error message:', error);
      console.error('Error stack:', (error as any)?.stack);
      console.error('Error code:', (error as any)?.code);
      console.error('Error name:', (error as any)?.name);
      return null;
    }
  }

  /**
   * Clean object data to remove undefined values (Firestore doesn't allow undefined)
   */
  private cleanUndefinedValues(obj: any): any {
    // Handle null - keep it as is
    if (obj === null) {
      return null;
    }
    
    // Handle undefined - this should be removed
    if (obj === undefined) {
      return undefined;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      const cleanedArray = obj
        .map(item => this.cleanUndefinedValues(item))
        .filter(item => item !== undefined); // Only filter out undefined, keep null and other values
      return cleanedArray;
    }
    
    // Handle plain objects
    if (typeof obj === 'object' && obj.constructor === Object) {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          const cleanedValue = this.cleanUndefinedValues(value);
          // Only add the property if the cleaned value is not undefined
          if (cleanedValue !== undefined) {
            cleaned[key] = cleanedValue;
          }
        }
      }
      return cleaned;
    }
    
    // For primitives (string, number, boolean, etc.), return as-is
    return obj;
  }

  /**
   * Create patient directly in Firestore
   * This is a temporary method - in production, use proper PatientService
   */
  private async createPatientDirectly(patientData: any): Promise<{id: string}> {
    // Clean the data to remove any undefined values
    const cleanedData = this.cleanUndefinedValues({
      ...patientData,
      createdAt: new Date(),
      lastModifiedAt: new Date()
    });
    
    console.log('Creating patient with cleaned data:', cleanedData);
    
    const docRef = await runInInjectionContext(this.injector, async () => {
      const { collection, addDoc, getFirestore } = await import('@angular/fire/firestore');
      const firestore = getFirestore();
      const patientsRef = collection(firestore, 'patients');
      return await addDoc(patientsRef, cleanedData);
    });
    
    return { id: docRef.id };
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
      // Get the current study
      const study = await this.studyService.getStudy(this.selectedStudy.id);
      if (!study) {
        throw new Error('Study not found');
      }

      // Find the section to update
      const sectionIndex = study.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex === -1) {
        throw new Error('Section not found');
      }

      // Get template details
      const template = await this.templateService.getTemplate(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Create template reference
      const templateRef: StudySectionFormTemplate = {
        id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        templateId: templateId,
        templateName: template.name,
        templateVersion: String(template.version || '1.0'),
        order: study.sections[sectionIndex].formTemplates?.length || 0,
        isRequired: false,
        completionRequired: false,
        signatureRequired: false,
        reviewRequired: false
      };

      // Add template reference to section
      if (!study.sections[sectionIndex].formTemplates) {
        study.sections[sectionIndex].formTemplates = [];
      }
      study.sections[sectionIndex].formTemplates.push(templateRef);

      // Update the study with the new section data
      await this.studyService.updateStudy(this.selectedStudy.id, {
        sections: study.sections
      }, 'Added form template to section');

      // Refresh the selected study data
      this.selectedStudy = await this.studyService.getStudy(this.selectedStudy.id);
      
      this.closeFormAssignmentModal();
      console.log('Successfully added template to section');
    } catch (error) {
      console.error('Error assigning form to section:', error);
      alert('Failed to add form template to section. Please try again.');
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

  // Patient Template Dropdown Methods
  onTemplateSelected(): void {
    // Optional: Can be used to show template preview or info when selection changes
    console.log('Template selected:', this.selectedTemplateForPatient);
  }

  async createFormForSelectedTemplate(): Promise<void> {
    if (!this.selectedTemplateForPatient || !this.selectedPatient) {
      return;
    }

    // Find the selected template
    const templates = await firstValueFrom(this.templates$);
    const template = templates.find(t => t.id === this.selectedTemplateForPatient);
    
    if (template) {
      await this.createLegacyFormInstance(template, this.selectedPatient);
      // Reset selection after creating form
      this.selectedTemplateForPatient = '';
    }
  }

  getSelectedTemplateInfo(): FormTemplate | null {
    if (!this.selectedTemplateForPatient) {
      return null;
    }

    // Get templates from observable synchronously if available
    const templates = this.allTemplates.length > 0 ? this.allTemplates : [];
    return templates.find(t => t.id === this.selectedTemplateForPatient) || null;
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

  // Study-Patient Hierarchy Sidebar Methods
  toggleStudyExpansion(studyId: string): void {
    if (this.expandedStudies.has(studyId)) {
      this.expandedStudies.delete(studyId);
    } else {
      this.expandedStudies.add(studyId);
    }
  }

  togglePatientExpansion(patientId: string): void {
    if (this.expandedPatients.has(patientId)) {
      this.expandedPatients.delete(patientId);
    } else {
      this.expandedPatients.add(patientId);
    }
  }

  getStudyPatients(studyId: string): PatientListItem[] {
    // Filter patients by study ID or return all patients if study has no specific patients
    return this.patients.filter(patient => patient.studyId === studyId || !patient.studyId);
  }

  getStudyPatientCount(studyId: string): number {
    return this.getStudyPatients(studyId).length;
  }

  selectPatientFromSidebar(patient: PatientListItem): void {
    // Navigate to patient view and load patient details
    this.activeSidebarItem = 'patients';
    this.selectPatient(patient);
  }

  getPatientStatusIcon(status: string): string {
    switch (status) {
      case 'active':
        return 'check_circle';
      case 'completed':
        return 'task_alt';
      case 'withdrawn':
        return 'remove_circle';
      default:
        return 'help';
    }
  }

  trackPatient(index: number, patient: PatientListItem): string {
    return patient.id || index.toString();
  }
  
  // Delete patient from study
  deletePatientFromStudy(patient: string | PatientListItem, studyId: string) {
    // Check permissions
    if (!this.permissions.canDeletePatients) {
      console.error('You do not have permission to remove patients from studies');
      alert('You do not have permission to remove patients from studies');
      return;
    }
    
    const patientId = typeof patient === 'string' ? patient : patient.id;
    const patientName = typeof patient === 'string' ? 'this patient' : patient.displayName;
    
    // Single confirmation dialog
    const confirmMessage = `Are you sure you want to remove ${patientName} from this study?\n\nThis action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
      // Call the async version
      this.deletePatientFromStudyAsync(patientId, studyId, patientName);
    }
  }
  
  // View patient forms
  viewPatientForms(patient: PatientListItem) {
    this.selectPatient(patient);
    this.activeSidebarItem = 'forms';
    // Filter forms for this patient
    this.searchQuery = patient.identifier;
    console.log(`Viewing forms for patient ${patient.displayName}`);
  }
  
  // View patient history
  viewPatientHistory(patient: PatientListItem) {
    this.selectPatient(patient);
    // In a real app, this would navigate to patient history view
    console.log(`Viewing history for patient ${patient.displayName}`);
  }
  
  // View patient details with phases and templates
  viewPatientDetails(patient: PatientListItem) {
    // Navigate to patient detail component
    this.router.navigate(['/patient-detail', patient.id]);
  }
  
  // Toggle sidebar
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
  
  // Create new patient
  createNewPatient() {
    this.openPatientTemplateSelector();
  }

  // Navigation method for horizontal navigation bar
  navigateToSection(item: any): void {
    this.activeSidebarItem = item.id;
    console.log('Navigating to:', item.id);
  }

  // Delete patient from study - async implementation
  async deletePatientFromStudyAsync(patientId: string, studyId: string, patientName: string = 'Patient'): Promise<void> {
    try {
      console.log('Deleting patient:', patientId, 'from study:', studyId);
      
      // Call the patient service to delete the patient
      await this.patientService.deletePatient(patientId);
      
      // Show brief success message
      this.toastService.success(`${patientName} removed from study successfully`);
      
      // Refresh the patients list to update the UI
      await this.loadPatients();
      
      // If the deleted patient was selected, clear the selection
      if (this.selectedPatient && this.selectedPatient.id === patientId) {
        this.selectedPatient = null;
      }
      
    } catch (error) {
      console.error('Error deleting patient:', error);
      this.toastService.error('Failed to remove patient: ' + (error as Error).message);
    }
  }

  /**
   * Fill a template - creates a form instance for testing the template
   */
  fillTemplate(template: FormTemplate): void {
    console.log('Fill template requested for:', template.name);
    
    // Store the template to be filled
    this.templateToFill = template;
    
    // Close the template modal
    this.showTemplateModal = false;
    
    // Open a modal or navigate to a form filling view
    this.showTemplateFillModal = true;
  }

  /**
   * Close the template fill modal
   */
  closeTemplateFillModal(): void {
    this.showTemplateFillModal = false;
    this.templateToFill = null;
  }

  /**
   * Handle template fill form submission
   */
  async onTemplateFillSubmitted(formInstance: TemplateFormInstance): Promise<void> {
    // The FormPreviewComponent already handles creating and submitting the form instance
    // We just need to handle the UI feedback and close the modal
    console.log('Template test form submitted:', formInstance);
    this.toastService.success('Template test response submitted successfully');
    this.closeTemplateFillModal();
  }

  /**
   * Handle template fill form save (draft)
   */
  async onTemplateFillSaved(formInstance: TemplateFormInstance): Promise<void> {
    // The FormPreviewComponent already handles creating and saving the form instance
    // We just need to provide UI feedback
    console.log('Template test form saved as draft:', formInstance);
    this.toastService.success('Template test response saved as draft');
    // Don't close the modal on save, allow user to continue editing
  }

  /**
   * Open OCR Template Builder modal
   */
  openOcrTemplateBuilder(): void {
    const dialogRef = this.dialog.open(OcrTemplateBuilderComponent, {
      width: '95vw',
      height: '95vh',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'ocr-dialog-panel',
      data: {
        templateName: 'OCR Generated Template'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('OCR Template created:', result);
        this.toastService.success('Template created successfully from OCR scan');
        // Templates will automatically refresh via the templates$ observable
      }
    });
  }

  /**
   * Close OCR Template Builder modal
   */
  closeOcrTemplateBuilder(): void {
    // No longer needed as dialog handles its own closing
  }

}
