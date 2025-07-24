import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators, AbstractControl } from '@angular/forms';
import { FormTemplate, FormField, FormInstance, FormFieldType } from '../../models/form-template.model';
import { FormInstanceService } from '../../services/form-instance.service';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-form-preview',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './form-preview.component.html',
  styleUrls: ['./form-preview.component.scss']
})
export class FormPreviewComponent implements OnInit, OnDestroy {
  @Input() template!: FormTemplate;
  @Input() formInstance?: FormInstance;
  @Input() readonly: boolean = false;
  @Input() studyId?: string;
  @Input() patientId?: string;
  @Input() visitId?: string;
  @Output() formDataChanged = new EventEmitter<any>();
  @Output() formSubmitted = new EventEmitter<FormInstance>();
  @Output() formSaved = new EventEmitter<FormInstance>();

  previewForm!: FormGroup;
  private destroy$ = new Subject<void>();
  currentInstance?: FormInstance;
  isLoading = false;
  hasUnsavedChanges = false;

  constructor(
    private fb: FormBuilder,
    private formInstanceService: FormInstanceService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.setupFormChangeListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    if (!this.template || !this.template.fields) {
      return;
    }

    const formControls: { [key: string]: FormControl } = {};

    // Create form controls for each field
    this.template.fields.forEach(field => {
      const validators = this.buildValidators(field);
      let initialValue = this.getInitialValue(field);

      formControls[field.id] = this.fb.control({
        value: initialValue,
        disabled: this.readonly || field.readonly
      }, validators);
    });

    this.previewForm = this.fb.group(formControls);
  }

  private setupFormChangeListener(): void {
    if (this.previewForm && !this.readonly) {
      this.previewForm.valueChanges
        .pipe(
          debounceTime(500),
          takeUntil(this.destroy$)
        )
        .subscribe(value => {
          this.hasUnsavedChanges = true;
          this.formDataChanged.emit(value);
        });
    }
  }

  private buildValidators(field: FormField): any[] {
    const validators = [];

    if (field.required || field.isRequired) {
      validators.push(Validators.required);
    }

    // Add field-type specific validators
    switch (field.type) {
      case 'email':
        validators.push(Validators.email);
        break;
      case 'number':
        break;
      case 'phone':
        validators.push(Validators.pattern(/^\+?[\d\s\-\(\)]+$/));
        break;
    }

    // Add custom validation rules
    if (field.validationRules) {
      field.validationRules.forEach(rule => {
        switch (rule.type) {
          case 'minLength':
            validators.push(Validators.minLength(Number(rule.value)));
            break;
          case 'maxLength':
            validators.push(Validators.maxLength(Number(rule.value)));
            break;
          case 'min':
            validators.push(Validators.min(Number(rule.value)));
            break;
          case 'max':
            validators.push(Validators.max(Number(rule.value)));
            break;
          case 'pattern':
            validators.push(Validators.pattern(rule.value));
            break;
        }
      });
    }

    return validators;
  }

  private getInitialValue(field: FormField): any {
    // Check if we have existing form instance data
    if (this.formInstance && this.formInstance.data[field.id] !== undefined) {
      return this.formInstance.data[field.id];
    }

    // Use field default value
    if (field.defaultValue !== undefined) {
      return field.defaultValue;
    }

    // Return appropriate default based on field type
    switch (field.type) {
      case 'checkbox':
        return false;
      case 'multiselect':
        return [];
      case 'number':
        return null;
      case 'date':
      case 'time':
      case 'datetime':
        return null;
      default:
        return '';
    }
  }

  getFieldIcon(fieldType: FormFieldType): string {
    const iconMap: { [key in FormFieldType]: string } = {
      'text': 'text_fields',
      'textarea': 'subject',
      'number': 'numbers',
      'email': 'email',
      'phone': 'phone',
      'date': 'calendar_today',
      'time': 'access_time',
      'datetime': 'event',
      'select': 'arrow_drop_down',
      'multiselect': 'checklist',
      'checkbox': 'check_box',
      'radio': 'radio_button_checked',
      'boolean': 'toggle_on',
      'file': 'attach_file',
      'image': 'image',
      'nested_form': 'dynamic_form',
      'signature': 'draw',
      'calculated': 'calculate',
      'height': 'height',
      'weight': 'monitor_weight',
      'blood_pressure': 'favorite',
      'temperature': 'thermostat',
      'medication': 'medication',
      'diagnosis': 'medical_services',
      // PHI-specific field types (matching PhiFieldType)
      'patient_name': 'person',
      'patient_id': 'badge',
      'date_of_birth': 'cake',
      'ssn': 'fingerprint',
      'address': 'home',
      'phone_number': 'phone',
      'email_address': 'email',
      'medical_record_number': 'folder_special',
      'insurance_id': 'local_hospital',
      'emergency_contact': 'contact_emergency',
      'genetic_data': 'biotech',
      'biometric_identifier': 'fingerprint'
    };
    return iconMap[fieldType] || 'input';
  }

  getFieldControl(fieldId: string): AbstractControl | null {
    return this.previewForm.get(fieldId);
  }

  getFileAcceptTypes(field: FormField): string {
    return field.allowedFileTypes ? field.allowedFileTypes.map(type => '.' + type).join(',') : '';
  }

  isFieldRequired(field: FormField): boolean {
    return field.required || field.isRequired || false;
  }

  isFieldHidden(field: FormField): boolean {
    return field.hidden || field.isHidden || false;
  }

  async saveForm(): Promise<void> {
    if (!this.previewForm.valid || this.readonly) {
      return;
    }

    this.isLoading = true;

    try {
      const formData = this.previewForm.value;

      if (this.formInstance) {
        // Update existing instance
        const updatedInstance = await this.formInstanceService.updateFormInstance(
          this.formInstance.id!,
          { data: formData },
          'Form data updated'
        );
        this.currentInstance = updatedInstance;
        this.formSaved.emit(updatedInstance);
      } else {
        // Create new instance
        const newInstance = await this.formInstanceService.createFormInstance(
          this.template.id!,
          this.patientId,
          this.studyId,
          this.visitId
        );
        
        // Update the instance with form data
        const updatedInstance = await this.formInstanceService.updateFormInstance(
          newInstance.id!,
          { data: formData },
          'Initial form data saved'
        );
        
        this.currentInstance = updatedInstance;
        this.formInstance = updatedInstance;
        this.formSaved.emit(updatedInstance);
      }

      this.hasUnsavedChanges = false;
    } catch (error) {
      console.error('Error saving form:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async submitForm(): Promise<void> {
    if (!this.previewForm.valid || this.readonly || !this.currentInstance?.id) {
      return;
    }

    this.isLoading = true;

    try {
      const submittedInstance = await this.formInstanceService.submitFormInstance(
        this.currentInstance.id
      );
      this.currentInstance = submittedInstance;
      this.formSubmitted.emit(submittedInstance);
      this.hasUnsavedChanges = false;
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      this.isLoading = false;
    }
  }

  trackField(index: number, field: FormField): string {
    return field.id;
  }
}
