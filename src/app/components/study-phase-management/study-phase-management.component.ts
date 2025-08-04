import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { StudyPhaseConfig, PhaseTemplateAssignment } from '../../models/study-phase.model';
import { FormTemplate } from '../../models/form-template.model';
import { StudyPhaseService } from '../../services/study-phase.service';
import { FormTemplateService } from '../../services/form-template.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-study-phase-management',
  templateUrl: './study-phase-management.component.html',
  styleUrls: ['./study-phase-management.component.scss']
})
export class StudyPhaseManagementComponent implements OnInit {
  @Input() studyId!: string;
  @Input() existingPhases: StudyPhaseConfig[] = [];
  @Output() phasesUpdated = new EventEmitter<StudyPhaseConfig[]>();
  @Output() closeModal = new EventEmitter<void>();

  phaseForm!: FormGroup;
  availableTemplates: FormTemplate[] = [];
  loading = false;
  error: string | null = null;

  // Predefined phase templates
  phaseTemplates = [
    { code: 'SCR', name: 'Screening', description: 'Initial patient screening and eligibility assessment' },
    { code: 'BSL', name: 'Baseline', description: 'Baseline assessments before treatment' },
    { code: 'TRT', name: 'Treatment', description: 'Active treatment phase' },
    { code: 'FUP', name: 'Follow-up', description: 'Post-treatment follow-up assessments' },
    { code: 'EOT', name: 'End of Treatment', description: 'Final assessments at treatment completion' },
    { code: 'LFU', name: 'Long-term Follow-up', description: 'Extended follow-up period' }
  ];

  constructor(
    private fb: FormBuilder,
    private studyPhaseService: StudyPhaseService,
    private formTemplateService: FormTemplateService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadAvailableTemplates();
    
    if (this.existingPhases.length > 0) {
      this.populateExistingPhases();
    } else {
      // Add one default phase
      this.addPhase();
    }
  }

  initializeForm(): void {
    this.phaseForm = this.fb.group({
      phases: this.fb.array([])
    });
  }

  get phases(): FormArray {
    return this.phaseForm.get('phases') as FormArray;
  }

  createPhaseFormGroup(phase?: Partial<StudyPhaseConfig>): FormGroup {
    return this.fb.group({
      id: [phase?.id || ''],
      phaseName: [phase?.phaseName || '', Validators.required],
      phaseCode: [phase?.phaseCode || '', [Validators.required, Validators.maxLength(10)]],
      description: [phase?.description || ''],
      order: [phase?.order || this.phases.length + 1, [Validators.required, Validators.min(1)]],
      plannedDurationDays: [phase?.plannedDurationDays || null],
      windowStartDays: [phase?.windowStartDays || null],
      windowEndDays: [phase?.windowEndDays || null],
      isActive: [phase?.isActive !== false],
      allowSkip: [phase?.allowSkip || false],
      allowParallel: [phase?.allowParallel || false],
      templateAssignments: this.fb.array(
        phase?.templateAssignments?.map(ta => this.createTemplateAssignmentGroup(ta)) || []
      )
    });
  }

  createTemplateAssignmentGroup(assignment?: PhaseTemplateAssignment): FormGroup {
    return this.fb.group({
      templateId: [assignment?.templateId || '', Validators.required],
      templateName: [assignment?.templateName || ''],
      isRequired: [assignment?.isRequired || false],
      order: [assignment?.order || 1],
      dueAfterDays: [assignment?.dueAfterDays || null],
      category: [assignment?.category || ''],
      description: [assignment?.description || '']
    });
  }

  addPhase(): void {
    this.phases.push(this.createPhaseFormGroup());
  }

  removePhase(index: number): void {
    this.phases.removeAt(index);
    this.reorderPhases();
  }

  addTemplateToPhase(phaseIndex: number): void {
    const phase = this.phases.at(phaseIndex);
    const templates = phase.get('templateAssignments') as FormArray;
    templates.push(this.createTemplateAssignmentGroup());
  }

