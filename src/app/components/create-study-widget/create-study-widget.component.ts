import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { StudyService } from '../../services/study.service';
import { Study } from '../../models/study.model';
import { UserProfile } from '../../models/user-profile.model';

@Component({
  selector: 'app-create-study-widget',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-study-widget.component.html',
  styleUrls: ['./create-study-widget.component.scss']
})
export class CreateStudyWidgetComponent implements OnInit, OnDestroy {
  @Input() isVisible = false;
  @Input() userProfile: UserProfile | null = null;
  @Input() permissions: any = { canCreate: false };
  
  @Output() closeModal = new EventEmitter<void>();
  @Output() studyCreated = new EventEmitter<Study>();
  @Output() refreshStudies = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private studyService = inject(StudyService);
  private destroy$ = new Subject<void>();

  studyCreationForm!: FormGroup;
  isCreatingStudy = false;

  ngOnInit(): void {
    this.initializeStudyCreationForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeStudyCreationForm(): void {
    this.studyCreationForm = this.fb.group({
      // Basic Information
      protocolNumber: ['', [Validators.required, Validators.pattern(/^[A-Z0-9-]+$/)]], 
      title: ['', [Validators.required, Validators.minLength(5)]],
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
      plannedStartDate: [''],
      plannedEndDate: [''],
      
      // Enrollment Information
      plannedEnrollment: [0, [Validators.required, Validators.min(1)]],
      actualEnrollment: [0],
      enrollmentStatus: ['not_started'],
      
      // Regulatory Information
      regulatoryRequirements: [[]],
      irbApprovalRequired: [true],
      consentRequired: [true],
      
      // CFR 21 Part 11 Compliance
      requiresElectronicSignatures: [true],
      auditTrailRequired: [true],
      dataIntegrityLevel: ['enhanced', Validators.required],
      
      // Data Retention
      dataRetentionPeriod: [120, [Validators.required, Validators.min(12)]], // in months
      
      // Study Team
      principalInvestigator: [''],
      studyCoordinator: [''],
      dataManager: [''],
      
      // Tags
      tags: [[]]
    });
  }

  openModal(): void {
    console.log('createNewStudy called');
    if (!this.permissions.canCreate) {
      alert('You do not have permission to create studies');
      return;
    }
    
    console.log('Permissions check passed, opening modal');
    // Reset form and open modal
    this.studyCreationForm.reset({
      phase: 'phase_i',
      studyType: 'interventional',
      status: 'planning',
      enrollmentStatus: 'not_started',
      plannedEnrollment: 0,
      actualEnrollment: 0,
      irbApprovalRequired: true,
      consentRequired: true,
      requiresElectronicSignatures: true,
      auditTrailRequired: true,
      dataIntegrityLevel: 'enhanced',
      dataRetentionPeriod: 120 // 10 years default
    });
  }

  async saveNewStudy(): Promise<void> {
    if (this.studyCreationForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.studyCreationForm.controls).forEach(key => {
        this.studyCreationForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isCreatingStudy = true;
    
    try {
      const formValue = this.studyCreationForm.value;
      
      // Create the study object
      const newStudy: Study = {
        ...formValue,
        sections: [], // Initialize empty sections
        substudies: [],
        studyGroups: [],
        eligibilityCriteria: {
          inclusionCriteria: [],
          exclusionCriteria: [],
          ageRange: {
            minimum: 18,
            maximum: 99,
            unit: 'years'
          },
          genderRestriction: 'any'
        },
        sites: [],
        archivalRequirements: [],
        changeHistory: [],
        createdBy: this.userProfile?.uid || 'unknown',
        createdAt: new Date(),
        lastModifiedBy: this.userProfile?.uid || 'unknown',
        lastModifiedAt: new Date()
      };

      // Save to Firebase via StudyService
      const savedStudy = await this.studyService.createStudy(newStudy);
      
      // Success - close modal and refresh studies list
      this.studyCreationForm.reset();
      
      // Show success message
      alert(`Study "${savedStudy.title}" created successfully!`);
      
      // Emit events to parent component
      this.studyCreated.emit(savedStudy);
      this.refreshStudies.emit();
      this.closeStudyCreationModal();
      
    } catch (error) {
      console.error('Error creating study:', error);
      alert('Failed to create study. Please try again.');
    } finally {
      this.isCreatingStudy = false;
    }
  }

  closeStudyCreationModal(): void {
    // Check if form has unsaved changes
    if (this.studyCreationForm.dirty && !this.studyCreationForm.pristine) {
      const confirmClose = confirm(
        'You have unsaved changes in the study creation form. Are you sure you want to close without saving?\n\n' +
        'Click "OK" to close without saving, or "Cancel" to continue editing.'
      );
      
      if (!confirmClose) {
        return; // Don't close the modal
      }
    }
    
    this.studyCreationForm.reset();
    this.closeModal.emit();
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }
}
