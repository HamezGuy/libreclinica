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
      plannedStartDate: ['', Validators.required],
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
    // CRITICAL: On step 3 (Review & Create), ALWAYS allow study creation
    if (this.currentStep === 3) {
      // Skip validation on final step - user can always create the study
      console.log('[StudyCreationModal] On Review & Create step - bypassing validation');
    } else if (this.studyCreationForm.invalid) {
      // For other steps, enforce validation
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
    
    // Build study object with ALL required fields from the Study model
    const newStudy: any = {
      // Basic Information (all required)
      title: formValue.title || '',
      protocolNumber: formValue.protocolNumber || '',
      description: formValue.description || '',
      version: formValue.version || '1.0',
      
      // Study Classification (all required)
      phase: formValue.phase || 'phase_i',
      studyType: formValue.studyType || 'interventional',
      therapeuticArea: formValue.therapeuticArea || '',
      indication: formValue.indication || '',
      
      // Status and Timeline
      status: formValue.status || 'planning',
      
      // Enrollment (all required)
      plannedEnrollment: formValue.plannedEnrollment || 0,
      actualEnrollment: formValue.actualEnrollment || 0,
      enrollmentStatus: formValue.enrollmentStatus || 'not_started',
      
      // Patient Management (required array)
      patientIds: [],
      
      // Enhanced Study Structure (all required arrays/objects)
      sections: this.processSections(formValue.sections || []),
      phases: [], // Empty array for now - phases different from sections
      phaseTransitionRules: [], // Empty array for now
      substudies: [], // Empty array for now
      studyGroups: [], // Empty array for now
      eligibilityCriteria: {
        inclusionCriteria: [],
        exclusionCriteria: []
      },
      sites: [], // Empty array for now
      
      // Regulatory Information (required arrays)
      regulatoryRequirements: [],
      irbApprovalRequired: formValue.irbApprovalRequired ?? true,
      consentRequired: formValue.consentRequired ?? true,
      
      // CFR 21 Part 11 Compliance
      requiresElectronicSignatures: formValue.requiresElectronicSignatures ?? true,
      auditTrailRequired: formValue.auditTrailRequired ?? true,
      dataIntegrityLevel: formValue.dataIntegrityLevel || 'enhanced',
      
      // Data Retention (all required)
      dataRetentionPeriod: formValue.dataRetentionPeriod || 120,
      archivalRequirements: [],
      
      // Audit and Compliance (all required)
      createdBy: '', // Will be set by backend
      createdAt: new Date(),
      lastModifiedBy: '', // Will be set by backend
      lastModifiedAt: new Date(),
      changeHistory: [],
      
      // Additional Metadata
      tags: formValue.tags || []
    };
    
    // Add optional fields only if they have values
    if (formValue.shortTitle) {
      newStudy.shortTitle = formValue.shortTitle;
    }
    
    // Study Team - only add if values exist
    if (formValue.principalInvestigator) {
      newStudy.principalInvestigator = formValue.principalInvestigator;
    }
    if (formValue.studyCoordinator) {
      newStudy.studyCoordinator = formValue.studyCoordinator;
    }
    if (formValue.dataManager) {
      newStudy.dataManager = formValue.dataManager;
    }
    
    // Add date fields only if they have values
    if (formValue.plannedStartDate) {
      newStudy.plannedStartDate = new Date(formValue.plannedStartDate);
    }
    if (formValue.plannedEndDate) {
      newStudy.plannedEndDate = new Date(formValue.plannedEndDate);
    }
    
    // Log the final study object for debugging
    console.log('[StudyCreationModal] Creating study with data:', newStudy);
    
    // Ensure no undefined values exist
    const cleanedStudy = this.removeUndefinedFields(newStudy);
    
    this.create.emit(cleanedStudy as Study);
    this.isCreatingStudy = false;
    // Don't reset form here - it causes data loss
  }
  
  // Helper method to remove undefined fields from an object
  private removeUndefinedFields(obj: any, path: string = 'root'): any {
    const cleaned: any = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const currentPath = `${path}.${key}`;
        
        if (value === undefined) {
          console.warn(`[StudyCreationModal] Removing undefined field at: ${currentPath}`);
        } else if (value === null) {
          console.warn(`[StudyCreationModal] Removing null field at: ${currentPath}`);
        } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          // Recursively clean nested objects
          cleaned[key] = this.removeUndefinedFields(value, currentPath);
        } else if (Array.isArray(value)) {
          // Clean arrays
          cleaned[key] = value.map((item, index) => {
            if (item === undefined || item === null) {
              console.warn(`[StudyCreationModal] Removing undefined/null array item at: ${currentPath}[${index}]`);
              return null;
            }
            if (typeof item === 'object' && !(item instanceof Date)) {
              return this.removeUndefinedFields(item, `${currentPath}[${index}]`);
            }
            return item;
          }).filter(item => item !== null);
        } else {
          cleaned[key] = value;
        }
      }
    }
    
    return cleaned;
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
    const section = this.sectionsArray.at(sectionIndex) as FormGroup;
    if (!section) {
      console.error('[StudyCreationModal] Section not found at index:', sectionIndex);
      return this.fb.array([]);
    }
    
    let formTemplates = section.get('formTemplates') as FormArray;
    if (!formTemplates) {
      // Initialize formTemplates if it doesn't exist
      formTemplates = this.fb.array([]);
      section.setControl('formTemplates', formTemplates);
    }
    
    return formTemplates;
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
        order: [formTemplatesArray.length + 1],
        isRequired: [false] // Add the missing isRequired field
      }));
      
      // Manually trigger validation update
      this.sectionsArray.at(sectionIndex).updateValueAndValidity();
      this.studyCreationForm.updateValueAndValidity();
      
      // Log for debugging
      console.log('[StudyCreationModal] Template added, form valid:', this.studyCreationForm.valid);
      console.log('[StudyCreationModal] Step 2 valid:', this.isStepValid(2));
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
  
  // Debug validation issues
  debugValidation(): void {
    console.log('[StudyCreationModal] Form validation debug:');
    console.log('Form valid:', this.studyCreationForm.valid);
    console.log('Form errors:', this.studyCreationForm.errors);
    
    this.sectionsArray.controls.forEach((section, index) => {
      console.log(`\nSection ${index + 1}:`);
      console.log('- Valid:', section.valid);
      console.log('- Errors:', section.errors);
      console.log('- Value:', section.value);
      
      // Check each control in the section
      const sectionGroup = section as FormGroup;
      Object.keys(sectionGroup.controls).forEach(key => {
        const control = sectionGroup.get(key);
        if (control && !control.valid) {
          console.log(`  ${key}: invalid`, {
            value: control.value,
            errors: control.errors
          });
        }
      });
      
      // Check form templates array specifically
      const templatesArray = section.get('formTemplates') as FormArray;
      if (templatesArray) {
        console.log(`- Templates count: ${templatesArray.length}`);
        templatesArray.controls.forEach((template, tIndex) => {
          if (!template.valid) {
            console.log(`  Template ${tIndex + 1}: invalid`, template.errors);
          }
        });
      }
    });
  }

  // Navigate between steps
  nextStep(): void {
    if (!this.isStepValid(this.currentStep)) {
      console.log('[StudyCreationModal] Cannot proceed - step invalid');
      this.debugValidation();
    }
    
    if (this.isStepValid(this.currentStep) && this.currentStep < 3) {
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
        // Basic info validation - only check required fields
        const requiredControls = ['title', 'protocolNumber', 'description', 'version', 'phase', 
                                'studyType', 'therapeuticArea', 'indication', 'status', 'plannedEnrollment'];
        const allValid = requiredControls.every(controlName => {
          const control = this.studyCreationForm.get(controlName);
          const isValid = control?.valid ?? false;
          if (!isValid) {
            console.log(`[StudyCreationModal] Field '${controlName}' is invalid:`, {
              value: control?.value,
              errors: control?.errors,
              touched: control?.touched
            });
          }
          return isValid;
        });
        return allValid;
      case 2:
        // Phases are required - at least one phase must be added
        if (this.sectionsArray.length === 0) {
          return false; // Require at least one phase
        }
        
        // Check each section individually
        const allSectionsValid = this.sectionsArray.controls.every((section, index) => {
          // A section is valid if it has name, type, AND at least one template
          const name = section.get('name')?.value;
          const type = section.get('type')?.value;
          const templatesArray = section.get('formTemplates') as FormArray;
          const hasTemplates = templatesArray && templatesArray.length > 0;
          
          const hasRequiredFields = !!name && !!type && hasTemplates;
          
          // Log validation details
          if (!hasRequiredFields) {
            console.log(`[StudyCreationModal] Section ${index + 1} validation failed:`, {
              name: name || 'MISSING',
              type: type || 'MISSING',
              nameValid: section.get('name')?.valid,
              typeValid: section.get('type')?.valid,
              formTemplates: templatesArray?.length || 0,
              hasTemplates: hasTemplates
            });
          }
          
          return hasRequiredFields;
        });
        
        return allSectionsValid;
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
        if (this.sectionsArray.length === 0) {
          return 'Please add at least one phase/section to continue.';
        }
        
        // Check each section for specific validation errors
        const invalidSections: string[] = [];
        this.sectionsArray.controls.forEach((section, index) => {
          const errors: string[] = [];
          
          // Check for missing required fields
          if (!section.get('name')?.value) {
            errors.push('name');
          }
          if (!section.get('type')?.value) {
            errors.push('type');
          }
          
          // Check for templates
          const templatesArray = section.get('formTemplates') as FormArray;
          if (!templatesArray || templatesArray.length === 0) {
            errors.push('at least one template');
          }
          
          if (errors.length > 0) {
            invalidSections.push(`Phase ${index + 1}: Missing ${errors.join(' and ')}`);
          }
        });
        
        if (invalidSections.length > 0) {
          return 'Please complete all required fields: ' + invalidSections.join('. ');
        }
        return 'Please complete all phase details.';
      default:
        return '';
    }
  }

  // Process sections from form to match EnhancedStudySection interface
  private processSections(sectionsFormValue: any[]): EnhancedStudySection[] {
    if (!sectionsFormValue || !Array.isArray(sectionsFormValue)) {
      return [];
    }
    
    return sectionsFormValue.map((section, index) => ({
      id: '', // Will be generated by backend
      studyId: '', // Will be set by backend
      name: section.name || '',
      description: section.description || '',
      type: section.type || 'screening',
      order: section.order ?? index + 1,
      scheduledDay: section.scheduledDay ?? 0,
      windowStart: section.windowStart ?? 0,
      windowEnd: section.windowEnd ?? 0,
      isOptional: section.isOptional ?? false,
      allowUnscheduled: false,
      status: 'not_started' as const,
      completionCriteria: {
        allFormsRequired: true,
        reviewRequired: false,
        signatureRequired: false
      },
      formTemplates: this.processFormTemplates(section.formTemplates || []),
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
  
  // Extract template IDs from form templates array
  private extractTemplateIds(templates: any[]): string[] {
    if (!templates || !Array.isArray(templates)) {
      return [];
    }
    
    return templates
      .map((template: any) => template.templateId || template.id || '')
      .filter(id => id !== '');
  }
  
  // Process form templates to ensure no undefined values
  private processFormTemplates(templates: any[]): StudySectionFormTemplate[] {
    if (!templates || !Array.isArray(templates)) {
      return [];
    }
    
    return templates.map((template: any, tIndex: number) => ({
      id: '', // Will be generated
      templateId: template.templateId || '',
      templateName: template.templateName || '',
      templateVersion: template.templateVersion || '1.0',
      order: template.order ?? tIndex + 1,
      isRequired: template.isRequired ?? true,
      completionRequired: template.completionRequired ?? true,
      signatureRequired: template.signatureRequired ?? false,
      reviewRequired: template.reviewRequired ?? false,
      daysToComplete: template.daysToComplete ?? 7
    }));
  }

  // Check if entire form is valid
  isFormValid(): boolean {
    // For the form to be valid:
    // 1. Basic form validation must pass
    // 2. Must have at least one section with at least one template
    
    if (!this.studyCreationForm.valid) {
      return false;
    }
    
    // Check sections
    if (!this.sectionsArray || this.sectionsArray.length === 0) {
      return false;
    }
    
    // Check if each section has at least one template
    const allSectionsHaveTemplates = this.sectionsArray.controls.every(section => {
      const templatesArray = section.get('formTemplates') as FormArray;
      return templatesArray && templatesArray.length > 0;
    });
    
    return allSectionsHaveTemplates;
  }
}
