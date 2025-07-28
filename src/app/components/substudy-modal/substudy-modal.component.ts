import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Study } from '../../models/study.model';

export interface Substudy {
  id?: string;
  parentStudyId: string;
  name: string;
  description: string;
  protocolNumber: string;
  phase: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'terminated';
  startDate: Date;
  endDate?: Date;
  targetEnrollment: number;
  currentEnrollment?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-substudy-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './substudy-modal.component.html',
  styleUrls: ['./substudy-modal.component.scss']
})
export class SubstudyModalComponent implements OnInit {
  @Input() show = false;
  @Input() parentStudy: Study | null = null;
  @Input() substudy: Substudy | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Substudy>();

  private fb = inject(FormBuilder);
  
  substudyForm!: FormGroup;
  isSubmitting = false;

  phases = [
    { value: 'Phase I', label: 'Phase I' },
    { value: 'Phase II', label: 'Phase II' },
    { value: 'Phase III', label: 'Phase III' },
    { value: 'Phase IV', label: 'Phase IV' },
    { value: 'Pilot', label: 'Pilot Study' },
    { value: 'Observational', label: 'Observational' }
  ];

  statuses = [
    { value: 'planning', label: 'Planning' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'completed', label: 'Completed' },
    { value: 'terminated', label: 'Terminated' }
  ];

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    const today = new Date().toISOString().split('T')[0];
    
    this.substudyForm = this.fb.group({
      name: [this.substudy?.name || '', [Validators.required, Validators.minLength(3)]],
      description: [this.substudy?.description || '', [Validators.required, Validators.minLength(10)]],
      protocolNumber: [this.substudy?.protocolNumber || '', [Validators.required]],
      phase: [this.substudy?.phase || '', [Validators.required]],
      status: [this.substudy?.status || 'planning', [Validators.required]],
      startDate: [this.formatDate(this.substudy?.startDate) || today, [Validators.required]],
      endDate: [this.formatDate(this.substudy?.endDate) || '', []],
      targetEnrollment: [this.substudy?.targetEnrollment || 10, [Validators.required, Validators.min(1), Validators.max(10000)]]
    });
  }

  private formatDate(date: Date | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  onClose(): void {
    if (this.isSubmitting) {
      return; // Don't allow closing while submitting
    }
    
    if (this.substudyForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) {
        return;
      }
    }
    
    this.close.emit();
    this.substudyForm.reset();
  }

  onSubmit(): void {
    if (this.substudyForm.invalid) {
      Object.keys(this.substudyForm.controls).forEach(key => {
        const control = this.substudyForm.get(key);
        if (control && control.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.isSubmitting = true;
    
    const formValue = this.substudyForm.value;
    const substudyData: Substudy = {
      ...this.substudy,
      ...formValue,
      parentStudyId: this.parentStudy?.id || this.substudy?.parentStudyId || '',
      startDate: new Date(formValue.startDate),
      endDate: formValue.endDate ? new Date(formValue.endDate) : undefined,
      updatedAt: new Date()
    };
    
    if (!this.substudy) {
      substudyData.createdAt = new Date();
      substudyData.currentEnrollment = 0;
    }
    
    this.save.emit(substudyData);
    this.isSubmitting = false;
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }

  get isEditMode(): boolean {
    return !!this.substudy;
  }
}
