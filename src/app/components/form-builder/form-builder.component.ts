import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators, AbstractControl } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';

import { FormTemplate, FormField, FieldType, ValidationRule, FormFieldGroup, TemplateType, PhiFieldType, PhiClassification } from '../../models/form-template.model';
import { FormTemplateService } from '../../services/form-template.service';
import { FormValidationService } from '../../services/form-validation.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { AccessLevel } from '../../enums/access-levels.enum';
import { FormPreviewComponent } from '../form-preview/form-preview.component';

interface FieldTypeOption {
  type: FieldType;
  label: string;
  icon: string;
  description: string;
  category: 'basic' | 'advanced' | 'clinical';
}

interface ValidationRuleOption {
  type: string;
  label: string;
  description: string;
  hasValue: boolean;
  valueType: 'string' | 'number' | 'boolean';
}

@Component({
  selector: 'app-form-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, FormPreviewComponent],
  templateUrl: './form-builder.component.html',
  styleUrls: ['./form-builder.component.scss']
})
export class FormBuilderComponent implements OnInit, OnDestroy {
  @Input() templateId?: string;
  @Input() isModal = true;
  @Output() templateSaved = new EventEmitter<FormTemplate>();
  @Output() builderClosed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  // Form builder state
  builderForm: FormGroup;
  currentTemplate: FormTemplate | null = null;
  isLoading = false;
  isSaving = false;
  hasUnsavedChanges = false;

  // UI state
  activeTab: string = 'design';
  showFieldProperties: boolean = false;
  selectedField: FormField | null = null;
  draggedFieldType: FieldType | null = null;
  
  // Save feedback state
  saveMessage: string = '';
  saveMessageType: 'success' | 'error' | '' = '';
  saveMessageVisible: boolean = false;

  // Field types available in the toolbox
  fieldTypes: FieldTypeOption[] = [
    // Basic Fields
    { type: 'text', label: 'Text Input', icon: 'text_fields', description: 'Single line text input', category: 'basic' },
    { type: 'textarea', label: 'Text Area', icon: 'notes', description: 'Multi-line text input', category: 'basic' },
    { type: 'number', label: 'Number', icon: 'pin', description: 'Numeric input with validation', category: 'basic' },
    { type: 'email', label: 'Email', icon: 'email', description: 'Email address input', category: 'basic' },
    { type: 'phone', label: 'Phone', icon: 'phone', description: 'Phone number input', category: 'basic' },
    { type: 'date', label: 'Date', icon: 'event', description: 'Date picker input', category: 'basic' },
    { type: 'time', label: 'Time', icon: 'access_time', description: 'Time picker input', category: 'basic' },
    { type: 'datetime', label: 'Date & Time', icon: 'event_available', description: 'Date and time picker', category: 'basic' },
    
    // Advanced Fields
    { type: 'select', label: 'Dropdown', icon: 'arrow_drop_down', description: 'Single selection dropdown', category: 'advanced' },
    { type: 'multiselect', label: 'Multi-Select', icon: 'checklist', description: 'Multiple selection dropdown', category: 'advanced' },
    { type: 'radio', label: 'Radio Buttons', icon: 'radio_button_checked', description: 'Single choice from options', category: 'advanced' },
    { type: 'checkbox', label: 'Checkboxes', icon: 'check_box', description: 'Multiple choice from options', category: 'advanced' },
    { type: 'boolean', label: 'Yes/No', icon: 'toggle_on', description: 'Boolean toggle switch', category: 'advanced' },
    { type: 'file', label: 'File Upload', icon: 'upload_file', description: 'File attachment field', category: 'advanced' },
    { type: 'signature', label: 'E-Signature', icon: 'draw', description: 'Electronic signature capture', category: 'advanced' },
    
    // Clinical Fields
    { type: 'height', label: 'Height', icon: 'height', description: 'Height measurement with units', category: 'clinical' },
    { type: 'weight', label: 'Weight', icon: 'monitor_weight', description: 'Weight measurement with units', category: 'clinical' },
    { type: 'blood_pressure', label: 'Blood Pressure', icon: 'favorite', description: 'Systolic/Diastolic BP', category: 'clinical' },
    { type: 'temperature', label: 'Temperature', icon: 'thermostat', description: 'Body temperature with units', category: 'clinical' },
    { type: 'medication', label: 'Medication', icon: 'medication', description: 'Medication details form', category: 'clinical' },
    { type: 'diagnosis', label: 'Diagnosis', icon: 'local_hospital', description: 'Medical diagnosis with ICD codes', category: 'clinical' }
  ];

