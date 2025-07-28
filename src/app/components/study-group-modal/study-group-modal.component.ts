import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Study } from '../../models/study.model';

export interface StudyGroup {
  id?: string;
  name: string;
  description: string;
  criteria: string;
  targetSize: number;
  currentSize?: number;
  status: 'active' | 'inactive' | 'full';
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-study-group-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './study-group-modal.component.html',
  styleUrls: ['./study-group-modal.component.scss']
})
export class StudyGroupModalComponent implements OnInit {
  @Input() show = false;
  @Input() study: Study | null = null;
  @Input() group: StudyGroup | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<StudyGroup>();

  private fb = inject(FormBuilder);
  
  groupForm!: FormGroup;
  isSubmitting = false;

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.groupForm = this.fb.group({
      name: [this.group?.name || '', [Validators.required, Validators.minLength(3)]],
      description: [this.group?.description || '', [Validators.required, Validators.minLength(10)]],
      criteria: [this.group?.criteria || '', [Validators.required]],
      targetSize: [this.group?.targetSize || 10, [Validators.required, Validators.min(1), Validators.max(1000)]],
      status: [this.group?.status || 'active', [Validators.required]]
    });
  }

  onClose(): void {
    if (this.isSubmitting) {
      return; // Don't allow closing while submitting
    }
    
    if (this.groupForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) {
        return;
      }
    }
    
    this.close.emit();
    this.groupForm.reset();
  }

  onSubmit(): void {
    if (this.groupForm.invalid) {
      Object.keys(this.groupForm.controls).forEach(key => {
        const control = this.groupForm.get(key);
        if (control && control.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.isSubmitting = true;
    
    const groupData: StudyGroup = {
      ...this.group,
      ...this.groupForm.value,
      updatedAt: new Date()
    };
    
    if (!this.group) {
      groupData.createdAt = new Date();
      groupData.currentSize = 0;
    }
    
    this.save.emit(groupData);
    this.isSubmitting = false;
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }

  get isEditMode(): boolean {
    return !!this.group;
  }
}
