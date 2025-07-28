import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormTemplate, FormField, PhiFieldType, ValidationRule } from '../../models/form-template.model';
import { Study } from '../../models/study.model';
import { Patient } from '../../services/healthcare-api.service';
import { StudyService } from '../../services/study.service';

@Component({
  selector: 'app-patient-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './patient-form-modal.component.html',
  styleUrls: ['./patient-form-modal.component.scss']
})
export class PatientFormModalComponent implements OnInit, OnChanges {
  @Input() show = false;
  @Input() template: FormTemplate | null = null;
  @Input() availableStudies: Study[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<any>();

  private fb = inject(FormBuilder);
  private studyService = inject(StudyService);
  
  patientForm: FormGroup = this.fb.group({});
  isSubmitting = false;
  
  // PHI field types enum values
  phiFieldTypes = {
    NAME: 'name' as PhiFieldType,
    SSN: 'ssn' as PhiFieldType,
    DOB: 'date_of_birth' as PhiFieldType,
    ADDRESS: 'address' as PhiFieldType,
    PHONE: 'phone' as PhiFieldType,
    EMAIL: 'email' as PhiFieldType,
    MRN: 'medical_record_number' as PhiFieldType
  };

  ngOnInit(): void {
    this.buildForm();
    this.loadStudies();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['template'] && this.template) {
      this.buildForm();
    }
  }

  private buildForm(): void {
    // Always include studyId as a required field
    const formControls: { [key: string]: FormControl } = {
      studyId: new FormControl('', Validators.required)
    };
    
    // Add template fields if template exists
    if (this.template) {
      this.template.fields.forEach(field => {
      const validators = [];
      
      if (field.required) {
        validators.push(Validators.required);
      }
      
      if (field.validationRules) {
        field.validationRules.forEach((rule: ValidationRule) => {
          switch (rule.type) {
            case 'minLength':
              validators.push(Validators.minLength(rule.value as number));
              break;
            case 'maxLength':
              validators.push(Validators.maxLength(rule.value as number));
              break;
            case 'pattern':
              validators.push(Validators.pattern(rule.value as string));
              break;
            // Email validation is handled separately
            default:
              break;
            case 'min':
              validators.push(Validators.min(rule.value as number));
              break;
            case 'max':
              validators.push(Validators.max(rule.value as number));
              break;
          }
        });
      }
      
        formControls[field.id] = new FormControl(
          field.defaultValue || '', 
          validators
        );
      });
    }
    
    this.patientForm = this.fb.group(formControls);
  }

  private loadStudies(): void {
    // If studies are not passed as input, load them from the service
    if (!this.availableStudies || this.availableStudies.length === 0) {
      this.studyService.getStudiesByStatus('active').subscribe({
        next: (studies) => {
          this.availableStudies = studies;
        },
        error: (error) => {
          console.error('Error loading studies:', error);
          // Continue with empty studies array if loading fails
          this.availableStudies = [];
        }
      });
    }
  }

  onClose(): void {
    if (this.isSubmitting) {
      return; // Don't allow closing while submitting
    }
    
    if (this.patientForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) {
        return;
      }
    }
    
    this.close.emit();
    this.patientForm.reset();
  }

  onSubmit(): void {
    if (this.patientForm.invalid) {
      Object.keys(this.patientForm.controls).forEach(key => {
        const control = this.patientForm.get(key);
        if (control && control.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.isSubmitting = true;
    const formData = this.patientForm.value;
    
    // Add template information and study ID
    const patientData = {
      ...formData,
      templateId: this.template?.id,
      templateName: this.template?.name,
      studyId: formData.studyId // Ensure studyId is included
    };
    
    this.submit.emit(patientData);
    this.isSubmitting = false;
    this.patientForm.reset();
  }

  getFieldControl(fieldId: string): FormControl {
    return this.patientForm.get(fieldId) as FormControl;
  }

  getFieldErrors(field: FormField): string[] {
    const control = this.getFieldControl(field.id);
    const errors: string[] = [];
    
    if (control && control.touched && control.errors) {
      if (control.errors['required']) {
        errors.push(`${field.label} is required`);
      }
      if (control.errors['minlength']) {
        errors.push(`${field.label} must be at least ${control.errors['minlength'].requiredLength} characters`);
      }
      if (control.errors['maxlength']) {
        errors.push(`${field.label} must be no more than ${control.errors['maxlength'].requiredLength} characters`);
      }
      if (control.errors['email']) {
        errors.push(`${field.label} must be a valid email address`);
      }
      if (control.errors['pattern']) {
        const validation = field.validationRules?.find((v: ValidationRule) => v.type === 'pattern');
        errors.push(validation?.message || `${field.label} format is invalid`);
      }
      if (control.errors['min']) {
        errors.push(`${field.label} must be at least ${control.errors['min'].min}`);
      }
      if (control.errors['max']) {
        errors.push(`${field.label} must be no more than ${control.errors['max'].max}`);
      }
    }
    
    return errors;
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }
}
