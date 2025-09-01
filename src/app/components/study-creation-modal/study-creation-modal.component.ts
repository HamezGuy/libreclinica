import { Component, EventEmitter, Input, Output, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { Study, StudySection, EnhancedStudySection, StudySectionFormTemplate } from '../../models/study.model';
import { FormTemplate } from '../../models/form-template.model';
import { FormTemplateService } from '../../services/form-template.service';
import { StudyService } from '../../services/study.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { firstValueFrom, take } from 'rxjs';
import { TemplateGalleryComponent } from '../template-gallery/template-gallery.component';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-study-creation-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TemplateGalleryComponent, TranslatePipe],
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
  
  // Additional lock to prevent any actions during creation
  private creationLock = false;


  async ngOnInit(): Promise<void> {
    console.log('[StudyCreationModal] Component initializing...');
    this.initializeForm();
    console.log('[StudyCreationModal] Form initialized');
    
    // Auto-login for testing
    await this.autoLoginForTesting();
    
    console.log('[StudyCreationModal] Loading templates...');
    this.loadAvailableTemplates();
    console.log('[StudyCreationModal] Component initialization complete');
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
      plannedStartDate: [null, Validators.required],
      plannedEndDate: [null, Validators.required],
      
      // Enrollment
      plannedEnrollment: [null, [Validators.required, Validators.min(1)]],
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
    if (this.isCreatingStudy || this.creationLock) {
      console.log('[StudyCreationModal] Cannot close - study creation in progress');
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
    this.currentStep = 1;
    this.isCreatingStudy = false;
    this.creationLock = false;
  }

  async onSubmit(): Promise<void> {
    console.log('[StudyCreationModal] ========== STUDY CREATION STARTED ==========');
    console.log('[StudyCreationModal] Current step:', this.currentStep);
    console.log('[StudyCreationModal] Form valid:', this.studyCreationForm.valid);
    console.log('[StudyCreationModal] Form value:', this.studyCreationForm.value);
    
    // Only submit on final step
    if (this.currentStep !== 3) {
      console.log('[StudyCreationModal] Not on final step, returning');
      return;
    }
    
    // Prevent duplicate submissions
    if (this.isCreatingStudy || this.creationLock) {
      console.log('[StudyCreationModal] Study creation already in progress - ignoring duplicate request');
      console.log('[StudyCreationModal] isCreatingStudy:', this.isCreatingStudy, 'creationLock:', this.creationLock);
      return;
    }
    
    // Set both locks to prevent any duplicate submissions
    this.isCreatingStudy = true;
    this.creationLock = true;
    console.log('[StudyCreationModal] Locks set - proceeding with creation');
    
    const formValue = this.studyCreationForm.value;
    console.log('[StudyCreationModal] Form values extracted:', formValue);
    
    // Build the new study object with all required fields
    const newStudy: any = {
      // Basic Info
      protocolNumber: formValue.protocolNumber,
      title: formValue.title,
      shortTitle: formValue.shortTitle,
      description: formValue.description,
      
      // Classification
      phase: formValue.phase,
      studyType: formValue.studyType,
      therapeuticArea: formValue.therapeuticArea,
      indication: formValue.indication,
      
      // Timeline
      plannedStartDate: formValue.plannedStartDate,
      plannedEndDate: formValue.plannedEndDate,
      actualStartDate: formValue.actualStartDate,
      actualEndDate: formValue.actualEndDate,
      
      // Enrollment
      plannedEnrollment: formValue.plannedEnrollment || 0,
      actualEnrollment: formValue.actualEnrollment || 0,
      enrollmentStatus: formValue.enrollmentStatus || 'not_started',
      
      // Team
      principalInvestigator: formValue.principalInvestigator,
      studyCoordinator: formValue.studyCoordinator,
      sponsor: formValue.sponsor,
      cro: formValue.cro,
      
      // Regulatory
      irbApprovalNumber: formValue.irbApprovalNumber,
      irbApprovalDate: formValue.irbApprovalDate,
      regulatoryStatus: formValue.regulatoryStatus || 'pending',
      
      // Status
      status: 'planning',
      isActive: true,
      
      // Sections/Phases - these will be created as separate phase documents
      sections: formValue.sections || [],
      
      // Sites
      sites: formValue.sites || [],
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
    
    // Log the final study object for debugging
    console.log('[StudyCreationModal] Study object before cleaning:', newStudy);
    console.log('[StudyCreationModal] Number of sections/phases:', newStudy.sections?.length || 0);
    
    // Ensure no undefined values exist
    const cleanedStudy = this.removeUndefinedFields(newStudy);
    console.log('[StudyCreationModal] Cleaned study object:', cleanedStudy);
    
    try {
      console.log('[StudyCreationModal] Creating study directly in modal...');
      console.log('[StudyCreationModal] Calling studyService.createStudy() with:', cleanedStudy);
      
      // Create the study directly here instead of emitting to parent
      const createdStudy = await this.studyService.createStudy(cleanedStudy);
      
      console.log('[StudyCreationModal] ✅ Study created successfully:', createdStudy);
      console.log('[StudyCreationModal] Study ID:', createdStudy?.id);
      console.log('[StudyCreationModal] Phase IDs:', createdStudy?.phaseIds);
      console.log('[StudyCreationModal] Full created study object:', JSON.stringify(createdStudy, null, 2));
      
      if (!createdStudy || !createdStudy.id) {
        throw new Error('Study creation failed - no ID returned');
      }
      
      // Show success message
      alert(`Study "${createdStudy.title}" created successfully with ${cleanedStudy.sections?.length || 0} phases!`);
      
      // Emit the created study for parent to refresh
      this.create.emit(createdStudy);
      
      // Reset state and close modal after emitting
      this.resetCreationState();
      this.close.emit();
      
    } catch (error) {
      console.error('[StudyCreationModal] ❌ Error creating study:', error);
      console.error('[StudyCreationModal] Error details:', {
        message: (error as any).message,
        stack: (error as any).stack,
        code: (error as any).code
      });
      
      // Reset locks on error to allow retry
      this.isCreatingStudy = false;
      this.creationLock = false;
      
      alert('Error creating study: ' + ((error as any).message || 'Unknown error'));
    }
    
    console.log('[StudyCreationModal] ========== STUDY CREATION ENDED ==========');
  }
  
  // Public method to reset creation state after parent handles the creation
  resetCreationState(): void {
    this.isCreatingStudy = false;
    this.creationLock = false;
    this.currentStep = 1;
    this.studyCreationForm.reset();
    this.initializeForm();
    console.log('[StudyCreationModal] Creation state reset');
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
    console.log('[StudyCreationModal] Loading templates...');
    try {
      // Use take(1) to avoid repeated subscriptions causing infinite loops
      this.formTemplateService.templates$.pipe(
        take(1)
      ).subscribe((templates: FormTemplate[]) => {
        console.log('[StudyCreationModal] Templates from observable:', templates);
        console.log('[StudyCreationModal] Template count:', templates?.length || 0);
        if (templates && templates.length > 0) {
          this.availableTemplates = templates;
          console.log('[StudyCreationModal] Available templates set:', this.availableTemplates.map(t => ({
            id: t.id,
            name: t.name,
            version: t.version
          })));
        } else {
          console.warn('[StudyCreationModal] No templates received from observable');
        }
      });
      
      // Fallback: try direct fetch if no templates after short delay
      setTimeout(async () => {
        if (!this.availableTemplates || this.availableTemplates.length === 0) {
          console.log('[StudyCreationModal] No templates yet, trying direct fetch...');
          try {
            const allTemplates = await this.formTemplateService.getAllTemplates();
            console.log('[StudyCreationModal] Direct fetch result:', allTemplates);
            if (allTemplates && allTemplates.length > 0) {
              this.availableTemplates = allTemplates;
              console.log('[StudyCreationModal] Templates loaded via direct fetch:', allTemplates.map(t => ({
                id: t.id,
                name: t.name,
                version: t.version
              })));
            } else {
              console.warn('[StudyCreationModal] No templates from direct fetch either');
            }
          } catch (err) {
            console.error('[StudyCreationModal] Failed to fetch templates directly:', err);
          }
        } else {
          console.log('[StudyCreationModal] Templates already loaded, skipping direct fetch');
        }
      }, 500);
    } catch (error) {
      console.error('[StudyCreationModal] Error in loadAvailableTemplates:', error);
    }
  }
  
  // Auto-login with test account for debugging
  private async autoLoginForTesting(): Promise<void> {
    // Skip auto-login for now - user can manually register/login
    console.log('[StudyCreationModal] Skipping auto-login, user should manually register/login');
  }
  
  // Removed sample template creation - no mock data needed

  // Get sections FormArray
  get sectionsArray(): FormArray {
    return this.studyCreationForm.get('sections') as FormArray;
  }

  // Add a new section/phase
  addSection(): void {
    // Block actions during creation
    if (this.isCreatingStudy || this.creationLock) {
      console.log('[StudyCreationModal] Action blocked - study creation in progress');
      return;
    }
    const sectionForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      type: ['visit', Validators.required],
      order: [this.sectionsArray.length + 1],
      scheduledDay: [null, [Validators.required, Validators.min(0)]],
      windowStart: [null],
      windowEnd: [null],
      isOptional: [false],
      formTemplates: this.fb.array([])
    });
    
    this.sectionsArray.push(sectionForm);
  }

  // Remove a section
  removeSection(index: number): void {
    // Block actions during creation
    if (this.isCreatingStudy || this.creationLock) {
      console.log('[StudyCreationModal] Action blocked - study creation in progress');
      return;
    }
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
        templateVersion: [template.version || '1.0'],
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
    // Block navigation during creation
    if (this.isCreatingStudy || this.creationLock) {
      console.log('[StudyCreationModal] Navigation blocked - study creation in progress');
      return;
    }
    // Mark all controls as touched to trigger validation display
    if (this.currentStep === 1) {
      // Mark basic info fields as touched
      const requiredFields = ['title', 'protocolNumber', 'description', 'version', 'phase', 
                            'studyType', 'therapeuticArea', 'indication', 'status', 'plannedEnrollment'];
      requiredFields.forEach(field => {
        const control = this.studyCreationForm.get(field);
        if (control) {
          control.markAsTouched();
          control.updateValueAndValidity();
        }
      });
    } else if (this.currentStep === 2) {
      // Mark all section controls as touched
      this.sectionsArray.controls.forEach(section => {
        section.get('name')?.markAsTouched();
        section.get('type')?.markAsTouched();
        section.get('name')?.updateValueAndValidity();
        section.get('type')?.updateValueAndValidity();
      });
    }
    
    if (!this.isStepValid(this.currentStep)) {
      console.log('[StudyCreationModal] Cannot proceed - step invalid');
      this.debugValidation();
      // Show validation message to user
      const message = this.getStepValidationMessage();
      if (message) {
        alert(message);
      }
      return;
    }
    
    if (this.isStepValid(this.currentStep) && this.currentStep < 3) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    // Block navigation during creation
    if (this.isCreatingStudy || this.creationLock) {
      console.log('[StudyCreationModal] Navigation blocked - study creation in progress');
      return;
    }
    
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  // Check if current step is valid
  isStepValid(step: number): boolean {
    switch (step) {
      case 1:
        // Check all required fields for basic information
        const requiredFields = ['title', 'protocolNumber', 'description', 'version', 
                              'phase', 'studyType', 'therapeuticArea', 'indication', 
                              'status', 'plannedEnrollment', 'plannedStartDate', 'plannedEndDate'];
        
        const allValid = requiredFields.every(field => {
          const control = this.studyCreationForm.get(field);
          const isValid = control?.valid || false;
          if (!isValid) {
            console.log(`[StudyCreationModal] Field '${field}' is invalid:`, {
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
          
          // Additional validation for phase configuration
          const scheduledDay = section.get('scheduledDay')?.value;
          const hasScheduling = scheduledDay !== null && scheduledDay !== undefined && scheduledDay >= 0;
          
          const hasRequiredFields = !!name && !!type && hasTemplates && hasScheduling;
          
          // Log validation details
          if (!hasRequiredFields) {
            console.log(`[StudyCreationModal] Phase ${index + 1} validation failed:`, {
              name: name || 'MISSING',
              type: type || 'MISSING',
              nameValid: section.get('name')?.valid,
              typeValid: section.get('type')?.valid,
              scheduledDay: scheduledDay || 'MISSING',
              hasScheduling: hasScheduling,
              formTemplates: templatesArray?.length || 0,
              hasTemplates: hasTemplates,
              details: 'Each phase requires: name, type, scheduled day, and at least one template'
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
        // List specific missing fields
        const requiredFields = ['title', 'protocolNumber', 'description', 'version', 'phase', 
                              'studyType', 'therapeuticArea', 'indication', 'status', 'plannedEnrollment',
                              'plannedStartDate', 'plannedEndDate'];
        const missingFields = requiredFields.filter(field => {
          const control = this.studyCreationForm.get(field);
          return !control?.valid;
        });
        
        if (missingFields.length > 0) {
          const fieldLabels = missingFields.map(field => this.getFieldLabel(field));
          return `Please fill in the following required fields: ${fieldLabels.join(', ')}`;
        }
        return 'Please fill in all required fields before proceeding.';
        
      case 2:
        if (this.sectionsArray.length === 0) {
          return '⚠️ No phases configured. Please add at least one phase to define your study structure.\n\n' +
                 'Each phase should include:\n' +
                 '• A descriptive name (e.g., "Screening Visit", "Baseline")\n' +
                 '• Phase type (Visit, Screening, Treatment, etc.)\n' +
                 '• Scheduled day (when this phase occurs)\n' +
                 '• At least one form template';
        }
        
        // Check each section for specific validation errors
        const invalidSections: string[] = [];
        let hasTemplateIssues = false;
        let hasSchedulingIssues = false;
        
        this.sectionsArray.controls.forEach((section, index) => {
          const errors: string[] = [];
          const warnings: string[] = [];
          
          // Check for missing required fields
          if (!section.get('name')?.value) {
            errors.push('Phase name');
          }
          if (!section.get('type')?.value) {
            errors.push('Phase type');
          }
          
          // Check for scheduling
          const scheduledDay = section.get('scheduledDay')?.value;
          if (scheduledDay === null || scheduledDay === undefined || scheduledDay < 0) {
            errors.push('Scheduled day');
            hasSchedulingIssues = true;
          }
          
          // Check for templates
          const templatesArray = section.get('formTemplates') as FormArray;
          if (!templatesArray || templatesArray.length === 0) {
            errors.push('At least one form template');
            hasTemplateIssues = true;
          } else {
            // Check if templates have proper configuration
            let hasRequiredTemplate = false;
            templatesArray.controls.forEach(template => {
              if (template.get('isRequired')?.value) {
                hasRequiredTemplate = true;
              }
            });
            if (!hasRequiredTemplate) {
              warnings.push('Consider marking at least one template as required');
            }
          }
          
          if (errors.length > 0) {
            invalidSections.push(`📋 Phase ${index + 1} needs: ${errors.join(', ')}`);
          } else if (warnings.length > 0) {
            invalidSections.push(`💡 Phase ${index + 1}: ${warnings.join(', ')}`);
          }
        });
        
        if (invalidSections.length > 0) {
          let message = '⚠️ Please complete the following before proceeding:\n\n';
          message += invalidSections.join('\n');
          
          if (hasTemplateIssues) {
            message += '\n\n📝 Template Assignment Required:\n';
            message += 'Each phase must have at least one form template assigned.\n';
            message += 'Use the template gallery below each phase to select forms.';
          }
          
          if (hasSchedulingIssues) {
            message += '\n\n📅 Scheduling Required:\n';
            message += 'Specify when each phase occurs (Day 0 = Study start).\n';
            message += 'You can also set visit windows for flexibility.';
          }
          
          return message;
        }
        return 'Please complete all phases before proceeding.';
      case 3:
        return '';
      default:
        return 'Please complete the current step before proceeding.';
    }
  }
  
  // Helper method to get user-friendly field labels
  private getFieldLabel(field: string): string {
    const labels: { [key: string]: string } = {
      'title': 'Study Title',
      'protocolNumber': 'Protocol Number',
      'description': 'Description',
      'version': 'Version',
      'phase': 'Study Phase',
      'studyType': 'Study Type',
      'therapeuticArea': 'Therapeutic Area',
      'indication': 'Indication',
      'status': 'Status',
      'plannedEnrollment': 'Planned Enrollment',
      'plannedStartDate': 'Planned Start Date',
      'plannedEndDate': 'Planned End Date'
    };
    return labels[field] || field;
  }

  // Process sections from form to match EnhancedStudySection interface
  processSections(sectionsFormValue: any[]): EnhancedStudySection[] {
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
  extractTemplateIds(templates: any[]): string[] {
    if (!templates || !Array.isArray(templates)) {
      return [];
    }
    
    return templates
      .map((template: any) => template.templateId || template.id || '')
      .filter(id => id !== '');
  }
  
  // Process form templates to ensure no undefined values
  processFormTemplates(templates: any[]): StudySectionFormTemplate[] {
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