  // Validation rules available
  validationRules: ValidationRuleOption[] = [
    { type: 'required', label: 'Required', description: 'Field must be filled', hasValue: false, valueType: 'boolean' },
    { type: 'minLength', label: 'Minimum Length', description: 'Minimum character count', hasValue: true, valueType: 'number' },
    { type: 'maxLength', label: 'Maximum Length', description: 'Maximum character count', hasValue: true, valueType: 'number' },
    { type: 'min', label: 'Minimum Value', description: 'Minimum numeric value', hasValue: true, valueType: 'number' },
    { type: 'max', label: 'Maximum Value', description: 'Maximum numeric value', hasValue: true, valueType: 'number' },
    { type: 'pattern', label: 'Pattern', description: 'Regular expression pattern', hasValue: true, valueType: 'string' },
    { type: 'email', label: 'Email Format', description: 'Valid email address format', hasValue: false, valueType: 'boolean' },
    { type: 'phone', label: 'Phone Format', description: 'Valid phone number format', hasValue: false, valueType: 'boolean' },
    { type: 'date', label: 'Date Format', description: 'Valid date format', hasValue: false, valueType: 'boolean' },
    { type: 'custom', label: 'Custom Rule', description: 'Custom validation function', hasValue: true, valueType: 'string' }
  ];

  constructor(
    private fb: FormBuilder,
    private formTemplateService: FormTemplateService,
    private formValidationService: FormValidationService,
    private authService: EdcCompliantAuthService,
    private router: Router
  ) {
    this.builderForm = this.createBuilderForm();
  }

