import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Study } from '../../models/study.model';
import { FormTemplate } from '../../models/form-template.model';

export interface FormAssignment {
  id?: string;
  studyId: string;
  formTemplateId: string;
  formTemplateName?: string;
  sectionId: string;
  sectionName?: string;
  assignmentType: 'required' | 'optional' | 'conditional';
  condition?: string;
  order: number;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'as-needed';
  dueAfterDays?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-form-assignment-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './form-assignment-modal.component.html',
  styleUrls: ['./form-assignment-modal.component.scss']
})
export class FormAssignmentModalComponent implements OnInit {
  @Input() show = false;
  @Input() study: Study | null = null;
  @Input() availableTemplates: FormTemplate[] = [];
  @Input() assignment: FormAssignment | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<FormAssignment>();

  private fb = inject(FormBuilder);
  
  assignmentForm!: FormGroup;
  isSubmitting = false;
  filteredSections: any[] = [];

  assignmentTypes = [
    { value: 'required', label: 'Required' },
    { value: 'optional', label: 'Optional' },
    { value: 'conditional', label: 'Conditional' }
  ];

  frequencies = [
    { value: 'once', label: 'Once' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'as-needed', label: 'As Needed' }
  ];

  ngOnInit(): void {
    this.initializeForm();
    this.loadSections();
  }

  private initializeForm(): void {
    this.assignmentForm = this.fb.group({
      formTemplateId: [this.assignment?.formTemplateId || '', [Validators.required]],
      sectionId: [this.assignment?.sectionId || '', [Validators.required]],
      assignmentType: [this.assignment?.assignmentType || 'required', [Validators.required]],
      condition: [this.assignment?.condition || ''],
      order: [this.assignment?.order || 1, [Validators.required, Validators.min(1)]],
      frequency: [this.assignment?.frequency || 'once', [Validators.required]],
      dueAfterDays: [this.assignment?.dueAfterDays || null]
    });

    // Enable/disable condition field based on assignment type
    this.assignmentForm.get('assignmentType')?.valueChanges.subscribe(type => {
      const conditionControl = this.assignmentForm.get('condition');
      if (type === 'conditional') {
        conditionControl?.setValidators([Validators.required]);
      } else {
        conditionControl?.clearValidators();
        conditionControl?.setValue('');
      }
      conditionControl?.updateValueAndValidity();
    });

    // Enable/disable due after days based on frequency
    this.assignmentForm.get('frequency')?.valueChanges.subscribe(frequency => {
      const dueAfterControl = this.assignmentForm.get('dueAfterDays');
      if (frequency !== 'as-needed') {
        dueAfterControl?.setValidators([Validators.required, Validators.min(0)]);
      } else {
        dueAfterControl?.clearValidators();
        dueAfterControl?.setValue(null);
      }
      dueAfterControl?.updateValueAndValidity();
    });
  }

  private loadSections(): void {
    // In a real app, this would load sections from the study
    // For now, we'll use placeholder data
    if (this.study) {
      this.filteredSections = [
        { id: 'screening', name: 'Screening' },
        { id: 'baseline', name: 'Baseline' },
        { id: 'treatment', name: 'Treatment' },
        { id: 'followup', name: 'Follow-up' }
      ];
    }
  }

  onClose(): void {
    if (this.isSubmitting) {
      return; // Don't allow closing while submitting
    }
    
    if (this.assignmentForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) {
        return;
      }
    }
    
    this.close.emit();
    this.assignmentForm.reset();
  }

  onSubmit(): void {
    if (this.assignmentForm.invalid) {
      Object.keys(this.assignmentForm.controls).forEach(key => {
        const control = this.assignmentForm.get(key);
        if (control && control.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.isSubmitting = true;
    
    const formValue = this.assignmentForm.value;
    const selectedTemplate = this.availableTemplates.find(t => t.id === formValue.formTemplateId);
    const selectedSection = this.filteredSections.find(s => s.id === formValue.sectionId);
    
    const assignmentData: FormAssignment = {
      ...this.assignment,
      ...formValue,
      studyId: this.study?.id || this.assignment?.studyId || '',
      formTemplateName: selectedTemplate?.name,
      sectionName: selectedSection?.name,
      updatedAt: new Date()
    };
    
    if (!this.assignment) {
      assignmentData.createdAt = new Date();
    }
    
    this.save.emit(assignmentData);
    this.isSubmitting = false;
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }

  get isEditMode(): boolean {
    return !!this.assignment;
  }

  get showConditionField(): boolean {
    return this.assignmentForm.get('assignmentType')?.value === 'conditional';
  }

  get showDueAfterField(): boolean {
    return this.assignmentForm.get('frequency')?.value !== 'as-needed';
  }
}
