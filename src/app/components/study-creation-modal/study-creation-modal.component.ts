import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Study, EnhancedStudySection, StudySectionFormTemplate } from '../../models/study.model';
import { AccessLevel } from '../../enums/access-levels.enum';
import { FormTemplate } from '../../models/form-template.model';
import { FormTemplateService } from '../../services/form-template.service';
import { StudyService } from '../../services/study.service';
import { TemplateGalleryComponent } from '../template-gallery/template-gallery.component';

@Component({
  selector: 'app-study-creation-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TemplateGalleryComponent],
  templateUrl: './study-creation-modal.component.html',
  styleUrls: ['./study-creation-modal.component.scss']
})
export class StudyCreationModalComponent implements OnInit {
  @Input() show = false;
  @Input() availableUsers: any[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() create = new EventEmitter<Study>();

  private fb = inject(FormBuilder);
  private formTemplateService = inject(FormTemplateService);
  private studyService = inject(StudyService);
  
  studyCreationForm!: FormGroup;
  isCreatingStudy = false;
  availableTemplates: FormTemplate[] = [];
  
  // Track if templates are loaded
  templatesLoaded = false;
  currentStep = 1;
  totalSteps = 3;


  async ngOnInit(): Promise<void> {
    this.initializeForm();
    
    // Auto-login for testing
    await this.autoLoginForTesting();
    
    this.loadAvailableTemplates();
    this.createSampleTemplatesIfNeeded();
  }

  private initializeForm(): void {
    this.studyCreationForm = this.fb.group({
      // Basic Information
      title: ['', [Validators.required, Validators.minLength(5)]],
      protocolNumber: ['', [Validators.required, Validators.pattern(/^[A-Z0-9-]+$/)]],
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
      
      // Enrollment
      plannedEnrollment: [0, [Validators.required, Validators.min(1)]],
      actualEnrollment: [0],
      enrollmentStatus: ['not_started'],
      
      // Study Team
      principalInvestigator: [''],
      studyCoordinator: [''],
      dataManager: [''],
      
      // Regulatory & Compliance
      irbApprovalRequired: [true],
      consentRequired: [true],
      requiresElectronicSignatures: [true],
      auditTrailRequired: [true],
      dataIntegrityLevel: ['enhanced', Validators.required],
      dataRetentionPeriod: [120, [Validators.required, Validators.min(12)]],
      
      // Tags
      tags: [[]],
      
      // Phases/Sections
      sections: this.fb.array([])
    });
  }

  onClose(): void {
    if (this.isCreatingStudy) {
      return; // Don't allow closing while creating
    }
    
    if (this.studyCreationForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) {
        return;
      }
    }
    
    this.close.emit();
    this.studyCreationForm.reset();
  }

