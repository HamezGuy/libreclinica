import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators, AbstractControl } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';

import { FormTemplate, FormField, FieldType, ValidationRule, FormFieldGroup, TemplateType, PhiFieldType, PhiClassification } from '../../models/form-template.model';
import { FormTemplateService } from '../../services/form-template.service';
import { FormValidationService } from '../../services/form-validation.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { AccessLevel } from '../../enums/access-levels.enum';
import { FormPreviewComponent } from '../form-preview/form-preview.component';

interface FieldTypeOption {
  type: FieldType;
  label: string;
  translationKey: string;
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, FormPreviewComponent, TranslatePipe],
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

  // Clinical field unit states
  clinicalFieldUnits: { [fieldId: string]: 'metric' | 'imperial' } = {};
  
  // Unit configurations for clinical fields
  unitConfig = {
    height: {
      metric: { label: 'cm', min: 0, max: 300 },
      imperial: { label: 'in', min: 0, max: 120 }
    },
    weight: {
      metric: { label: 'kg', min: 0, max: 500 },
      imperial: { label: 'lbs', min: 0, max: 1100 }
    },
    temperature: {
      metric: { label: '°C', min: 30, max: 45 },
      imperial: { label: '°F', min: 86, max: 113 }
    },
    blood_pressure: {
      metric: { label: 'mmHg' },
      imperial: { label: 'mmHg' }
    }
  };

  // Field types available in the toolbox
  fieldTypes: FieldTypeOption[] = [
    // Basic Fields
    { type: 'text', label: 'Text Input', translationKey: 'text_input', icon: 'text_fields', description: 'Single line text input', category: 'basic' },
    { type: 'textarea', label: 'Text Area', translationKey: 'text_area', icon: 'notes', description: 'Multi-line text input', category: 'basic' },
    { type: 'number', label: 'Number', translationKey: 'number', icon: 'pin', description: 'Numeric input field', category: 'basic' },
    { type: 'email', label: 'Email', translationKey: 'email', icon: 'email', description: 'Email address input', category: 'basic' },
    { type: 'phone', label: 'Phone', translationKey: 'phone', icon: 'phone', description: 'Phone number input', category: 'basic' },
    { type: 'date', label: 'Date', translationKey: 'date', icon: 'calendar_today', description: 'Date picker field', category: 'basic' },
    { type: 'time', label: 'Time', translationKey: 'time', icon: 'access_time', description: 'Time picker with AM/PM', category: 'basic' },
    { type: 'datetime', label: 'Date & Time', translationKey: 'date_time', icon: 'event_available', description: 'Date and time picker', category: 'basic' },
    
    // Advanced Fields
    { type: 'select', label: 'Dropdown', translationKey: 'dropdown', icon: 'arrow_drop_down', description: 'Single selection dropdown', category: 'advanced' },
    { type: 'multiselect', label: 'Multi-Select', translationKey: 'multi_select', icon: 'checklist', description: 'Multiple selection dropdown', category: 'advanced' },
    { type: 'radio', label: 'Radio Buttons', translationKey: 'radio_buttons', icon: 'radio_button_checked', description: 'Single choice from options', category: 'advanced' },
    { type: 'checkbox', label: 'Checkboxes', translationKey: 'checkboxes', icon: 'check_box', description: 'Multiple choice from options', category: 'advanced' },
    { type: 'boolean', label: 'Yes/No', translationKey: 'yes_no', icon: 'toggle_on', description: 'Boolean toggle switch', category: 'advanced' },
    { type: 'file', label: 'File Upload', translationKey: 'file_upload', icon: 'upload_file', description: 'File attachment field', category: 'advanced' },
    { type: 'signature', label: 'E-Signature', translationKey: 'e_signature', icon: 'draw', description: 'Electronic signature capture', category: 'advanced' },
    
    // Clinical Fields
    { type: 'height', label: 'Height', translationKey: 'height', icon: 'height', description: 'Height measurement with units', category: 'clinical' },
    { type: 'weight', label: 'Weight', translationKey: 'weight', icon: 'monitor_weight', description: 'Weight measurement with units', category: 'clinical' },
    { type: 'blood_pressure', label: 'Blood Pressure', translationKey: 'blood_pressure', icon: 'favorite', description: 'Systolic/Diastolic BP', category: 'clinical' },
    { type: 'temperature', label: 'Temperature', translationKey: 'temperature', icon: 'thermostat', description: 'Body temperature with units', category: 'clinical' },
    { type: 'medication', label: 'Medication', translationKey: 'medication_field', icon: 'medication', description: 'Medication details form', category: 'clinical' },
    { type: 'diagnosis', label: 'Diagnosis', translationKey: 'diagnosis_field', icon: 'local_hospital', description: 'Medical diagnosis with ICD codes', category: 'clinical' }
  ];

  // Validation rules available
  validationRules: ValidationRuleOption[] = [
    { type: 'required', label: 'validation_required', description: 'Field must be filled', hasValue: false, valueType: 'boolean' },
    { type: 'minLength', label: 'validation_minlength', description: 'Minimum character count', hasValue: true, valueType: 'number' },
    { type: 'maxLength', label: 'validation_maxlength', description: 'Maximum character count', hasValue: true, valueType: 'number' },
    { type: 'min', label: 'validation_min', description: 'Minimum numeric value', hasValue: true, valueType: 'number' },
    { type: 'max', label: 'validation_max', description: 'Maximum numeric value', hasValue: true, valueType: 'number' },
    { type: 'pattern', label: 'validation_pattern', description: 'Regular expression pattern', hasValue: true, valueType: 'string' },
    { type: 'email', label: 'validation_email', description: 'Valid email address', hasValue: false, valueType: 'boolean' },
    { type: 'phone', label: 'validation_phone', description: 'Valid phone number', hasValue: false, valueType: 'boolean' },
    { type: 'dateRange', label: 'validation_date_range', description: 'Date within range', hasValue: true, valueType: 'string' },
    { type: 'custom', label: 'validation_custom', description: 'Custom validation logic', hasValue: true, valueType: 'string' }
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
      // Initialize clinical field units based on existing unit or default to metric
      if (['height', 'weight', 'temperature', 'blood_pressure'].includes(field.type)) {
        const isImperial = field.unit && (
          field.unit.includes('in') || 
          field.unit.includes('lbs') || 
          field.unit.includes('°F')
        );
        this.clinicalFieldUnits[field.id] = isImperial ? 'imperial' : 'metric';
      }
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
      auditTrail: this.fb.group({
        trackChanges: [field.auditTrail?.trackChanges || false],
        reasonRequired: [field.auditTrail?.reasonRequired || false]
      }),
      visibilityConditions: this.fb.array((field.visibilityConditions || []).map(condition => 
        this.fb.group({
          questionId: [condition.questionId || '', Validators.required],
          operator: [condition.operator || 'equals', Validators.required],
          value: [condition.value || ''],
          optionId: [condition.optionId || ''],
          logicalOperator: [condition.logicalOperator || 'and']
        })
      ))
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

  getVisibilityConditionsArray(fieldIndex: number): FormArray {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    return fieldControl.get('visibilityConditions') as FormArray || this.fb.array([]);
  }

  // Get available fields for visibility conditions (all fields except current)
  getAvailableFieldsForConditions(currentFieldIndex: number): any[] {
    const fields = this.getFieldsArray().controls;
    return fields
      .map((control, index) => ({
        index,
        name: control.get('name')?.value,
        label: control.get('label')?.value,
        type: control.get('type')?.value
      }))
      .filter((field, index) => index !== currentFieldIndex);
  }

  // Get condition operators based on field type
  getConditionOperators(fieldType: string): { value: string; label: string }[] {
    const baseOperators = [
      { value: 'equals', label: 'Equals' },
      { value: 'not-equals', label: 'Not Equals' },
      { value: 'is-answered', label: 'Is Answered' },
      { value: 'is-not-answered', label: 'Is Not Answered' }
    ];

    if (fieldType === 'number' || fieldType === 'date' || fieldType === 'datetime') {
      return [
        ...baseOperators,
        { value: 'greater-than', label: 'Greater Than' },
        { value: 'less-than', label: 'Less Than' },
        { value: 'greater-than-or-equal', label: 'Greater Than or Equal' },
        { value: 'less-than-or-equal', label: 'Less Than or Equal' }
      ];
    }

    if (fieldType === 'text' || fieldType === 'textarea') {
      return [
        ...baseOperators,
        { value: 'contains', label: 'Contains' },
        { value: 'starts-with', label: 'Starts With' },
        { value: 'ends-with', label: 'Ends With' }
      ];
    }

    if (fieldType === 'select' || fieldType === 'multiselect' || fieldType === 'checkbox') {
      return [
        ...baseOperators,
        { value: 'selected', label: 'Has Selected' },
        { value: 'not-selected', label: 'Has Not Selected' }
      ];
    }

    return baseOperators;
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
    const fieldId = this.generateFieldId();
    
    // Initialize unit state for clinical fields
    if (['height', 'weight', 'temperature', 'blood_pressure'].includes(type)) {
      this.clinicalFieldUnits[fieldId] = 'metric'; // Default to metric
    }
    
    // Get unit configuration for clinical fields
    let unit: string | undefined;
    let min: number | undefined;
    let max: number | undefined;
    
    if (['height', 'weight', 'temperature', 'blood_pressure'].includes(type)) {
      const unitConfig = this.getUnitConfigForField(type, 'metric');
      if (unitConfig) {
        unit = unitConfig.label;
        min = unitConfig.min;
        max = unitConfig.max;
      }
    }
    
    return {
      id: fieldId,
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
      visibilityConditions: [], // Add visibility conditions for branching logic
      options: type === 'select' || type === 'multiselect' || type === 'radio' || type === 'checkbox' 
        ? [{ value: 'option1', label: 'Option 1' }] 
        : undefined,
      auditTrail: {
        trackChanges: false,
        reasonRequired: false
      },
      // Add unit configuration for clinical fields
      ...(unit && { unit }),
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max })
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

  // Visibility conditions management
  addVisibilityCondition(fieldIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex) as FormGroup;
    const visibilityConditions = fieldControl.get('visibilityConditions') as FormArray;
    
    if (!visibilityConditions) {
      // Create visibilityConditions array if it doesn't exist
      fieldControl.addControl('visibilityConditions', this.fb.array([]));
    }
    
    const newCondition = this.fb.group({
      questionId: ['', Validators.required],
      operator: ['equals', Validators.required],
      value: [''],
      optionId: [''],
      logicalOperator: ['and'] // 'and' or 'or' for combining multiple conditions
    });
    
    (fieldControl.get('visibilityConditions') as FormArray).push(newCondition);
    this.hasUnsavedChanges = true;
  }

  removeVisibilityCondition(fieldIndex: number, conditionIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    const visibilityConditions = fieldControl.get('visibilityConditions') as FormArray;
    
    if (visibilityConditions && visibilityConditions.length > conditionIndex) {
      visibilityConditions.removeAt(conditionIndex);
      this.hasUnsavedChanges = true;
    }
  }

  // Get fields array
  getFieldsArray(): FormArray {
    return this.builderForm.get('fields') as FormArray;
  }

  // Add option to field
  addOption(fieldIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    const optionsArray = fieldControl.get('options') as FormArray;
    
    if (optionsArray) {
      const newOption = this.fb.group({
        value: [`option${optionsArray.length + 1}`, Validators.required],
        label: [`Option ${optionsArray.length + 1}`, Validators.required]
      });
      optionsArray.push(newOption);
      this.hasUnsavedChanges = true;
    }
  }

  // Remove option from field
  removeOption(fieldIndex: number, optionIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    const optionsArray = fieldControl.get('options') as FormArray;
    
    if (optionsArray && optionsArray.length > 1) { // Keep at least one option
      optionsArray.removeAt(optionIndex);
      this.hasUnsavedChanges = true;
    }
  }

  // Add validation rule
  addValidationRule(fieldIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    const rulesArray = fieldControl.get('validationRules') as FormArray;
    
    if (rulesArray) {
      const newRule = this.fb.group({
        type: ['required', Validators.required],
        value: [null],
        message: ['', Validators.required]
      });
      rulesArray.push(newRule);
      this.hasUnsavedChanges = true;
    }
  }

  // Remove validation rule
  removeValidationRule(fieldIndex: number, ruleIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    const rulesArray = fieldControl.get('validationRules') as FormArray;
    
    if (rulesArray && rulesArray.length > ruleIndex) {
      rulesArray.removeAt(ruleIndex);
      this.hasUnsavedChanges = true;
    }
  }

  getValidationRule(type: string): ValidationRuleOption | undefined {
    return this.validationRules.find(rule => rule.type === type);
  }

  // Getter for fields array (for template)
  get fieldsArray(): FormArray {
    return this.builderForm.get('fields') as FormArray;
  }

  // Check if user can save
  get canSave(): boolean {
    return this.builderForm.valid && this.hasUnsavedChanges;
  }

  // Check if user can publish
  get canPublish(): boolean {
    return this.builderForm.valid && !this.hasUnsavedChanges;
  }

  // Save template
  saveTemplate(): void {
    if (this.builderForm.valid) {
      const templateData = this.builderForm.value;
      // TODO: Call template service to save
      this.hasUnsavedChanges = false;
      console.log('Saving template:', templateData);
    }
  }

  // Publish template
  publishTemplate(): void {
    if (this.builderForm.valid) {
      const templateData = this.builderForm.value;
      // TODO: Call template service to publish
      console.log('Publishing template:', templateData);
    }
  }

  // Preview template
  previewTemplate(): void {
    this.activeTab = 'preview';
  }

  // Close builder
  closeBuilder(): void {
    if (this.hasUnsavedChanges) {
      // TODO: Show confirmation dialog
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        // Emit close event or navigate away
      }
    } else {
      // Emit close event or navigate away
    }
  }

  // Duplicate field
  duplicateField(fieldIndex: number): void {
    const fieldControl = this.getFieldsArray().at(fieldIndex);
    if (fieldControl) {
      const fieldValue = fieldControl.value;
      const duplicatedField = {
        ...fieldValue,
        id: this.generateFieldId(),
        name: `${fieldValue.name}_copy`,
        label: `${fieldValue.label} (Copy)`
      };
      const fieldFormGroup = this.createFieldFormGroup(duplicatedField);
      this.getFieldsArray().insert(fieldIndex + 1, fieldFormGroup);
      this.updateFieldOrders();
      this.hasUnsavedChanges = true;
    }
  }

  // Delete field
  deleteField(fieldIndex: number): void {
    this.getFieldsArray().removeAt(fieldIndex);
    this.updateFieldOrders();
    this.hasUnsavedChanges = true;
    this.selectedField = null;
    this.showFieldProperties = false;
  }

  // Helper method to get field type by field name
  getFieldTypeByName(fieldName: string): string {
    const fields = this.getFieldsArray().controls;
    const field = fields.find(control => control.get('name')?.value === fieldName);
    return field?.get('type')?.value || 'text';
  }

  // Helper method to check if a field is a select-type field
  isSelectField(fieldName: string): boolean {
    const fieldType = this.getFieldTypeByName(fieldName);
    return ['select', 'multiselect', 'radio', 'checkbox'].includes(fieldType);
  }

  // Helper method to get options for a field by name
  getFieldOptions(fieldName: string): any[] {
    const fields = this.getFieldsArray().controls;
    const field = fields.find(control => control.get('name')?.value === fieldName);
    if (field) {
      const optionsArray = field.get('options') as FormArray;
      if (optionsArray) {
        return optionsArray.controls.map(control => ({
          value: control.get('value')?.value,
          label: control.get('label')?.value
        }));
      }
    }
    return [];
  }

  // Clinical field unit switching methods
  toggleClinicalFieldUnit(fieldId: string, fieldType: string): void {
    const currentUnit = this.clinicalFieldUnits[fieldId] || 'metric';
    const newUnit = currentUnit === 'metric' ? 'imperial' : 'metric';
    
    // Update the unit state
    this.clinicalFieldUnits[fieldId] = newUnit;
    
    // Find the field in the form array and update its properties
    const fieldsArray = this.builderForm.get('fields') as FormArray;
    const fieldIndex = fieldsArray.controls.findIndex(
      control => control.get('id')?.value === fieldId
    );
    
    if (fieldIndex !== -1) {
      const fieldControl = fieldsArray.at(fieldIndex);
      const unitConfig = this.getUnitConfigForField(fieldType, newUnit);
      
      // Update field properties with new unit configuration
      if (unitConfig) {
        fieldControl.patchValue({
          unit: unitConfig.label,
          min: unitConfig.min,
          max: unitConfig.max
        });
        
        // Convert existing default value if present
        const defaultValue = fieldControl.get('defaultValue')?.value;
        if (defaultValue && !isNaN(Number(defaultValue))) {
          const convertedValue = this.convertClinicalValue(
            Number(defaultValue),
            fieldType,
            currentUnit,
            newUnit
          );
          fieldControl.patchValue({ defaultValue: convertedValue.toString() });
        }
      }
      
      this.hasUnsavedChanges = true;
    }
  }

  getUnitConfigForField(fieldType: string, unit: 'metric' | 'imperial'): any {
    const config = this.unitConfig[fieldType as keyof typeof this.unitConfig];
    return config ? config[unit] : null;
  }

  getClinicalFieldUnit(fieldId: string): 'metric' | 'imperial' {
    return this.clinicalFieldUnits[fieldId] || 'metric';
  }

  convertClinicalValue(
    value: number,
    fieldType: string,
    fromUnit: 'metric' | 'imperial',
    toUnit: 'metric' | 'imperial'
  ): number {
    if (fromUnit === toUnit) return value;
    
    switch (fieldType) {
      case 'height':
        // cm to inches or inches to cm
        return fromUnit === 'metric' ? value / 2.54 : value * 2.54;
      
      case 'weight':
        // kg to lbs or lbs to kg
        return fromUnit === 'metric' ? value * 2.20462 : value / 2.20462;
      
      case 'temperature':
        // Celsius to Fahrenheit or Fahrenheit to Celsius
        return fromUnit === 'metric' 
          ? (value * 9/5) + 32 
          : (value - 32) * 5/9;
      
      case 'blood_pressure':
        // Blood pressure doesn't change units (always mmHg)
        return value;
      
      default:
        return value;
    }
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