  removeTemplateFromPhase(phaseIndex: number, templateIndex: number): void {
    const phase = this.phases.at(phaseIndex);
    const templates = phase.get('templateAssignments') as FormArray;
    templates.removeAt(templateIndex);
  }

  onTemplateSelected(phaseIndex: number, templateIndex: number, templateId: string): void {
    const template = this.availableTemplates.find(t => t.id === templateId);
    if (template) {
      const phase = this.phases.at(phaseIndex);
      const templates = phase.get('templateAssignments') as FormArray;
      const templateGroup = templates.at(templateIndex);
      
      templateGroup.patchValue({
        templateName: template.name,
        category: template.templateType === 'patient' ? 'patient_data' : 
                  template.templateType === 'study_subject' ? 'study_data' : 'general'
      });
    }
  }

  usePhaseTemplate(template: any): void {
    const newPhase = this.createPhaseFormGroup({
      phaseName: template.name,
      phaseCode: template.code,
      description: template.description,
      order: this.phases.length + 1
    });
    this.phases.push(newPhase);
  }

  reorderPhases(): void {
    this.phases.controls.forEach((phase, index) => {
      phase.patchValue({ order: index + 1 });
    });
  }

  movePhaseUp(index: number): void {
    if (index > 0) {
      const phase = this.phases.at(index);
      this.phases.removeAt(index);
      this.phases.insert(index - 1, phase);
      this.reorderPhases();
    }
  }

  movePhaseDown(index: number): void {
    if (index < this.phases.length - 1) {
      const phase = this.phases.at(index);
      this.phases.removeAt(index);
      this.phases.insert(index + 1, phase);
      this.reorderPhases();
    }
  }

  async loadAvailableTemplates(): Promise<void> {
    try {
      // Load templates that are published or in review
      const templates = await firstValueFrom(
        this.formTemplateService.templates$
      );
      
      this.availableTemplates = templates.filter((t: FormTemplate) => 
        t.status === 'published' || t.status === 'review'
      );
    } catch (error) {
      console.error('Error loading templates:', error);
      this.error = 'Failed to load available templates';
    }
  }

  populateExistingPhases(): void {
    this.existingPhases.forEach(phase => {
      this.phases.push(this.createPhaseFormGroup(phase));
    });
  }

  async savePhases(): Promise<void> {
    if (this.phaseForm.invalid) {
      this.markFormGroupTouched(this.phaseForm);
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const phaseConfigs = this.phaseForm.value.phases;
      
      // If updating existing phases
      if (this.existingPhases.length > 0) {
        // Update existing phases
        for (const config of phaseConfigs) {
          if (config.id) {
            await this.studyPhaseService.updatePhase(config.id, config);
          }
        }
      } else {
        // Create new phases
        await this.studyPhaseService.createStudyPhases(this.studyId, phaseConfigs);
      }

      // Reload phases
      const updatedPhases = await this.studyPhaseService.getStudyPhases(this.studyId);
      this.phasesUpdated.emit(updatedPhases);
      this.closeModal.emit();
    } catch (error) {
      console.error('Error saving phases:', error);
      this.error = 'Failed to save study phases. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  cancel(): void {
    this.closeModal.emit();
  }

  private markFormGroupTouched(formGroup: FormGroup | FormArray): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup || control instanceof FormArray) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getTemplateAssignments(phaseIndex: number): FormArray {
    return this.phases.at(phaseIndex).get('templateAssignments') as FormArray;
  }

  getAvailableTemplatesForPhase(phaseIndex: number): FormTemplate[] {
    const phase = this.phases.at(phaseIndex);
    const assignedTemplateIds = (phase.get('templateAssignments') as FormArray).controls
      .map(control => control.get('templateId')?.value)
      .filter(id => id);
    
    return this.availableTemplates.filter(t => !assignedTemplateIds.includes(t.id));
  }
}
