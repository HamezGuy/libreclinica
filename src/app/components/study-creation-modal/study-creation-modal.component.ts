import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Study } from '../../models/study.model';
import { AccessLevel } from '../../enums/access-levels.enum';

@Component({
  selector: 'app-study-creation-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './study-creation-modal.component.html',
  styleUrls: ['./study-creation-modal.component.scss']
})
export class StudyCreationModalComponent implements OnInit {
  @Input() show = false;
  @Input() availableUsers: any[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() create = new EventEmitter<Study>();

  private fb = inject(FormBuilder);
  
  studyCreationForm!: FormGroup;
  isCreatingStudy = false;
  
  // Study phase options
  studyPhases = [
    { value: 'I', label: 'Phase I - Safety & Dosage' },
    { value: 'II', label: 'Phase II - Efficacy & Side Effects' },
    { value: 'III', label: 'Phase III - Efficacy & Monitoring' },
    { value: 'IV', label: 'Phase IV - Post Market Surveillance' },
    { value: 'Observational', label: 'Observational Study' },
    { value: 'Registry', label: 'Patient Registry' }
  ];

  // Study status options
  studyStatuses = [
    { value: 'planning', label: 'Planning' },
    { value: 'active', label: 'Active/Recruiting' },
    { value: 'closed', label: 'Closed to Enrollment' },
    { value: 'completed', label: 'Completed' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'terminated', label: 'Terminated' }
  ];

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.studyCreationForm = this.fb.group({
      // Basic Information
      title: ['', [Validators.required, Validators.minLength(5)]],
      protocolNumber: ['', [Validators.required, Validators.pattern(/^[A-Z0-9-]+$/)]],
      description: ['', [Validators.required, Validators.minLength(20)]],
      
      // Study Classification
      phase: ['', Validators.required],
      status: ['planning', Validators.required],
      therapeuticArea: ['', Validators.required],
      indication: ['', Validators.required],
      
      // Enrollment
      plannedEnrollment: [0, [Validators.required, Validators.min(1)]],
      actualEnrollment: [0],
      enrollmentStartDate: ['', Validators.required],
      enrollmentEndDate: ['', Validators.required],
      
      // Study Team
      principalInvestigator: ['', Validators.required],
      studyCoordinator: [''],
      dataManager: [''],
      monitor: [''],
      
      // Regulatory
      irbApprovalNumber: [''],
      irbApprovalDate: [''],
      regulatoryBody: [''],
      clinicalTrialId: ['']
    });
  }

  onClose(): void {
    if (this.isCreatingStudy) {
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
  }

  onSubmit(): void {
    if (this.studyCreationForm.invalid) {
      Object.keys(this.studyCreationForm.controls).forEach(key => {
        const control = this.studyCreationForm.get(key);
        if (control && control.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    this.isCreatingStudy = true;
    const formValue = this.studyCreationForm.value;
    
    const newStudy: Partial<Study> = {
      title: formValue.title,
      protocolNumber: formValue.protocolNumber,
      description: formValue.description,
      phase: formValue.phase,
      status: formValue.status,
      therapeuticArea: formValue.therapeuticArea,
      indication: formValue.indication,
      plannedEnrollment: formValue.plannedEnrollment,
      actualEnrollment: formValue.actualEnrollment,
      enrollmentStartDate: new Date(formValue.enrollmentStartDate),
      enrollmentEndDate: new Date(formValue.enrollmentEndDate),
      principalInvestigator: formValue.principalInvestigator,
      studyCoordinator: formValue.studyCoordinator,
      dataManager: formValue.dataManager,
      monitor: formValue.monitor,
      irbApprovalNumber: formValue.irbApprovalNumber,
      irbApprovalDate: formValue.irbApprovalDate ? new Date(formValue.irbApprovalDate) : undefined,
      regulatoryBody: formValue.regulatoryBody,
      clinicalTrialId: formValue.clinicalTrialId,
      sites: [],
      sections: [],
      eligibilityCriteria: {
        inclusion: [],
        exclusion: []
      }
    };

    this.create.emit(newStudy as Study);
    this.isCreatingStudy = false;
    this.studyCreationForm.reset();
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button
  }
}
