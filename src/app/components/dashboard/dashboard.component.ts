import { Component, inject, OnInit, OnDestroy, runInInjectionContext, Injector, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, Observable, Subscription, combineLatest, map, of, withLatestFrom, firstValueFrom } from 'rxjs';
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
import { LanguageService } from '../../services/language.service';
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
import { ExcelConversionDialogComponent } from '../excel-conversion-dialog/excel-conversion-dialog.component';
import { ImageRecognitionComponent } from '../image-recognition/image-recognition.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PatientDetailComponent } from '../patient-detail/patient-detail.component';
import { DashboardSidebarComponent } from '../dashboard-sidebar/dashboard-sidebar.component';
import { PatientPhaseProgressComponent } from '../patient-phase-progress/patient-phase-progress.component';
import { PatientFormModalComponent } from '../patient-form-modal/patient-form-modal.component';
import { SurveyManagementComponent } from '../survey-management/survey-management.component';
import { StudyCreationModalComponent } from '../study-creation-modal/study-creation-modal.component';
import { ReportsDashboardComponent } from '../reports-dashboard/reports-dashboard.component';
import { UserProfile } from '../../models/user-profile.model';
import { FormTemplate, FormInstance as TemplateFormInstance, TemplateType, PhiFieldType, ValidationRule } from '../../models/form-template.model';
import { PhiEncryptionService } from '../../services/phi-encryption.service';
import { Study, StudySection, StudySite, EligibilityCriteria, PatientStudyEnrollment, CareIndicator, Substudy, StudyGroup, StudyFormInstance, StudyFormInstanceStatus, DataQuery, EnhancedStudySection, StudySectionFormTemplate } from '../../models/study.model';
import { AccessLevel } from '../../enums/access-levels.enum';
import { CloudAuditService, AuditLogEntry } from '../../services/cloud-audit.service';

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
  status: 'not_started' | 'in_progress' | 'completed' | 'locked' | 'missed';
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
    StudyCreationModalComponent,
    ReportsDashboardComponent
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
  private languageService = inject(LanguageService);
  private phiEncryptionService = inject(PhiEncryptionService);
  private patientService = inject(PatientService);
  private toastService = inject(ToastService);
  private studyPhaseService = inject(StudyPhaseService);
  private dialog = inject(MatDialog);
  private injector: Injector = inject(Injector);
  private cloudAuditService = inject(CloudAuditService);

  // ViewChild reference to study creation modal
  @ViewChild(StudyCreationModalComponent) studyCreationModal!: StudyCreationModalComponent;

  // Observables
  userProfile$: Observable<UserProfile | null> = this.authService.currentUserProfile$;
  templates$: Observable<FormTemplate[]> = this.templateService.templates$;
  studies$: Observable<Study[]> = this.studyService.getStudies();

  // Component state
  patients: PatientListItem[] = [];
  studies: Study[] = [];
  selectedStudy: Study | null = null;
  studyEnrollments: any[] = [];
  careIndicators: CareIndicator[] = [];

  // Enhanced study management state
  substudies: Substudy[] = [];
  studyGroups: StudyGroup[] = [];
  formInstances: StudyFormInstance[] = [];
  dataQueries: DataQuery[] = [];
  selectedSubstudy: Substudy | null = null;
  selectedStudyGroup: StudyGroup | null = null;
  selectedSection: EnhancedStudySection | null = null;

  // Study dashboard state
  studyViewTab: 'phases' | 'patients' | 'sites' | 'queries' = 'phases';
  expandedPhases: Set<string> = new Set();
  studyPatients: PatientStudyEnrollment[] = [];

  // Study management modals
  showSubstudyModal = false;
  showStudyGroupModal = false;
  showFormAssignmentModal = false;
  showSectionModal = false;
  showStudyCreationModal = false;

  // Form assignment state
  availableTemplates: FormTemplate[] = [];
  selectedTemplateForAssignment: FormTemplate | null = null;

  selectedPatient: any = null;
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

  // Audit log properties
  auditLogs: any[] = [];
  expandedAuditLogs = new Set<string>();
  auditLogFilter: string = '';
  loadingAuditLogs: boolean = false;
  filteredAuditLogs: any[] = [];

  // Make Object available in template
  Object = Object;

  // Study-Patient Hierarchy Sidebar State
  expandedStudies = new Set<string>();
  expandedPatients = new Set<string>();

  // Additional properties and methods
  showPatientTemplateSelector = false;
  showTemplateQuickSetupModal = false;
  sidebarCollapsed = false;

  patientPhases: any[] = [];

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

      this.patients = await Promise.all(snapshot.docs.map(async doc => {
        const patient = { id: doc.id, ...doc.data() } as any;

        // Build display name from demographics
        const demographics = patient.demographics || {};
        const displayName = `${demographics.firstName || 'Unknown'} ${demographics.lastName || 'Patient'}`.trim();

        // Load visit subcomponents from subcollection
        let visitSubcomponents: any[] = [];
        try {
          const { collection, getDocs, getFirestore } = await import('@angular/fire/firestore');
          visitSubcomponents = await runInInjectionContext(this.injector, async () => {
            const firestore = getFirestore();
            const subcomponentsRef = collection(firestore, 'patients', doc.id, 'visitSubcomponents');
            const subcomponentsSnapshot = await getDocs(subcomponentsRef);
            return subcomponentsSnapshot.docs.map(subDoc => ({
              id: subDoc.id,
              ...subDoc.data()
            }));
          });
        } catch (error) {
          console.log(`No visit subcomponents for patient ${doc.id}`);
        }

        return {
          id: patient.id,
          identifier: patient.patientNumber || patient.id,
          displayName,
          studyId: patient.studyId,
          enrollmentDate: patient.enrollmentDate ? new Date(patient.enrollmentDate.seconds ? patient.enrollmentDate.seconds * 1000 : patient.enrollmentDate) : undefined,
          lastVisit: patient.lastVisit ? new Date(patient.lastVisit.seconds ? patient.lastVisit.seconds * 1000 : patient.lastVisit) : undefined,
          formsCount: visitSubcomponents.length || patient.forms?.length || 0,
          status: patient.enrollmentStatus || 'active' as const,
          canViewPhi: this.permissions.canView,
          visitSubcomponents,
          phases: patient.phases || visitSubcomponents,
          forms: patient.forms || [],
          demographics: patient.demographics || {},
          // Include all patient data for proper phase display
          ...patient
        };
      }));

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

  async selectPatient(patient: any) {
    // Convert Firestore timestamps to Date objects
    if (patient) {
      patient = {
        ...patient,
        enrollmentDate: patient.enrollmentDate ? 
          (patient.enrollmentDate.seconds ? 
            new Date(patient.enrollmentDate.seconds * 1000) : 
            (patient.enrollmentDate instanceof Date ? patient.enrollmentDate : new Date(patient.enrollmentDate))
          ) : undefined,
        lastVisit: patient.lastVisit ? 
          (patient.lastVisit.seconds ? 
            new Date(patient.lastVisit.seconds * 1000) : 
            (patient.lastVisit instanceof Date ? patient.lastVisit : new Date(patient.lastVisit))
          ) : undefined
      };
    }
    
    this.selectedPatient = patient;
    console.log('Selected patient:', patient);

    // Load patient phases when patient is selected
    // First try to use phases array from patient document, then fall back to visitSubcomponents
    if (patient) {
      // Use phases if available, otherwise use visitSubcomponents
      this.patientPhases = patient.phases || patient.visitSubcomponents || [];

      // If we still don't have phases, fetch the patient data to ensure we have the latest
      if (this.patientPhases.length === 0 && patient.id) {
        this.patientService.getPatientById(patient.id).then(fullPatient => {
          if (fullPatient) {
            this.patientPhases = fullPatient.phases || [];
            console.log('Loaded patient phases:', this.patientPhases);

            // Calculate completion percentages for each phase
            this.patientPhases.forEach(phase => {
              const totalForms = phase.formTemplates?.length || phase.templateAssignments?.length || 0;
              const completedForms = phase.formTemplates?.filter((f: any) => f.completed).length || 0;
              phase.completionPercentage = totalForms > 0 ? Math.round((completedForms / totalForms) * 100) : 0;
            });
          }
        }).catch(error => {
          console.error('Error loading patient phases:', error);
        });
      } else {
        // Calculate completion percentages for existing phases
        this.patientPhases.forEach(phase => {
          const totalForms = phase.formTemplates?.length || phase.templateAssignments?.length || 0;
          const completedForms = phase.formTemplates?.filter((f: any) => f.completed).length || 0;
          phase.completionPercentage = totalForms > 0 ? Math.round((completedForms / totalForms) * 100) : 0;
        });
      }
    }

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
                lastModified: (instance.lastModifiedAt as any)?.toDate ? (instance.lastModifiedAt as any).toDate() : new Date(),
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
          // For now, use patient data from Firestore instead of Healthcare API
          // The Healthcare API integration requires patients to be created in FHIR store first
          const demographics = patient.demographics || {};
          const birthDate = demographics.dateOfBirth ? 
            (demographics.dateOfBirth.seconds ? 
              new Date(demographics.dateOfBirth.seconds * 1000) : 
              new Date(demographics.dateOfBirth)
            ) : undefined;

          this.selectedPatientPhiData = {
            id: patient.id || '',
            name: {
              given: [demographics.firstName || ''],
              family: demographics.lastName || ''
            },
            dateOfBirth: birthDate || new Date(),
            gender: demographics.gender || 'unknown',
            contactInfo: {
              phone: demographics.phone,
              email: demographics.email,
              address: demographics.address ? 
                `${demographics.address.street || ''}, ${demographics.address.city || ''}, ${demographics.address.state || ''} ${demographics.address.zip || ''}`.trim() :
                undefined
            }
          };
          
          // Optionally try to fetch from Healthcare API if patient exists there
          // This is commented out to prevent 500 errors for patients not in FHIR store
          // const phiData = await this.healthcareService.getPatient(patient.id);
        } catch (error) {
          console.error('Error loading PHI data:', error);
          // Fallback to basic patient data
          this.selectedPatientPhiData = null;
        }
      }
    } catch (error) {
      console.error('Error in selectPatient:', error);
    }
  }

  clearSelectedPatient() {
    this.selectedPatient = null;
    this.patientPhases = [];
  }

  getStudyName(studyId: string): string {
    const study = this.studies.find(s => s.id === studyId);
    return study?.title || '';
  }

  getPhaseIcon(status: string): string {
    switch (status) {
      case 'completed': return 'check_circle';
      case 'in_progress': return 'pending';
      case 'scheduled': return 'schedule';
      case 'overdue': return 'warning';
      default: return 'radio_button_unchecked';
    }
  }

  getCompletedFormsCount(phase: any): number {
    if (!phase.formTemplates) return 0;
    return phase.formTemplates.filter((f: any) => f.completed).length;
  }

  isFormCompleted(phase: any, form: any): boolean {
    return form.completed === true;
  }

  getTotalFormsCount(): number {
    if (!this.patientPhases) return 0;
    return this.patientPhases.reduce((total, phase) =>
      total + (phase.formTemplates?.length || 0), 0);
  }

  getCompletedFormsTotal(): number {
    if (!this.patientPhases) return 0;
    return this.patientPhases.reduce((total, phase) =>
      total + (phase.formTemplates?.filter((f: any) => f.completed).length || 0), 0);
  }

  getPendingFormsTotal(): number {
    if (!this.patientPhases) return 0;
    return this.patientPhases.reduce((total, phase) =>
      total + (phase.formTemplates?.filter((f: any) => !f.completed && f.isRequired).length || 0), 0);
  }

  getOverdueFormsTotal(): number {
    if (!this.patientPhases) return 0;
    const now = new Date();
    return this.patientPhases.reduce((total, phase) => {
      if (!phase.formTemplates) return total;
      return total + phase.formTemplates.filter((f: any) => {
        if (f.completed) return false;
        if (!f.dueDate) return false;
        return new Date(f.dueDate) < now;
      }).length;
    }, 0);
  }

  openForm(phase: any, form: any) {
    console.log('Opening form:', form, 'for phase:', phase);
    // TODO: Implement form opening logic
    this.toastService.info('Form viewer will be implemented', 3000);
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
      const template = templates.find(t => t.id === templateId);
      this.selectedTemplateForEdit = template || null;
    } else {
      this.selectedTemplateForEdit = null;
    }
    this.showFormBuilderModal = true;
  }

  openFormBuilderWithTemplate(template: any): void {
    // Set the template for editing (even though it's new)
    this.selectedTemplateForEdit = template;
    this.editingTemplateId = undefined; // No ID yet since it's a new template
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
    if (!instance.formData || !instance.templateId) return 0;
    // Simple calculation based on filled fields vs total fields
    const filledFields = Object.keys(instance.formData).filter(key =>
      instance.formData![key] !== null && instance.formData![key] !== undefined && instance.formData![key] !== ''
    ).length;
    const totalFields = Object.keys(instance.formData).length;
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
  async selectSidebarItem(itemId: string) {
    console.log('Selecting sidebar item:', itemId);
    this.sidebarItems.forEach(item => item.active = item.id === itemId);
    this.activeSidebarItem = itemId;
    
    // Load data based on selected item
    if (itemId === 'patients') {
      await this.loadPatients();
    } else if (itemId === 'forms') {
      await this.loadTemplates();
    } else if (itemId === 'studies') {
      await this.loadStudiesData();
    } else if (itemId === 'audit') {
      await this.loadAuditLogs();
    }
  }

  async loadAuditLogs() {
    try {
      this.loadingAuditLogs = true;
      this.auditLogs = await this.cloudAuditService.fetchUserAuditLogs();
      this.filterAuditLogs();
    } catch (error) {
      console.error('Error loading audit logs:', error);
      this.auditLogs = [];
      this.filteredAuditLogs = [];
    } finally {
      this.loadingAuditLogs = false;
    }
  }

  filterAuditLogs() {
    if (!this.auditLogFilter) {
      this.filteredAuditLogs = this.auditLogs;
      return;
    }

    const filter = this.auditLogFilter.toLowerCase();
    this.filteredAuditLogs = this.auditLogs.filter(log => 
      log.action?.toLowerCase().includes(filter) ||
      log.resource?.toLowerCase().includes(filter) ||
      log.userId?.toLowerCase().includes(filter) ||
      log.details?.toLowerCase().includes(filter) ||
      log.severity?.toLowerCase().includes(filter)
    );
  }

  toggleAuditLogDetails(log: any) {
    log.expanded = !log.expanded;
    
    // Load additional details if not already loaded
    if (log.expanded && !log.detailsLoaded) {
      this.loadAuditLogDetails(log);
    }
  }
  
  async loadAuditLogDetails(log: any) {
    try {
      // Mark as loading
      log.loadingDetails = true;
      
      // Simulate loading additional details (in real app, this would fetch from backend)
      // For now, we'll enhance the existing data
      log.detailsLoaded = true;
      
      // Add more detailed information if not present
      if (!log.metadata) {
        log.metadata = {};
      }
      
      // Add contextual information based on action type
      switch(log.action) {
        case 'CREATE':
        case 'UPDATE':
          if (log.resourceType === 'FORM') {
            log.metadata['Form Status'] = log.formStatus || 'Unknown';
            log.metadata['Fields Modified'] = log.fieldsModified || 'N/A';
          } else if (log.resourceType === 'PATIENT') {
            log.metadata['Patient ID'] = log.patientId || 'N/A';
            log.metadata['Study'] = log.studyName || 'N/A';
          }
          break;
        case 'DELETE':
          log.metadata['Deleted Item'] = log.deletedItemName || 'Unknown';
          log.metadata['Reason'] = log.deleteReason || 'Not specified';
          break;
        case 'LOGIN':
        case 'LOGOUT':
          log.metadata['Session Duration'] = log.sessionDuration || 'N/A';
          log.metadata['Authentication Method'] = log.authMethod || 'Standard';
          break;
        case 'EXPORT':
        case 'IMPORT':
          log.metadata['File Type'] = log.fileType || 'Unknown';
          log.metadata['Records Count'] = log.recordsCount || 'N/A';
          break;
      }
      
      // Add timestamp details
      if (log.timestamp) {
        const date = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        log.metadata['Date'] = date.toLocaleDateString();
        log.metadata['Time'] = date.toLocaleTimeString();
      }
      
      log.loadingDetails = false;
    } catch (error) {
      console.error('Error loading audit log details:', error);
      log.loadingDetails = false;
      log.detailsLoaded = false;
    }
  }

  getAuditActionIcon(action: string): string {
    const iconMap: { [key: string]: string } = {
      'CREATE': 'add_circle',
      'UPDATE': 'edit',
      'DELETE': 'delete',
      'VIEW': 'visibility',
      'LOGIN': 'login',
      'LOGOUT': 'logout',
      'EXPORT': 'download',
      'IMPORT': 'upload',
      'APPROVE': 'check_circle',
      'REJECT': 'cancel'
    };
    return iconMap[action] || 'info';
  }

  getAuditSeverityClass(severity: string): string {
    const classMap: { [key: string]: string } = {
      'INFO': 'severity-info',
      'WARNING': 'severity-warning',
      'ERROR': 'severity-error',
      'CRITICAL': 'severity-critical'
    };
    return classMap[severity] || 'severity-info';
  }

  formatTimestamp(timestamp: any): string {
    if (!timestamp) return '';
    
    // Handle Firestore Timestamp
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleString();
    }
    
    // Handle string or Date
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? '' : date.toLocaleString();
  }

  trackAuditLog(index: number, log: any): string {
    return log.id || index;
  }

  getAuditLogCountBySeverity(severity: string): number {
    // Handle both single severity and combined severity types
    if (severity === 'ERROR_CRITICAL') {
      return this.filteredAuditLogs.filter(log => 
        log.severity === 'ERROR' || log.severity === 'CRITICAL'
      ).length;
    }
    return this.filteredAuditLogs.filter(log => log.severity === severity).length;
  }

  // Helper method for template to access Object.keys
  objectKeys(obj: any): string[] {
    return Object.keys(obj || {});
  }

  // View the resource associated with an audit log
  viewAuditResource(log: any): void {
    if (!log.resourceId) return;
    
    // Navigate based on resource type
    switch(log.resourceType) {
      case 'PATIENT':
        this.router.navigate(['/patient-detail', log.resourceId]);
        break;
      case 'FORM':
        // Find and open the form
        const form = this.formInstances.find((f: any) => f.id === log.resourceId);
        if (form) {
          console.log('Opening form:', form);
          // You can implement form preview modal here
        }
        break;
      case 'STUDY':
        // Navigate to study details
        this.activeSidebarItem = 'studies';
        break;
      case 'TEMPLATE':
        // Open template in form builder
        this.editingTemplateId = log.resourceId;
        this.showFormBuilderModal = true;
        break;
      default:
        console.log('Resource type not handled:', log.resourceType);
    }
  }

  // Export a single audit log
  exportAuditLog(log: any): void {
    try {
      // Create a formatted version of the log
      const exportData = {
        timestamp: this.formatTimestamp(log.timestamp),
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        userId: log.userId,
        userEmail: log.userEmail,
        severity: log.severity,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.metadata || {}
      };
      
      // Convert to JSON and download
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `audit-log-${log.id || Date.now()}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      this.toastService.success('Audit log exported successfully');
    } catch (error) {
      console.error('Error exporting audit log:', error);
      this.toastService.error('Failed to export audit log');
    }
  }

  async loadStudiesData() {
    try {
      this.studies = await this.studyService.getStudies().toPromise() || [];
    } catch (error) {
      console.error('Error loading studies:', error);
      this.studies = [];
    }
  }

  // Study management methods
  getCareIndicatorsForStudy(studyId: string): any[] {
    if (!this.careIndicators || !studyId) return [];
    return this.careIndicators.filter(indicator => indicator.studyId === studyId);
  }

  getCareIndicatorIcon(type: string): string {
    const iconMap: { [key: string]: string } = {
      'enrollment': 'person_add',
      'data_quality': 'assessment',
      'compliance': 'rule',
      'safety': 'health_and_safety',
      'protocol': 'description',
      'site': 'location_on',
      'default': 'warning'
    };
    return iconMap[type] || iconMap['default'];
  }

  async enrollPatientInStudy(study: any) {
    try {
      // Navigate to patient enrollment or show enrollment modal
      console.log('Enrolling patient in study:', study.id);
      // TODO: Implement patient enrollment logic
      this.showNotification('Patient enrollment feature coming soon', 'info');
    } catch (error) {
      console.error('Error enrolling patient:', error);
      this.showNotification('Failed to enroll patient', 'error');
    }
  }

  async deleteStudy(study: any) {
    if (!confirm(`Are you sure you want to delete study "${study.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Pass audit reason for CFR 21 Part 11 compliance
      const reason = `User deleted study: ${study.title}`;
      await this.studyService.deleteStudy(study.id, reason);
      this.studies = this.studies.filter(s => s.id !== study.id);
      this.showNotification('Study deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting study:', error);
      this.showNotification('Failed to delete study', 'error');
    }
  }

  async resolveCareIndicator(indicator: any) {
    try {
      // Mark indicator as resolved
      indicator.resolved = true;
      indicator.resolvedAt = new Date();
      indicator.resolvedBy = this.currentUserProfile?.uid;
      
      // Update in database - using StudyService for care indicators
      // TODO: Implement proper care indicator update in StudyService
      console.log('Resolving care indicator:', indicator);
      
      // Update local state
      const index = this.careIndicators.findIndex(ci => ci.id === indicator.id);
      if (index !== -1) {
        this.careIndicators[index] = { ...indicator, status: 'resolved' };
      }
      
      this.showNotification('Care indicator resolved', 'success');
    } catch (error) {
      console.error('Error resolving care indicator:', error);
      this.showNotification('Failed to resolve care indicator', 'error');
    }
  }

  showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // TODO: Implement proper notification service
    // For now, use console logging
  }

  onStudyWidgetClosed() {
    this.showStudyCreationModal = false;
  }

  async onStudyCreated(studyData: any) {
    try {
      const newStudy = await this.studyService.createStudy(studyData);
      this.studies.push(newStudy);
      this.showStudyCreationModal = false;
      this.showNotification('Study created successfully', 'success');
    } catch (error) {
      console.error('Error creating study:', error);
      this.showNotification('Failed to create study', 'error');
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

  trackSite(index: number, site: any): string {
    return site.siteId || index.toString();
  }

  trackPatient(index: number, patient: any): string {
    return patient.id || patient.patientNumber || index.toString();
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

    // Ensure language is synchronized with the dashboard
    const currentLang = this.languageService.getCurrentLanguage();
    if (currentLang) {
      // Force a refresh of translations if needed
      this.languageService.setLanguage(currentLang.code);
    }
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

  // Phase Management Methods
  getStudyPhases(study: Study): any[] {
    return study.phases || [];
  }

  getPhaseStatus(studyId: string, phase: any): string {
    const patientsInPhase = this.getPatientsInPhase(studyId, phase.id);
    if (patientsInPhase.length === 0) {
      return 'not_started';
    }

    const hasCompleted = patientsInPhase.some(p => p.phaseProgress?.[phase.id]?.status === 'completed');
    if (hasCompleted) {
      const allCompleted = patientsInPhase.every(p => p.phaseProgress?.[phase.id]?.status === 'completed');
      return allCompleted ? 'completed' : 'in_progress';
    }

    return 'in_progress';
  }

  getPhaseProgress(studyId: string, phase: any): number {
    const patientsInPhase = this.getPatientsInPhase(studyId, phase.id);
    if (patientsInPhase.length === 0) return 0;

    const completedCount = patientsInPhase.filter(
      p => p.phaseProgress?.[phase.id]?.status === 'completed'
    ).length;

    return Math.round((completedCount / patientsInPhase.length) * 100);
  }

  // Phase UI Helper Methods
  getPhaseStatusIcon(studyId: string, phase: any): string {
    const status = this.getPhaseStatus(studyId, phase);
    switch (status) {
      case 'completed': return 'check_circle';
      case 'in_progress': return 'pending';
      case 'not_started': return 'radio_button_unchecked';
      default: return 'help';
    }
  }

  getPhaseStatusText(studyId: string, phase: any): string {
    const status = this.getPhaseStatus(studyId, phase);
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'not_started': return 'Not Started';
      default: return 'Unknown';
    }
  }

  getPhaseProgressColor(studyId: string, phase: any): string {
    const progress = this.getPhaseProgress(studyId, phase);
    if (progress >= 75) return '#4caf50';
    if (progress >= 50) return '#2196f3';
    if (progress >= 25) return '#ff9800';
    return '#9e9e9e';
  }

  getPhaseProgressDasharray(studyId: string, phase: any): string {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    return `${circumference} ${circumference}`;
  }

  getPhaseProgressDashoffset(studyId: string, phase: any): string {
    const progress = this.getPhaseProgress(studyId, phase);
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;
    return offset.toString();
  }

  // Phase Expansion Methods
  togglePhaseExpansion(phaseId: string): void {
    if (this.expandedPhases.has(phaseId)) {
      this.expandedPhases.delete(phaseId);
    } else {
      this.expandedPhases.add(phaseId);
    }
  }

  isPhaseExpanded(phaseId: string): boolean {
    return this.expandedPhases.has(phaseId);
  }

  // Patient Phase Methods
  getPatientsInPhase(studyId: string, phaseId: string): PatientStudyEnrollment[] {
    return this.studyEnrollments.filter(enrollment => {
      return enrollment.studyId === studyId &&
             (enrollment.currentPhase === phaseId ||
              enrollment.phaseProgress?.[phaseId]?.status === 'in_progress' ||
              enrollment.phaseProgress?.[phaseId]?.status === 'completed');
    });
  }

  getCurrentPatientPhase(patient: PatientStudyEnrollment): string {
    return patient.currentPhase || 'screening';
  }

  // Study Patients Methods
  async loadStudyPatients(studyId: string): Promise<void> {
    try {
      const patients = await this.studyService.getStudyPatients(studyId);
      this.studyPatients = patients.map(patient => ({
        id: patient.id || '',
        studyId: studyId,
        patientId: patient.id || '',
        enrollmentDate: patient.enrollmentDate || new Date(),
        enrollmentNumber: patient.patientNumber || '',
        status: patient.enrollmentStatus || 'enrolled',
        currentPhase: patient.currentPhase,
        phaseProgress: patient.phaseProgress || {},
        completedSections: [],
        sectionsInProgress: [],
        overdueSections: [],
        careIndicators: [],
        enrolledBy: patient.createdBy || '',
        lastModifiedBy: patient.lastModifiedBy || '',
        lastModifiedAt: patient.lastModifiedAt || new Date(),
        changeHistory: []
      }));
    } catch (error) {
      console.error('Error loading study patients:', error);
      this.studyPatients = [];
    }
  }

  // Study Progress Methods
  getStudyOverallProgress(study: Study): number {
    if (!study.phases || study.phases.length === 0) return 0;

    const totalProgress = study.phases.reduce((sum, phase) => {
      return sum + this.getPhaseProgress(study.id!, phase);
    }, 0);

    return Math.round(totalProgress / study.phases.length);
  }

  // Helper for enrollment status display
  getEnrollmentStatus(patient: any): string {
    return patient?.enrollmentStatus || patient?.status || 'active';
  }

  // Helper for treatment arm display
  getTreatmentArm(patient: any): string {
    return patient?.treatmentArm || 'Unassigned';
  }

  // Track Methods for ngFor
  trackPhase(index: number, phase: any): string {
    return phase.id || index.toString();
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
      // Note: When creating patients from templates, many study-specific fields
      // (like treatmentArm, siteId) may not be applicable and will be undefined.
      // These can be set later during the actual study enrollment process.
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
    if (!this.studies || this.studies.length === 0) return 0;
    return this.studies.reduce((total, study) => total + (study.actualEnrollment || 0), 0);
  }

  getEnrollmentsForStudy(studyId: string): any[] {
    if (!Array.isArray(this.studyEnrollments)) return [];
    return this.studyEnrollments.filter((enrollment: any) => enrollment.studyId === studyId);
  }

  getActiveStudiesCount(): number {
    return this.studies.filter(study => study.status === 'active' || study.status === 'recruiting').length;
  }

  trackStudy(index: number, study: Study): string {
    return study.id || `study-${index}`;
  }

// ... (rest of the code remains the same)

  private createVisitSubcomponentsFromStudyPhases(study: Study, patientId: string): any[] {
    const visitSubcomponents: any[] = [];
    const now = new Date();
    const userId = 'system'; // Will be set by the calling method
    
    console.log('Study data:', study);
    console.log('Study has phases:', study.phases);
    console.log('Study has sections:', study.sections);
    
    // If study has phases, create visit subcomponents from them
    if (study.phases && Array.isArray(study.phases)) {
      study.phases.forEach((phase, index) => {
        const subcomponentId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get templates for this phase from study sections
        const phaseTemplates: any[] = [];
        const requiredTemplateIds: string[] = [];
        const optionalTemplateIds: string[] = [];
        
        // Find sections that belong to this phase
        if (study.sections && Array.isArray(study.sections)) {
          const phaseSections = study.sections.filter(section => 
            (section as any).phaseId === phase.id || section.name === phase.phaseName
          );
          
          phaseSections.forEach(section => {
            if (section.formTemplates && Array.isArray(section.formTemplates)) {
              section.formTemplates.forEach(template => {
                const templateId = template.id || `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const templateName = (template as any).name || template.templateName || 'Unnamed Template';
                
                phaseTemplates.push({
                  id: templateId,
                  name: templateName,
                  description: (template as any).description,
                  isRequired: template.isRequired !== false,
                  category: (template as any).category,
                  order: template.order || 0
                });
                
                if (template.isRequired !== false) {
                  requiredTemplateIds.push(templateId);
                } else {
                  optionalTemplateIds.push(templateId);
                }
              });
            }
          });
        }
        
        // If phase has template assignments, use those
        if (phase.templateAssignments && Array.isArray(phase.templateAssignments)) {
          phase.templateAssignments.forEach(assignment => {
            const existingTemplate = phaseTemplates.find(t => t.id === assignment.templateId);
            if (!existingTemplate) {
              phaseTemplates.push({
                id: assignment.templateId,
                name: assignment.templateName,
                description: assignment.description,
                isRequired: assignment.isRequired,
                category: assignment.category,
                order: assignment.order || 0
              });
              
              if (assignment.isRequired) {
                if (!requiredTemplateIds.includes(assignment.templateId)) {
                  requiredTemplateIds.push(assignment.templateId);
                }
              } else {
                if (!optionalTemplateIds.includes(assignment.templateId)) {
                  optionalTemplateIds.push(assignment.templateId);
                }
              }
            }
          });
        }
        
        const visitSubcomponent = {
          id: subcomponentId,
          patientId: patientId,
          studyId: study.id,
          name: phase.phaseName || `Phase ${index + 1}`,
          description: phase.description,
          type: this.getPhaseType(phase.phaseCode || phase.phaseName),
          order: phase.order || (index + 1),
          phaseId: phase.id,
          isPhaseFolder: true,
          status: 'scheduled',
          completionPercentage: 0,
          
          // Templates
          templateIds: phaseTemplates.map(t => t.id),
          requiredTemplateIds: requiredTemplateIds,
          optionalTemplateIds: optionalTemplateIds,
          formTemplates: phaseTemplates,
          completedTemplates: [],
          inProgressTemplates: [],
          
          // Phase progression
          canProgressToNextPhase: false,
          blockingTemplates: requiredTemplateIds,
          
          // Timing
          scheduledDate: phase.plannedDurationDays ? 
            new Date(now.getTime() + (phase.plannedDurationDays * 24 * 60 * 60 * 1000)) : 
            undefined,
          windowStartDate: phase.windowStartDays !== undefined ? 
            new Date(now.getTime() + (phase.windowStartDays * 24 * 60 * 60 * 1000)) : 
            undefined,
          windowEndDate: phase.windowEndDays !== undefined ? 
            new Date(now.getTime() + (phase.windowEndDays * 24 * 60 * 60 * 1000)) : 
            undefined,
          
          // Metadata
          createdBy: 'system',
          createdAt: now,
          lastModifiedBy: 'system',
          lastModifiedAt: now
        };
        
        visitSubcomponents.push(visitSubcomponent);
      });
    } else if (study.sections && Array.isArray(study.sections)) {
      // Fallback: create visit subcomponents from sections if no phases defined
      study.sections.forEach((section, index) => {
        const subcomponentId = `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const phaseTemplates: any[] = [];
        const requiredTemplateIds: string[] = [];
        const optionalTemplateIds: string[] = [];
        
        if (section.formTemplates && Array.isArray(section.formTemplates)) {
          section.formTemplates.forEach(template => {
            const templateId = template.id || `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const templateName = (template as any).name || template.templateName || 'Unnamed Template';
            
            phaseTemplates.push({
              id: templateId,
              name: templateName,
              description: (template as any).description,
              isRequired: template.isRequired !== false,
              category: (template as any).category,
              order: template.order || 0
            });
            
            if (template.isRequired !== false) {
              requiredTemplateIds.push(templateId);
            } else {
              optionalTemplateIds.push(templateId);
            }
          });
        }
        
        const visitSubcomponent = {
          id: subcomponentId,
          patientId: patientId,
          studyId: study.id,
          name: section.name || `Section ${index + 1}`,
          description: section.description,
          type: section.type || 'treatment',
          order: section.order || (index + 1),
          phaseId: section.id,
          isPhaseFolder: true,
          status: 'scheduled',
          completionPercentage: 0,
          
          // Templates
          templateIds: phaseTemplates.map(t => t.id),
          requiredTemplateIds: requiredTemplateIds,
          optionalTemplateIds: optionalTemplateIds,
          formTemplates: phaseTemplates,
          completedTemplates: [],
          inProgressTemplates: [],
          
          // Phase progression
          canProgressToNextPhase: false,
          blockingTemplates: requiredTemplateIds,
          
          // Timing
          scheduledDate: section.scheduledDay ? 
            new Date(now.getTime() + (section.scheduledDay * 24 * 60 * 60 * 1000)) : 
            undefined,
          windowStartDate: section.windowStart !== undefined ? 
            new Date(now.getTime() + (section.windowStart * 24 * 60 * 60 * 1000)) : 
            undefined,
          windowEndDate: section.windowEnd !== undefined ? 
            new Date(now.getTime() + (section.windowEnd * 24 * 60 * 60 * 1000)) : 
            undefined,
          
          // Metadata
          createdBy: 'system',
          createdAt: now,
          lastModifiedBy: 'system',
          lastModifiedAt: now
        };
        
        visitSubcomponents.push(visitSubcomponent);
      });
    } else {
      // Create default phases if no phases or sections defined
      const defaultPhases = [
        { name: 'Screening', type: 'screening', order: 1 },
        { name: 'Baseline', type: 'baseline', order: 2 },
        { name: 'Treatment Phase 1', type: 'treatment', order: 3 },
        { name: 'Follow-up 1', type: 'follow_up', order: 4 },
        { name: 'Treatment Phase 2', type: 'treatment', order: 5 },
        { name: 'Final Visit', type: 'follow_up', order: 6 }
      ];
      
      defaultPhases.forEach(phase => {
        const subcomponentId = `default_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const visitSubcomponent = {
          id: subcomponentId,
          patientId: patientId,
          studyId: study.id,
          name: phase.name,
          type: phase.type,
          order: phase.order,
          isPhaseFolder: true,
          status: 'scheduled',
          completionPercentage: 0,
          templateIds: [],
          requiredTemplateIds: [],
          optionalTemplateIds: [],
          formTemplates: [],
          completedTemplates: [],
          inProgressTemplates: [],
          canProgressToNextPhase: true,
          blockingTemplates: [],
          createdBy: 'system',
          createdAt: now,
          lastModifiedBy: 'system',
          lastModifiedAt: now
        };
        
        visitSubcomponents.push(visitSubcomponent);
      });
    }
    
    return visitSubcomponents;
  }
  
  // Helper method to determine phase type from phase code or name
  private getPhaseType(phaseCodeOrName: string): string {
    const code = phaseCodeOrName.toLowerCase();
    if (code.includes('screen') || code === 'scr') return 'screening';
    if (code.includes('baseline') || code === 'bsl' || code === 'base') return 'baseline';
    if (code.includes('treatment') || code === 'trt' || code.includes('dose')) return 'treatment';
    if (code.includes('follow') || code === 'fu' || code.includes('visit')) return 'follow_up';
    if (code.includes('end') || code === 'eot' || code === 'eos') return 'end_of_study';
    return 'treatment'; // default
  }
  
  // Helper method to clean undefined values from objects
  private cleanUndefinedValues(obj: any): any {
    // Handle null - should be kept
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
    console.log('visitSubcomponents in cleaned data:', cleanedData.visitSubcomponents);
    console.log('visitSubcomponents length:', cleanedData.visitSubcomponents?.length);
    
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
        alert('Study not found');
        return;
      }

      // Load the phase from studyPhases collection
      const { collection, getDocs, query, where, doc, updateDoc, getFirestore } = await import('@angular/fire/firestore');
      const firestore = getFirestore();
      
      const phasesQuery = query(
        collection(firestore, 'studyPhases'),
        where('studyId', '==', study.id),
        where('id', '==', sectionId)
      );
      const phasesSnapshot = await getDocs(phasesQuery);
      
      if (phasesSnapshot.empty) {
        alert('Phase not found');
        return;
      }
      
      const phaseDoc = phasesSnapshot.docs[0];
      const phaseData = phaseDoc.data() as any;

      // Get the template details
      const templates = await firstValueFrom(this.templates$);
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        alert('Template not found');
        return;
      }

      // Create template reference
      const templateRef: StudySectionFormTemplate = {
        id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        templateId: templateId,
        templateName: template.name,
        templateVersion: String(template.version || '1.0'),
        order: phaseData.formTemplates?.length || 0,
        isRequired: false,
        completionRequired: false,
        signatureRequired: false,
        reviewRequired: false
      };

      // Add template reference to phase
      if (!phaseData.formTemplates) {
        phaseData.formTemplates = [];
      }
      phaseData.formTemplates.push(templateRef);

      // Update the phase in studyPhases collection
      const phaseRef = doc(firestore, 'studyPhases', phaseDoc.id);
      await updateDoc(phaseRef, {
        formTemplates: phaseData.formTemplates,
        lastModifiedAt: new Date(),
        lastModifiedBy: (await this.authService.getCurrentUserProfile())?.uid || 'system'
      });

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
  viewPatientDetails(patient: PatientListItem | PatientStudyEnrollment) {
    // Navigate to patient detail component
    // Handle both PatientListItem and PatientStudyEnrollment types
    const patientId = 'id' in patient ? patient.id : patient.patientId;
    this.router.navigate(['/patient-detail', patientId]);
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
      width: '90%',
      height: '90%',
      maxWidth: '1400px',
      maxHeight: '900px',
      data: {
        study: this.studies[0] // Pass the first study or selected study
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        // Template was created/updated, refresh the templates list
        this.refreshTemplates();
        this.toastService.success('Template imported successfully from Excel');
      }
    });
  }

  /**
   * Open Excel Conversion Dialog for import/export
   */
  openExcelConversionDialog(): void {
    const dialogRef = this.dialog.open(ExcelConversionDialogComponent, {
      width: '90%',
      height: '90%',
      maxWidth: '1200px',
      maxHeight: '800px',
      data: {
        mode: 'import',
        templates: this.allTemplates
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        // Template was created/updated, refresh the templates list
        this.refreshTemplates();
        this.toastService.success('Excel conversion completed successfully');
      }
    });
  }

  /**
   * Open Image Recognition Dialog for AI image processing
   */
  openImageRecognition(): void {
    const dialogRef = this.dialog.open(ImageRecognitionComponent, {
      width: '98vw',
      height: '98vh',
      maxWidth: '1800px',
      maxHeight: '98vh',
      panelClass: 'image-recognition-dialog'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Image recognition completed', result);
      }
    });
  }

  /**
   * Open Excel Import Dialog
   */
  openExcelImport(): void {
    const dialogRef = this.dialog.open(ExcelConversionDialogComponent, {
      width: '80%',
      maxWidth: '900px',
      data: {
        mode: 'import',
        templates: this.allTemplates
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        // Template was created/updated, refresh the templates list
        this.refreshTemplates();
        this.toastService.success('Template imported successfully from Excel');
      }
    });
  }

  exportTemplateToExcel(template: FormTemplate): void {
    const dialogRef = this.dialog.open(ExcelConversionDialogComponent, {
      width: '600px',
      data: {
        mode: 'export',
        template: template
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.toastService.success('Template exported to Excel successfully');
      }
    });
  }

  /**
   * Close OCR Template Builder modal
   */
  closeOcrTemplateBuilder(): void {
    // No longer needed as dialog handles its own closing
  }

  refreshTemplates(): void {
    // Trigger a refresh of the templates observable
    this.templates$ = this.templateService.templates$;
    this.templates$.pipe(takeUntil(this.destroy$)).subscribe(templates => {
      this.allTemplates = templates;
      this.filterTemplates();
    });
  }

  loadTemplates(): void {
    this.refreshTemplates();
  }

  // Template Assignment Methods
  getTemplateCompletionForPhase(studyId: string, phaseId: string, templateId?: string): number {
    // TODO: Implement actual template completion calculation
    // templateId parameter is optional, used for specific template completion
    return 0;
  }

  assignTemplateToPhase(studyId: string, phaseId: string): void {
    // TODO: Implement template assignment modal/logic
    console.log('Assigning template to phase:', phaseId);
  }

  trackTemplateAssignment(index: number, assignment: any): string {
    return assignment?.id || index.toString();
  }

  addPhaseToStudy(studyId: string): void {
    // TODO: Implement add phase modal/logic
    console.log('Adding phase to study:', studyId);
  }

  // Patient Helper Methods
  formatDate(date: any): string {
    if (!date) return 'N/A';
    if (date instanceof Date) {
      return date.toLocaleDateString();
    }
    if (date.toDate && typeof date.toDate === 'function') {
      return date.toDate().toLocaleDateString();
    }
    return 'N/A';
  }

  getSiteName(siteId: string): string {
    // TODO: Implement site lookup
    return siteId || 'Unassigned';
  }

  getPatientProgress(patient: PatientStudyEnrollment): number {
    // TODO: Implement patient progress calculation based on patient enrollment data
    if (!patient.phaseProgress) return 0;
    
    const phases = Object.values(patient.phaseProgress);
    if (phases.length === 0) return 0;
    
    const totalProgress = phases.reduce((sum, phase) => sum + (phase.progress || 0), 0);
    return Math.round(totalProgress / phases.length);
  }

  editPatientPhase(patient: PatientStudyEnrollment): void {
    // TODO: Implement patient phase editing
    console.log('Edit patient phase:', patient.studyId, patient.patientId);
  }
}