  ngOnInit(): void {
    this.setupFormChangeTracking();
    this.setupTemplateTypeListener();
    
    if (this.templateId) {
      console.log('Loading template with ID:', this.templateId);
      this.loadTemplate();
    } else {
      console.log('Creating new template');
      this.initializeNewTemplate();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createBuilderForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      category: ['', Validators.required],
      version: ['1.0.0', Validators.required],
      
      // Template Type Configuration
      templateType: ['form', Validators.required],
      isPatientTemplate: [false],
      isStudySubjectTemplate: [false],
      
      // PHI and Compliance Settings
      isPhiForm: [false],
      phiEncryptionEnabled: [false],
      phiAccessLogging: [true],
      phiDataMinimization: [true],
      hipaaCompliant: [false],
      gdprCompliant: [false],
      
      // Form Behavior
      requiresSignature: [false],
      allowPartialSave: [true],
      maxSubmissions: [null],
      expirationDate: [null],
      instructions: [''],
      
      // Form Structure
      fields: this.fb.array([]),
      fieldGroups: this.fb.array([]),
      conditionalLogic: this.fb.array([]),
      
      // Template Linking
      parentTemplateId: [null],
      childTemplateIds: this.fb.array([]),
      linkedTemplates: this.fb.array([]),
      
      // Healthcare API Configuration
      healthcareApiConfig: this.fb.group({
        projectId: ['data-entry-project-465905'],
        datasetId: ['edc-dataset'],
        fhirStoreId: ['edc-fhir-store'],
        encryptionKeyId: [null]
      }),
      fhirResourceType: [null],
      
      // PHI Retention Policy
      phiRetentionPolicy: this.fb.group({
        retentionPeriodDays: [2555],
        autoDeleteEnabled: [false],
        archiveBeforeDelete: [true]
      }),
      
      customCss: [''],
      metadata: this.fb.group({
        studyPhase: [''],
        therapeuticArea: [''],
        regulatoryRequirements: this.fb.array([]),
        dataRetentionPeriod: [2555], // 7 years in days
        backupFrequency: ['daily']
      })
    });
  }

  private setupFormChangeTracking(): void {
    this.builderForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.hasUnsavedChanges = true;
      });
  }

  private setupTemplateTypeListener(): void {
    this.builderForm.get('templateType')?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe((templateType: string) => {
      // Automatically set boolean flags based on template type
      switch (templateType) {
        case 'patient_template':
          this.builderForm.patchValue({
            isPatientTemplate: true,
            isStudySubjectTemplate: false
          }, { emitEvent: false });
          break;
        case 'study_subject':
          this.builderForm.patchValue({
            isPatientTemplate: false,
            isStudySubjectTemplate: true
          }, { emitEvent: false });
          break;
        case 'form':
        default:
          this.builderForm.patchValue({
            isPatientTemplate: false,
            isStudySubjectTemplate: false
          }, { emitEvent: false });
          break;
      }
    });
  }

  private async loadTemplate(): Promise<void> {
    if (!this.templateId) return;

    this.isLoading = true;
    try {
      console.log('Fetching template from service...');
      this.currentTemplate = await this.formTemplateService.getTemplate(this.templateId);
      console.log('Template loaded:', this.currentTemplate);
      if (this.currentTemplate) {
        this.populateForm(this.currentTemplate);
      } else {
        console.warn('No template found with ID:', this.templateId);
      }
    } catch (error) {
      console.error('Error loading template:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private initializeNewTemplate(): void {
    const newTemplate: Partial<FormTemplate> = {
      name: 'New Form Template',
      description: '',
      category: 'clinical',
      version: 1,
      status: 'draft',
      fields: [],
      fieldGroups: [],
      conditionalLogic: [],
      isPhiForm: false,
      requiresSignature: false,
      allowPartialSave: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.populateForm(newTemplate as FormTemplate);
  }

  private populateForm(template: FormTemplate): void {
    this.builderForm.patchValue({
      name: template.name,
      description: template.description,
      category: template.category,
      version: template.version,
      templateType: template.templateType || 'form',
      isPatientTemplate: template.isPatientTemplate || false,
      isStudySubjectTemplate: template.isStudySubjectTemplate || false,
      isPhiForm: template.isPhiForm,
      phiEncryptionEnabled: template.phiEncryptionEnabled || false,
      phiAccessLogging: template.phiAccessLogging || true,
      phiDataMinimization: template.phiDataMinimization || true,
      hipaaCompliant: template.hipaaCompliant || false,
      requiresSignature: template.requiresSignature,
      allowPartialSave: template.allowPartialSave,
      maxSubmissions: template.maxSubmissions,
      expirationDate: template.expirationDate,
      instructions: template.instructions,
      customCss: template.customCss,
      metadata: template.metadata
    });

    // Populate fields
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    fieldsArray.clear();
    template.fields?.forEach(field => {
      fieldsArray.push(this.createFieldFormGroup(field));
    });

    // Populate field groups
    const groupsArray = this.builderForm.get('fieldGroups') as FormArray;
    groupsArray.clear();
    template.fieldGroups?.forEach(group => {
      groupsArray.push(this.createFieldGroupFormGroup(group));
    });

    this.hasUnsavedChanges = false;
  }

  private createFieldFormGroup(field: FormField): FormGroup {
    return this.fb.group({
      id: [field.id || this.generateFieldId()],
      name: [field.name, Validators.required],
      label: [field.label, Validators.required],
      type: [field.type, Validators.required],
      placeholder: [field.placeholder || ''],
      helpText: [field.helpText || ''],
      defaultValue: [field.defaultValue],
      options: this.fb.array(field.options?.map(opt => this.fb.group({
        value: [opt.value],
        label: [opt.label],
        disabled: [opt.disabled || false]
      })) || []),
      validationRules: this.fb.array(field.validationRules?.map(rule => this.fb.group({
        type: [rule.type],
        value: [rule.value],
        message: [rule.message]
      })) || []),
      conditionalLogic: this.fb.array(field.conditionalLogic?.map(logic => this.fb.group({
        condition: [logic.condition],
        action: [logic.action],
        targetField: [logic.targetField],
        value: [logic.value]
      })) || []),
      isRequired: [field.isRequired || false],
      isReadonly: [field.isReadonly || false],
      isHidden: [field.isHidden || false],
      isPhiField: [field.isPhiField || false],
      auditRequired: [field.auditRequired || false],
      order: [field.order || 0],
      width: [field.width || 'full'],
      columnPosition: [field.columnPosition || 'left'],
      groupId: [field.groupId],
      customAttributes: this.fb.group(field.customAttributes || {}),
      auditTrail: this.fb.group({
        trackChanges: [field.auditTrail?.trackChanges || false],
        reasonRequired: [field.auditTrail?.reasonRequired || false]
      })
    });
  }

  private createFieldGroupFormGroup(group: FormFieldGroup): FormGroup {
    return this.fb.group({
      id: [group.id || this.generateGroupId()],
      name: [group.name, Validators.required],
      label: [group.label, Validators.required],
      description: [group.description || ''],
      isCollapsible: [group.isCollapsible || false],
      isCollapsed: [group.isCollapsed || false],
      isRepeatable: [group.isRepeatable || false],
      maxRepetitions: [group.maxRepetitions],
      order: [group.order || 0],
      conditionalLogic: this.fb.array(group.conditionalLogic?.map(logic => this.fb.group({
        condition: [logic.condition],
        action: [logic.action],
        targetField: [logic.targetField],
        value: [logic.value]
      })) || [])
    });
  }

  // Helper methods for template
  getFieldIcon(field: FormField): string {
    const fieldType = this.fieldTypes.find(ft => ft.type === field.type);
    return fieldType?.icon || 'text_fields';
  }

  getOptionsControls(fieldControl: AbstractControl): AbstractControl[] {
    const optionsArray = fieldControl.get('options');
    if (optionsArray && optionsArray instanceof FormArray) {
      return optionsArray.controls;
    }
    return [];
  }

  getValidationRulesControls(fieldControl: AbstractControl): AbstractControl[] {
    const rulesArray = fieldControl.get('validationRules');
    if (rulesArray && rulesArray instanceof FormArray) {
      return rulesArray.controls;
    }
    return [];
  }

  // Drag and drop handlers
  onFieldDrop(event: CdkDragDrop<any>): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    
    if (event.previousContainer === event.container) {
      // Reorder within the same container
      moveItemInArray(fieldsArray.controls, event.previousIndex, event.currentIndex);
      this.updateFieldOrders();
    } else {
      // Add new field from toolbox
      const fieldType = event.item.data as FieldType;
      if (fieldType) {
        const newField = this.createNewField(fieldType, event.currentIndex);
        const fieldFormGroup = this.createFieldFormGroup(newField);
        fieldsArray.insert(event.currentIndex, fieldFormGroup);
        this.updateFieldOrders();
        this.selectField(newField);
        this.hasUnsavedChanges = true;
      }
    }
  }

  // Click to add field (alternative to drag and drop)
  addFieldToCanvas(fieldType: FieldType): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const newField = this.createNewField(fieldType, fieldsArray.length);
    const fieldFormGroup = this.createFieldFormGroup(newField);
    fieldsArray.push(fieldFormGroup);
    this.updateFieldOrders();
    this.selectField(newField);
    this.hasUnsavedChanges = true;
  }

  private createNewField(type: FieldType, order: number): FormField {
    const fieldTypeOption = this.fieldTypes.find(ft => ft.type === type);
    
    return {
      id: this.generateFieldId(),
      name: `field_${Date.now()}`,
      label: fieldTypeOption?.label || 'New Field',
      type: type,
      placeholder: '',
      helpText: '',
      required: false,
      readonly: false,
      hidden: false,
      isRequired: false,
      isReadonly: false,
      isHidden: false,
      isPhiField: false,
      auditRequired: false,
      order: order,
      width: 'full', // Default to full width
      columnPosition: 'left', // Default to left column
      validationRules: [],
      conditionalLogic: [],
      options: type === 'select' || type === 'multiselect' || type === 'radio' || type === 'checkbox' 
        ? [{ value: 'option1', label: 'Option 1' }] 
        : undefined,
      auditTrail: {
        trackChanges: false,
        reasonRequired: false
      }
    };
  }

  private updateFieldOrders(): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    fieldsArray.controls.forEach((control, index) => {
      control.get('order')?.setValue(index);
    });
  }

  private generateFieldId(): string {
    return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateGroupId(): string {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Field selection and editing
  selectField(field: FormField): void {
    this.selectedField = field;
    this.showFieldProperties = true;
  }

  deleteField(index: number): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    fieldsArray.removeAt(index);
    this.updateFieldOrders();
    this.hasUnsavedChanges = true;
    
    if (this.selectedField && fieldsArray.length === 0) {
      this.selectedField = null;
      this.showFieldProperties = false;
    }
  }

  duplicateField(index: number): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const originalField = fieldsArray.at(index).value;
    const duplicatedField = { ...originalField, id: this.generateFieldId(), name: `${originalField.name}_copy` };
    const fieldFormGroup = this.createFieldFormGroup(duplicatedField);
    fieldsArray.insert(index + 1, fieldFormGroup);
    this.updateFieldOrders();
    this.hasUnsavedChanges = true;
  }

  // Template actions
  async saveTemplate(): Promise<void> {
    // First check basic form validity
    if (this.builderForm.invalid) {
      this.markFormGroupTouched(this.builderForm);
      this.showSaveMessage('Please fix validation errors before saving.', 'error');
      this.switchTab('form-info'); // Switch to form info tab to show errors
      return;
    }

    // Check for required fields and default values
    const formData = this.builderForm.value;
    const validationErrors: string[] = [];
    
    // Check template name
    if (!formData.name || formData.name.trim() === '') {
      validationErrors.push('Template name is required');
      this.builderForm.get('name')?.markAsTouched();
      this.builderForm.get('name')?.setErrors({ required: true });
    } else if (formData.name === 'New Form Template' || formData.name === 'Untitled Form') {
      validationErrors.push('Please provide a meaningful template name');
      this.builderForm.get('name')?.markAsTouched();
      this.builderForm.get('name')?.setErrors({ invalidValue: true });
    }
    
    // Check category
    if (!formData.category || formData.category.trim() === '') {
      validationErrors.push('Category is required');
      this.builderForm.get('category')?.markAsTouched();
      this.builderForm.get('category')?.setErrors({ required: true });
    }
    
    // Check version
    if (!formData.version || String(formData.version).trim() === '') {
      validationErrors.push('Version is required');
      this.builderForm.get('version')?.markAsTouched();
      this.builderForm.get('version')?.setErrors({ required: true });
    }
    
    // Check template type
    if (!formData.templateType || formData.templateType.trim() === '') {
      validationErrors.push('Template type is required');
      this.builderForm.get('templateType')?.markAsTouched();
      this.builderForm.get('templateType')?.setErrors({ required: true });
    }
    
    // If there are validation errors, show them and switch to form info tab
    if (validationErrors.length > 0) {
      const errorMessage = 'Please complete the following required fields:\n• ' + validationErrors.join('\n• ');
      this.showSaveMessage(errorMessage, 'error');
      this.switchTab('form-info'); // Switch to form info tab to show the fields with errors
      return;
    }

    this.isSaving = true;
    try {
      const formData = this.builderForm.value;
      
      // Clean up undefined values to prevent Firestore errors
      const cleanedFormData = this.cleanUndefinedValues(formData);
      
      const template: FormTemplate = {
        ...this.currentTemplate,
        ...cleanedFormData,
        id: this.currentTemplate?.id || this.generateTemplateId(),
        updatedAt: new Date(),
        createdBy: this.currentTemplate?.createdBy || (await this.authService.getCurrentUserProfile())?.uid || '',
        updatedBy: (await this.authService.getCurrentUserProfile())?.uid || ''
      };

      let savedTemplate: FormTemplate;
      if (this.currentTemplate?.id) {
        savedTemplate = await this.formTemplateService.updateTemplate(template.id!, template);
      } else {
        savedTemplate = await this.formTemplateService.createTemplate(template);
      }

      this.currentTemplate = savedTemplate;
      this.hasUnsavedChanges = false;
      this.templateSaved.emit(savedTemplate);
      this.showSaveMessage('Form template saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving template:', error);
      
      // Log user profile for debugging
      try {
        const userProfile = await this.authService.getCurrentUserProfile();
        console.log('Current user profile:', {
          uid: userProfile?.uid,
          email: userProfile?.email,
          accessLevel: userProfile?.accessLevel,
          status: userProfile?.status
        });
      } catch (profileError) {
        console.error('Failed to get user profile for debugging:', profileError);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.showSaveMessage(`Failed to save template: ${errorMessage}`, 'error');
    } finally {
      this.isSaving = false;
    }
  }

  async publishTemplate(): Promise<void> {
    if (!this.currentTemplate?.id) return;

    try {
      await this.formTemplateService.publishTemplate(this.currentTemplate.id);
      this.currentTemplate.status = 'published';
      this.hasUnsavedChanges = false;
    } catch (error) {
      console.error('Error publishing template:', error);
    }
  }

  previewTemplate(): void {
    this.activeTab = 'preview';
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any): void {
    if (this.hasUnsavedChanges) {
      $event.returnValue = true;
    }
  }

  // Field option management methods
  addOption(fieldIndex: number): void {
    const field = this.fieldsArray.at(fieldIndex);
    const optionsArray = field.get('options') as FormArray;
    
    const newOption = this.fb.group({
      value: [''],
      label: [''],
      disabled: [false]
    });
    
    optionsArray.push(newOption);
    this.hasUnsavedChanges = true;
  }

  removeOption(fieldIndex: number, optionIndex: number): void {
    const field = this.fieldsArray.at(fieldIndex);
    const optionsArray = field.get('options') as FormArray;
    
    optionsArray.removeAt(optionIndex);
    this.hasUnsavedChanges = true;
  }

  // Close the form builder without saving
  closeBuilder(): void {
    // Check for unsaved changes
    if (this.hasUnsavedChanges) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) return;
    }
    
    // If in modal mode, emit close event
    if (this.isModal) {
      this.close.emit();
      this.builderClosed.emit();
    } else {
      // Navigate back to dashboard or previous route
      this.router.navigate(['/dashboard']);
    }
  }

  // Utility methods
  private generateTemplateId(): string {
    return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  // Getters for template access
  get fieldsArray(): FormArray {
    return this.builderForm.get('fields') as FormArray;
  }

  get fieldGroupsArray(): FormArray {
    return this.builderForm.get('fieldGroups') as FormArray;
  }

  get canPublish(): boolean {
    return this.currentTemplate?.status === 'draft' && !this.hasUnsavedChanges;
  }

  get canSave(): boolean {
    return this.builderForm.valid && this.hasUnsavedChanges;
  }

  // Helper methods for template binding
  getFormFieldControls(): AbstractControl[] {
    return this.fieldsArray.controls;
  }

  getSelectedFieldControl(): FormGroup | null {
    if (this.selectedField) {
      const index = this.fieldsArray.controls.findIndex(control => 
        control.get('id')?.value === this.selectedField?.id
      );
      if (index >= 0) {
        return this.fieldsArray.controls[index] as FormGroup;
      }
    }
    return null;
  }

  onFieldReorder(event: CdkDragDrop<AbstractControl[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(this.fieldsArray.controls, event.previousIndex, event.currentIndex);
      this.updateFieldOrders();
    }
  }

  // Option management methods
  addOption(fieldIndex: number): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const fieldControl = fieldsArray.at(fieldIndex);
    const optionsArray = fieldControl.get('options') as FormArray;
    
    const newOption = this.fb.group({
      value: [`option${optionsArray.length + 1}`],
      label: [`Option ${optionsArray.length + 1}`],
      disabled: [false]
    });
    
    optionsArray.push(newOption);
    this.hasUnsavedChanges = true;
  }

  removeOption(fieldIndex: number, optionIndex: number): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const fieldControl = fieldsArray.at(fieldIndex);
    const optionsArray = fieldControl.get('options') as FormArray;
    
    optionsArray.removeAt(optionIndex);
    this.hasUnsavedChanges = true;
  }

  // Validation rule management methods
  addValidationRule(fieldIndex: number): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const fieldControl = fieldsArray.at(fieldIndex);
    const rulesArray = fieldControl.get('validationRules') as FormArray;
    
    const newRule = this.fb.group({
      type: [''],
      value: [''],
      message: ['']
    });
    
    rulesArray.push(newRule);
    this.hasUnsavedChanges = true;
  }

  removeValidationRule(fieldIndex: number, ruleIndex: number): void {
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const fieldControl = fieldsArray.at(fieldIndex);
    const rulesArray = fieldControl.get('validationRules') as FormArray;
    
    rulesArray.removeAt(ruleIndex);
    this.hasUnsavedChanges = true;
  }

  getValidationRule(type: string): ValidationRuleOption | undefined {
    return this.validationRules.find(rule => rule.type === type);
  }

  // Field type categories for toolbox organization
  get basicFields(): FieldTypeOption[] {
    return this.fieldTypes.filter(ft => ft.category === 'basic');
  }

  get advancedFields(): FieldTypeOption[] {
    return this.fieldTypes.filter(ft => ft.category === 'advanced');
  }

  get clinicalFields(): FieldTypeOption[] {
    return this.fieldTypes.filter(ft => ft.category === 'clinical');
  }

  // Tab management
  switchTab(tab: string): void {
    this.activeTab = tab;
  }

  // Helper method for template tab checking
  isActiveTab(tab: string): boolean {
    return this.activeTab === tab;
  }

  // Utility method to clean undefined values from form data
  private cleanUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanUndefinedValues(item));
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
          // Set default values for known fields that shouldn't be null
          if (key === 'maxSubmissions' && (obj[key] === null || obj[key] === undefined)) {
            cleaned[key] = 0; // Default to unlimited submissions
          } else {
            cleaned[key] = this.cleanUndefinedValues(obj[key]);
          }
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  // Method to show save feedback messages
  private showSaveMessage(message: string, type: 'success' | 'error'): void {
    this.saveMessage = message;
    this.saveMessageType = type;
    this.saveMessageVisible = true;
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.hideSaveMessage();
      }, 3000);
    }
  }

  // Method to hide save feedback messages
  hideSaveMessage(): void {
    this.saveMessageVisible = false;
    this.saveMessage = '';
    this.saveMessageType = '';
  }

  // Get current template data for live preview
  getCurrentTemplateData(): FormTemplate {
    const formValue = this.builderForm.value;
    return {
      id: this.currentTemplate?.id || '',
      name: formValue.name,
      description: formValue.description,
      version: formValue.version,
      templateType: formValue.type as TemplateType,
      category: formValue.category,
      status: this.currentTemplate?.status || 'draft',
      fields: formValue.fields,
      instructions: formValue.instructions,
      allowSavePartial: formValue.allowMultipleSubmissions || false,
      requiresReview: formValue.requireAuthentication || false,
      allowEditing: formValue.enableVersioning || true,
      maxSubmissions: formValue.maxSubmissions,
      createdBy: this.currentTemplate?.createdBy || '',
      createdAt: this.currentTemplate?.createdAt || new Date(),
      updatedAt: new Date(),
      updatedBy: this.currentTemplate?.updatedBy || '',
      tags: formValue.tags || [],
      changeHistory: this.currentTemplate?.changeHistory || [],
      // Required fields from model
      isPatientTemplate: false,
      isStudySubjectTemplate: false,
      sections: [],
      childTemplateIds: [],
      childFormIds: [],
      linkedTemplates: [],
      phiDataFields: [],
      hipaaCompliant: true,
      gdprCompliant: true,
      lastModifiedBy: '',
      requiresElectronicSignature: false,
      complianceRegions: [],
      phiEncryptionEnabled: true,
      phiAccessLogging: true,
      phiDataMinimization: true
    };
  }

  // Preview event handlers
  onPreviewDataChanged(data: any): void {
    // Handle preview data changes if needed
    console.log('Preview data changed:', data);
  }

  onPreviewSubmitted(instance: any): void {
    // Handle preview form submission
    console.log('Preview form submitted:', instance);
  }

  onPreviewSaved(instance: any): void {
    // Handle preview form save
    console.log('Preview form saved:', instance);
  }
}
