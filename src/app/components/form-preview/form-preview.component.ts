import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
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
export class FormPreviewComponent implements OnInit, OnDestroy, OnChanges {
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
  
  // File upload tracking
  private selectedFiles: Map<string, File[]> = new Map();
  
  // Signature tracking
  private signatureData: Map<string, string> = new Map();
  private isDrawing: Map<string, boolean> = new Map();
  private canvasContexts: Map<string, CanvasRenderingContext2D> = new Map();

  constructor(
    private fb: FormBuilder,
    private formInstanceService: FormInstanceService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.setupFormChangeListener();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['template'] && !changes['template'].firstChange) {
      // Re-initialize form when template changes
      this.initializeForm();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    if (!this.template || !this.template.fields) {
      return;
    }

    const formControls: { [key: string]: AbstractControl } = {};

    // Create form controls for each field
    this.template.fields.forEach(field => {
      const validators = this.buildValidators(field);
      let initialValue = this.getInitialValue(field);

      // Handle special field types that need nested form groups
      if (field.type === 'blood_pressure') {
        formControls[field.id] = this.fb.group({
          systolic: this.fb.control({
            value: initialValue?.systolic || null,
            disabled: this.readonly || field.readonly
          }, [Validators.min(50), Validators.max(300)]),
          diastolic: this.fb.control({
            value: initialValue?.diastolic || null,
            disabled: this.readonly || field.readonly
          }, [Validators.min(30), Validators.max(200)])
        });
      } else if (field.type === 'medication') {
        formControls[field.id] = this.fb.group({
          name: this.fb.control({ value: initialValue?.name || '', disabled: this.readonly || field.readonly }),
          dosage: this.fb.control({ value: initialValue?.dosage || '', disabled: this.readonly || field.readonly }),
          frequency: this.fb.control({ value: initialValue?.frequency || '', disabled: this.readonly || field.readonly }),
          route: this.fb.control({ value: initialValue?.route || '', disabled: this.readonly || field.readonly }),
          startDate: this.fb.control({ value: initialValue?.startDate || null, disabled: this.readonly || field.readonly }),
          endDate: this.fb.control({ value: initialValue?.endDate || null, disabled: this.readonly || field.readonly })
        });
      } else if (field.type === 'diagnosis') {
        formControls[field.id] = this.fb.group({
          code: this.fb.control({ value: initialValue?.code || '', disabled: this.readonly || field.readonly }),
          description: this.fb.control({ value: initialValue?.description || '', disabled: this.readonly || field.readonly }),
          system: this.fb.control({ value: initialValue?.system || 'ICD-10', disabled: this.readonly || field.readonly }),
          severity: this.fb.control({ value: initialValue?.severity || '', disabled: this.readonly || field.readonly }),
          onset: this.fb.control({ value: initialValue?.onset || null, disabled: this.readonly || field.readonly })
        });
      } else {
        formControls[field.id] = this.fb.control({
          value: initialValue,
          disabled: this.readonly || field.readonly
        }, validators);
      }
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
        return [];
      case 'multiselect':
        return [];
      case 'number':
        return null;
      case 'date':
      case 'time':
      case 'datetime':
        return null;
      case 'blood_pressure':
        return { systolic: null, diastolic: null };
      case 'medication':
        return { name: '', dosage: '', frequency: '', route: '', startDate: null, endDate: null };
      case 'diagnosis':
        return { code: '', description: '', system: 'ICD-10', severity: '', onset: null };
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

  // Helper method to get nested form controls for complex fields
  getNestedControl(fieldId: string, nestedField: string): AbstractControl | null {
    const fieldGroup = this.previewForm.get(fieldId);
    if (fieldGroup && fieldGroup instanceof FormGroup) {
      return fieldGroup.get(nestedField);
    }
    return null;
  }

  // Helper method to get field control as FormGroup for complex fields
  getFieldGroupControl(fieldId: string): FormGroup | null {
    const control = this.previewForm.get(fieldId);
    return control instanceof FormGroup ? control : null;
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

  // Checkbox handling methods
  isCheckboxChecked(fieldId: string, optionValue: string): boolean {
    const control = this.getFieldControl(fieldId);
    if (!control) return false;
    
    const value = control.value;
    if (Array.isArray(value)) {
      return value.includes(optionValue);
    }
    return false;
  }

  onCheckboxChange(fieldId: string, optionValue: string, event: any): void {
    const control = this.getFieldControl(fieldId);
    if (!control || this.readonly) return;
    
    let currentValue = control.value || [];
    if (!Array.isArray(currentValue)) {
      currentValue = [];
    }
    
    if (event.target.checked) {
      // Add the value if checked
      if (!currentValue.includes(optionValue)) {
        currentValue = [...currentValue, optionValue];
      }
    } else {
      // Remove the value if unchecked
      currentValue = currentValue.filter((v: string) => v !== optionValue);
    }
    
    control.setValue(currentValue);
    control.markAsTouched();
  }

  // File upload methods
  onFileSelected(fieldId: string, event: any): void {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length > 0) {
      this.selectedFiles.set(fieldId, files);
      // Update form control with file metadata
      const control = this.getFieldControl(fieldId);
      if (control) {
        control.setValue(files.map(f => ({
          fileName: f.name,
          fileSize: f.size,
          mimeType: f.type,
          uploadDate: new Date()
        })));
        control.markAsTouched();
      }
    }
  }

  getSelectedFiles(fieldId: string): File[] {
    return this.selectedFiles.get(fieldId) || [];
  }

  getFileDisplayText(fieldId: string): string {
    const files = this.getSelectedFiles(fieldId);
    if (files.length === 0) return '';
    if (files.length === 1) return files[0].name;
    return `${files.length} files selected`;
  }

  removeFile(fieldId: string, file: File): void {
    const files = this.getSelectedFiles(fieldId);
    const updatedFiles = files.filter(f => f !== file);
    this.selectedFiles.set(fieldId, updatedFiles);
    
    // Update form control
    const control = this.getFieldControl(fieldId);
    if (control) {
      if (updatedFiles.length > 0) {
        control.setValue(updatedFiles.map(f => ({
          fileName: f.name,
          fileSize: f.size,
          mimeType: f.type,
          uploadDate: new Date()
        })));
      } else {
        control.setValue(null);
      }
      control.markAsTouched();
    }
  }

  // Signature methods
  ngAfterViewInit(): void {
    // Initialize canvas contexts for signature fields
    if (this.template?.fields) {
      this.template.fields
        .filter(field => field.type === 'signature')
        .forEach(field => {
          setTimeout(() => {
            const canvas = document.getElementById(`signature-${field.id}`) as HTMLCanvasElement;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                this.canvasContexts.set(field.id, ctx);
                
                // Draw border
                ctx.strokeStyle = '#ddd';
                ctx.strokeRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = '#000';
              }
            }
          }, 100);
        });
    }
  }

  startDrawing(fieldId: string, event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    this.isDrawing.set(fieldId, true);
    
    const ctx = this.canvasContexts.get(fieldId);
    if (!ctx) return;
    
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = event instanceof MouseEvent ? event.clientX - rect.left : event.touches[0].clientX - rect.left;
    const y = event instanceof MouseEvent ? event.clientY - rect.top : event.touches[0].clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  draw(fieldId: string, event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    if (!this.isDrawing.get(fieldId)) return;
    
    const ctx = this.canvasContexts.get(fieldId);
    if (!ctx) return;
    
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = event instanceof MouseEvent ? event.clientX - rect.left : event.touches[0].clientX - rect.left;
    const y = event instanceof MouseEvent ? event.clientY - rect.top : event.touches[0].clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  stopDrawing(fieldId: string): void {
    if (this.isDrawing.get(fieldId)) {
      this.isDrawing.set(fieldId, false);
      this.saveSignature(fieldId);
    }
  }

  clearSignature(fieldId: string): void {
    const canvas = document.getElementById(`signature-${fieldId}`) as HTMLCanvasElement;
    const ctx = this.canvasContexts.get(fieldId);
    
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Redraw border
      ctx.strokeStyle = '#ddd';
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#000';
      
      this.signatureData.delete(fieldId);
      
      // Update form control
      const control = this.getFieldControl(fieldId);
      if (control) {
        control.setValue(null);
        control.markAsTouched();
      }
    }
  }

  private saveSignature(fieldId: string): void {
    const canvas = document.getElementById(`signature-${fieldId}`) as HTMLCanvasElement;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      this.signatureData.set(fieldId, dataUrl);
      
      // Update form control
      const control = this.getFieldControl(fieldId);
      if (control) {
        control.setValue(dataUrl);
        control.markAsTouched();
      }
    }
  }

  hasSignature(fieldId: string): boolean {
    return this.signatureData.has(fieldId) && !!this.signatureData.get(fieldId);
  }

  // Unit switching for clinical fields
  private unitPreferences = new Map<string, 'imperial' | 'metric'>([
    ['height', 'metric'],
    ['weight', 'metric'],
    ['temperature', 'metric']
  ]);

  toggleUnit(fieldType: string): void {
    const currentUnit = this.unitPreferences.get(fieldType) || 'metric';
    const newUnit = currentUnit === 'metric' ? 'imperial' : 'metric';
    this.unitPreferences.set(fieldType, newUnit);

    // Convert existing value if present
    const field = this.template?.fields.find(f => f.type === fieldType);
    if (field) {
      const control = this.getFieldControl(field.id);
      if (control && control.value) {
        const convertedValue = this.convertValue(fieldType, control.value, currentUnit, newUnit);
        control.setValue(convertedValue);
      }
    }
  }

  getUnit(fieldType: string): string {
    const unit = this.unitPreferences.get(fieldType) || 'metric';
    switch (fieldType) {
      case 'height':
        return unit === 'metric' ? 'cm' : 'ft/in';
      case 'weight':
        return unit === 'metric' ? 'kg' : 'lbs';
      case 'temperature':
        return unit === 'metric' ? '°C' : '°F';
      default:
        return '';
    }
  }

  getUnitPlaceholder(fieldType: string): string {
    const unit = this.unitPreferences.get(fieldType) || 'metric';
    switch (fieldType) {
      case 'height':
        return unit === 'metric' ? 'Height in cm' : 'Height in feet/inches';
      case 'weight':
        return unit === 'metric' ? 'Weight in kg' : 'Weight in pounds';
      case 'temperature':
        return unit === 'metric' ? 'Temperature in °C' : 'Temperature in °F';
      default:
        return '';
    }
  }

  getMinValue(fieldType: string): number {
    const unit = this.unitPreferences.get(fieldType) || 'metric';
    switch (fieldType) {
      case 'height':
        return unit === 'metric' ? 50 : 1.6; // 50cm or 1.6ft
      case 'weight':
        return unit === 'metric' ? 1 : 2.2; // 1kg or 2.2lbs
      case 'temperature':
        return unit === 'metric' ? 30 : 86; // 30°C or 86°F
      default:
        return 0;
    }
  }

  getMaxValue(fieldType: string): number {
    const unit = this.unitPreferences.get(fieldType) || 'metric';
    switch (fieldType) {
      case 'height':
        return unit === 'metric' ? 250 : 8.2; // 250cm or 8.2ft
      case 'weight':
        return unit === 'metric' ? 500 : 1100; // 500kg or 1100lbs
      case 'temperature':
        return unit === 'metric' ? 45 : 113; // 45°C or 113°F
      default:
        return 999999;
    }
  }

  private convertValue(fieldType: string, value: number, fromUnit: 'imperial' | 'metric', toUnit: 'imperial' | 'metric'): number {
    if (fromUnit === toUnit) return value;

    switch (fieldType) {
      case 'height':
        // cm to feet: divide by 30.48
        // feet to cm: multiply by 30.48
        return fromUnit === 'metric' ? 
          Math.round((value / 30.48) * 10) / 10 : 
          Math.round(value * 30.48 * 10) / 10;
      
      case 'weight':
        // kg to lbs: multiply by 2.20462
        // lbs to kg: divide by 2.20462
        return fromUnit === 'metric' ? 
          Math.round(value * 2.20462 * 10) / 10 : 
          Math.round((value / 2.20462) * 10) / 10;
      
      case 'temperature':
        // C to F: (C × 9/5) + 32
        // F to C: (F - 32) × 5/9
        return fromUnit === 'metric' ? 
          Math.round(((value * 9/5) + 32) * 10) / 10 : 
          Math.round(((value - 32) * 5/9) * 10) / 10;
      
      default:
        return value;
    }
  }
}