  onSubmit(): void {
    if (this.studyCreationForm.invalid) {
      Object.keys(this.studyCreationForm.controls).forEach(key => {
        const control = this.studyCreationForm.get(key);
        if (control && control.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.isCreatingStudy = true;
    const formValue = this.studyCreationForm.value;
    
    const newStudy: Partial<Study> = {
      // Basic Information
      title: formValue.title,
      protocolNumber: formValue.protocolNumber,
      shortTitle: formValue.shortTitle,
      description: formValue.description,
      version: formValue.version,
      
      // Study Classification
      phase: formValue.phase,
      studyType: formValue.studyType,
      therapeuticArea: formValue.therapeuticArea,
      indication: formValue.indication,
      
      // Status and Timeline
      status: formValue.status,
      plannedStartDate: formValue.plannedStartDate ? new Date(formValue.plannedStartDate) : undefined,
      plannedEndDate: formValue.plannedEndDate ? new Date(formValue.plannedEndDate) : undefined,
      
      // Enrollment
      plannedEnrollment: formValue.plannedEnrollment,
      actualEnrollment: formValue.actualEnrollment,
      enrollmentStatus: formValue.enrollmentStatus || 'not_started' as const,
      
      // Study Team
      principalInvestigator: formValue.principalInvestigator,
      studyCoordinator: formValue.studyCoordinator,
      dataManager: formValue.dataManager,
      
      // Regulatory & Compliance
      irbApprovalRequired: formValue.irbApprovalRequired,
      consentRequired: formValue.consentRequired,
      requiresElectronicSignatures: formValue.requiresElectronicSignatures,
      auditTrailRequired: formValue.auditTrailRequired,
      dataIntegrityLevel: formValue.dataIntegrityLevel,
      dataRetentionPeriod: formValue.dataRetentionPeriod,
      
      // Other fields
      tags: formValue.tags || [],
      sites: [],
      sections: this.processSections(formValue.sections),
      eligibilityCriteria: {
        inclusionCriteria: [],
        exclusionCriteria: []
      }
    };

    this.create.emit(newStudy as Study);
    this.isCreatingStudy = false;
    this.studyCreationForm.reset();
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }
  
  // Helper methods for display labels
  getPhaseLabel(phase: string): string {
    const phaseLabels: { [key: string]: string } = {
      'phase_i': 'Phase I',
      'phase_ii': 'Phase II',
      'phase_iii': 'Phase III',
      'phase_iv': 'Phase IV',
      'pre_clinical': 'Pre-Clinical',
      'pilot': 'Pilot Study',
      'feasibility': 'Feasibility Study'
    };
    return phaseLabels[phase] || phase;
  }
  
  getStudyTypeLabel(type: string): string {
    const typeLabels: { [key: string]: string } = {
      'interventional': 'Interventional',
      'observational': 'Observational',
      'registry': 'Registry',
      'expanded_access': 'Expanded Access'
    };
    return typeLabels[type] || type;
  }

  // Load available templates
  private async loadAvailableTemplates(): Promise<void> {
    try {
      // First try the observable
      this.formTemplateService.templates$.subscribe(templates => {
        console.log('[StudyCreationModal] Templates from observable:', templates);
        if (templates && templates.length > 0) {
          this.availableTemplates = templates;
          console.log('[StudyCreationModal] Set availableTemplates from observable:', this.availableTemplates);
        }
      });
      
      // Also try direct fetch as fallback
      setTimeout(async () => {
        if (!this.availableTemplates || this.availableTemplates.length === 0) {
          const allTemplates = await this.formTemplateService.getAllTemplates();
          console.log('[StudyCreationModal] Templates from getAllTemplates:', allTemplates);
          if (allTemplates && allTemplates.length > 0) {
            this.availableTemplates = allTemplates;
            console.log('[StudyCreationModal] Set availableTemplates from direct fetch:', this.availableTemplates);
          }
        }
      }, 1000);
    } catch (error) {
      console.error('[StudyCreationModal] Error loading templates:', error);
    }
  }
  
  // Auto-login with test account for debugging
  private async autoLoginForTesting(): Promise<void> {
    // Skip auto-login for now - user can manually register/login
    console.log('[StudyCreationModal] Skipping auto-login, user should manually register/login');
  }
  
  // Create sample templates if none exist
  private async createSampleTemplatesIfNeeded(): Promise<void> {
    try {
      const templates = await this.formTemplateService.getAllTemplates();
      if (templates.length === 0) {
        console.log('[StudyCreationModal] No templates found, creating sample templates...');
        
        // Sample template data
        const sampleTemplates: Partial<FormTemplate>[] = [
          {
            name: 'Patient Demographics Form',
            description: 'Basic patient demographic information collection',
            version: 1,
            status: 'published',
            templateType: 'form',
            isPatientTemplate: false,
            isStudySubjectTemplate: false,
            category: 'Demographics',
            fields: [
              {
                id: 'field1',
                name: 'firstName',
                label: 'First Name',
                type: 'text',
                required: true,
                order: 1,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: false
              },
              {
                id: 'field2',
                name: 'lastName',
                label: 'Last Name',
                type: 'text',
                required: true,
                order: 2,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: false
              },
              {
                id: 'field3',
                name: 'dateOfBirth',
                label: 'Date of Birth',
                type: 'date',
                required: true,
                order: 3,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: true,
                auditRequired: false
              }
            ]
          },
          {
            name: 'Vital Signs Form',
            description: 'Record patient vital signs',
            version: 1,
            status: 'published',
            templateType: 'form',
            isPatientTemplate: false,
            isStudySubjectTemplate: false,
            category: 'Clinical',
            fields: [
              {
                id: 'field1',
                name: 'bloodPressure',
                label: 'Blood Pressure',
                type: 'text',
                required: true,
                order: 1,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: true
              },
              {
                id: 'field2',
                name: 'heartRate',
                label: 'Heart Rate',
                type: 'number',
                required: true,
                order: 2,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: true
              },
              {
                id: 'field3',
                name: 'temperature',
                label: 'Temperature',
                type: 'number',
                required: true,
                order: 3,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: true
              }
            ]
          },
          {
            name: 'Adverse Event Report',
            description: 'Report adverse events during study',
            version: 1,
            status: 'published',
            templateType: 'form',
            isPatientTemplate: false,
            isStudySubjectTemplate: false,
            category: 'Safety',
            fields: [
              {
                id: 'field1',
                name: 'eventDate',
                label: 'Event Date',
                type: 'date',
                required: true,
                order: 1,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: true
              },
              {
                id: 'field2',
                name: 'eventDescription',
                label: 'Event Description',
                type: 'textarea',
                required: true,
                order: 2,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: true
              },
              {
                id: 'field3',
                name: 'severity',
                label: 'Severity',
                type: 'select',
                required: true,
                order: 3,
                readonly: false,
                hidden: false,
                validationRules: [],
                isPhiField: false,
                auditRequired: true,
                options: [
                  { value: 'mild', label: 'Mild' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'severe', label: 'Severe' }
                ]
              }
            ]
          }
        ];
        
        // Create templates
        for (const template of sampleTemplates) {
          await this.formTemplateService.createTemplate(template as FormTemplate);
        }
        
        console.log('[StudyCreationModal] Sample templates created');
        // Reload templates
        await this.loadAvailableTemplates();
      }
    } catch (error) {
      console.error('[StudyCreationModal] Error creating sample templates:', error);
    }
  }

  // Get sections FormArray
  get sectionsArray(): FormArray {
    return this.studyCreationForm.get('sections') as FormArray;
  }

  // Add a new section/phase
  addSection(): void {
    const sectionForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      type: ['visit', Validators.required],
      order: [this.sectionsArray.length + 1],
      scheduledDay: [null],
      windowStart: [null],
      windowEnd: [null],
      isOptional: [false],
      formTemplates: this.fb.array([])
    });
    
    this.sectionsArray.push(sectionForm);
  }

  // Remove a section
  removeSection(index: number): void {
    this.sectionsArray.removeAt(index);
    // Update order for remaining sections
    this.sectionsArray.controls.forEach((control, idx) => {
      control.get('order')?.setValue(idx + 1);
    });
  }

  // Get form templates array for a specific section
  getFormTemplatesArray(sectionIndex: number): FormArray {
    return this.sectionsArray.at(sectionIndex).get('formTemplates') as FormArray;
  }

  // Add template to section
  addTemplateToSection(sectionIndex: number, template: FormTemplate): void {
    const formTemplatesArray = this.getFormTemplatesArray(sectionIndex);
    
    // Check if template already exists
    const exists = formTemplatesArray.controls.some(control => 
      control.get('templateId')?.value === template.id
    );
    
    if (!exists) {
      formTemplatesArray.push(this.fb.group({
        templateId: [template.id, Validators.required],
        templateName: [template.name],
        templateVersion: [template.version || '1.0'],
        order: [formTemplatesArray.length],
        isRequired: [true],
        completionRequired: [true],
        daysToComplete: [null]
      }));
    }
  }
  
  // Helper method to handle template selection from dropdown
  onTemplateSelect(sectionIndex: number, selectElement: HTMLSelectElement): void {
    const templateId = selectElement.value;
    if (templateId) {
      const template = this.availableTemplates.find(t => t.id === templateId);
      if (template) {
        this.addTemplateToSection(sectionIndex, template);
        selectElement.value = ''; // Reset the select
      }
    }
  }

  // Get selected template IDs for a section
  getSelectedTemplateIds(sectionIndex: number): string[] {
    try {
      const formTemplates = this.getFormTemplatesArray(sectionIndex);
      return formTemplates.controls.map(control => control.get('templateId')?.value).filter(id => id);
    } catch (error) {
      console.error('[StudyCreationModal] Error getting selected template IDs:', error);
      return [];
    }
  }

  // Handle template selection from gallery
  onTemplateGallerySelect(sectionIndex: number, template: FormTemplate): void {
    console.log('[StudyCreationModal] Template selected:', template, 'for section:', sectionIndex);
    if (!template || !template.id) return;
    
    try {
      // Check if template is already added
      const existingTemplates = this.getSelectedTemplateIds(sectionIndex);
      if (existingTemplates.includes(template.id)) {
        // Remove template if already selected
        const templateIndex = this.getFormTemplatesArray(sectionIndex).controls
          .findIndex(control => control.get('templateId')?.value === template.id);
        if (templateIndex >= 0) {
          this.removeTemplateFromSection(sectionIndex, templateIndex);
        }
      } else {
        // Add template
        this.addTemplateToSection(sectionIndex, template);
      }
    } catch (error) {
      console.error('[StudyCreationModal] Error handling template selection:', error);
    }
  }

  // Remove template from section
  removeTemplateFromSection(sectionIndex: number, templateIndex: number): void {
    const templatesArray = this.getFormTemplatesArray(sectionIndex);
    templatesArray.removeAt(templateIndex);
    
    // Update order for remaining templates
    templatesArray.controls.forEach((control, idx) => {
      control.get('order')?.setValue(idx + 1);
    });
  }

  // Toggle template requirement
  toggleTemplateRequired(sectionIndex: number, templateIndex: number): void {
    const templatesArray = this.getFormTemplatesArray(sectionIndex);
    const templateControl = templatesArray.at(templateIndex);
    const currentValue = templateControl.get('isRequired')?.value;
    templateControl.get('isRequired')?.setValue(!currentValue);
  }

  // Navigate between steps
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

  // Check if current step is valid
  isStepValid(step: number): boolean {
    switch (step) {
      case 1:
        // Basic info validation
        const basicControls = ['title', 'protocolNumber', 'description', 'phase', 'status', 
                             'therapeuticArea', 'indication', 'plannedEnrollment', 'principalInvestigator'];
        return basicControls.every(controlName => 
          this.studyCreationForm.get(controlName)?.valid ?? false
        );
      case 2:
        // Step 2 is optional - sections are not required
        // If sections exist, they must be valid
        if (this.sectionsArray.length === 0) {
          return true; // Allow proceeding without sections
        }
        return this.sectionsArray.controls.every(section => section.valid);
      case 3:
        // Review step - always valid if reached
        return true;
      default:
        return false;
    }
  }
  
  // Get validation message for current step
  getStepValidationMessage(): string {
    if (this.isStepValid(this.currentStep)) {
      return '';
    }
    
    switch (this.currentStep) {
      case 1:
        return 'Please fill in all required fields before proceeding.';
      case 2:
        if (this.sectionsArray.length > 0) {
          return 'Please complete all section details (name and type are required).';
        }
        return '';
      default:
        return '';
    }
  }

  // Process sections from form to match EnhancedStudySection interface
  private processSections(sectionsFormValue: any[]): EnhancedStudySection[] {
    return sectionsFormValue.map((section, index) => ({
      id: '', // Will be generated by backend
      studyId: '', // Will be set by backend
      name: section.name,
      description: section.description,
      type: section.type,
      order: section.order,
      scheduledDay: section.scheduledDay,
      windowStart: section.windowStart,
      windowEnd: section.windowEnd,
      isOptional: section.isOptional,
      allowUnscheduled: false,
      status: 'not_started' as const,
      completionCriteria: {
        allFormsRequired: true,
        reviewRequired: false,
        signatureRequired: false
      },
      formTemplates: section.formTemplates.map((template: any, tIndex: number) => ({
        id: '', // Will be generated
        templateId: template.templateId,
        templateName: template.templateName,
        templateVersion: template.templateVersion,
        order: template.order,
        isRequired: template.isRequired,
        completionRequired: template.completionRequired,
        signatureRequired: false,
        reviewRequired: false,
        daysToComplete: template.daysToComplete
      })),
      formInstances: [],
      totalPatients: 0,
      patientsCompleted: 0,
      patientsInProgress: 0,
      patientsOverdue: 0,
      createdBy: '', // Will be set by backend
      createdAt: new Date(),
      lastModifiedBy: '', // Will be set by backend
      lastModifiedAt: new Date()
    }));
  }
}
