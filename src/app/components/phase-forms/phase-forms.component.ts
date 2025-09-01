import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { FormInstanceService } from '../../services/form-instance.service';
import { PatientService } from '../../services/patient.service';
import { StudyPhaseService } from '../../services/study-phase.service';
import { FormTemplateService } from '../../services/form-template.service';
import { FormInstance } from '../../models/form-template.model';
import { PatientPhase } from '../../models/patient.model';
import { PatientPhaseProgress } from '../../models/study-phase.model';
import { FormViewerComponent } from '../form-viewer/form-viewer.component';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-phase-forms',
  standalone: true,
  imports: [CommonModule, FormViewerComponent, TranslatePipe],
  templateUrl: './phase-forms.component.html',
  styleUrls: ['./phase-forms.component.scss']
})
export class PhaseFormsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  patientId: string = '';
  studyId: string = '';
  phaseId: string = '';
  visitSubcomponentId: string = '';
  
  patient: any;
  phaseData: PatientPhase | null = null;
  phaseProgress: PatientPhaseProgress | null = null;
  formInstances: FormInstance[] = [];
  templates: Map<string, any> = new Map();
  
  selectedFormInstance: FormInstance | null = null;
  isLoading = true;
  error: string | null = null;
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private formInstanceService: FormInstanceService,
    private patientService: PatientService,
    private studyPhaseService: StudyPhaseService,
    private formTemplateService: FormTemplateService
  ) {}
  
  ngOnInit() {
    // Get route parameters
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.patientId = params['patientId'];
      this.studyId = params['studyId'];
      this.phaseId = params['phaseId'];
      this.visitSubcomponentId = params['visitSubcomponentId'];
      
      this.loadPhaseData();
    });
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  async loadPhaseData() {
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load patient data
      this.patient = await this.patientService.getPatient(this.patientId);
      
      // Load phase data
      const phases = this.patient?.phases || [];
      this.phaseData = phases.find((p: PatientPhase) => p.id === this.phaseId) || null;
      
      // Load phase progress
      const progress = await this.studyPhaseService.getPatientPhaseProgress(
        this.patientId, 
        this.studyId
      );
      this.phaseProgress = progress.find(p => p.phaseId === this.phaseId) || null;
      
      // Load form instances for this phase
      this.formInstanceService.getFormInstancesByVisitSubcomponent(
        this.patientId,
        this.visitSubcomponentId
      ).pipe(takeUntil(this.destroy$)).subscribe(instances => {
        this.formInstances = instances;
        this.loadTemplatesForInstances(instances);
      });
      
    } catch (error) {
      console.error('Error loading phase data:', error);
      this.error = 'Failed to load phase data';
    } finally {
      this.isLoading = false;
    }
  }
  
  async loadTemplatesForInstances(instances: FormInstance[]) {
    const templateIds = [...new Set(instances.map(i => i.templateId))];
    
    for (const templateId of templateIds) {
      try {
        const template = await this.formTemplateService.getTemplate(templateId);
        if (template) {
          this.templates.set(templateId, template);
        }
      } catch (error) {
        console.error(`Failed to load template ${templateId}:`, error);
      }
    }
  }
  
  selectFormInstance(instance: FormInstance) {
    this.selectedFormInstance = instance;
  }
  
  async onFormSubmit(formData: any) {
    if (!this.selectedFormInstance) return;
    
    try {
      // Update form instance with submitted data
      await this.formInstanceService.updateFormInstance(
        this.selectedFormInstance.id!,
        {
          formData: formData,
          status: 'completed',
          completionPercentage: 100
        },
        'Form submitted'
      );
      
      // Update phase progress
      await this.studyPhaseService.updatePhaseProgressForFormCompletion(
        this.patientId,
        this.phaseId,
        this.selectedFormInstance.templateId,
        this.selectedFormInstance.id!
      );
      
      // Reload data to reflect changes
      await this.loadPhaseData();
      
      // Clear selection
      this.selectedFormInstance = null;
      
    } catch (error) {
      console.error('Error submitting form:', error);
      this.error = 'Failed to submit form';
    }
  }
  
  async onFormSave(formData: any) {
    if (!this.selectedFormInstance) return;
    
    try {
      // Update form instance with saved data
      await this.formInstanceService.updateFormInstance(
        this.selectedFormInstance.id!,
        {
          formData: formData,
          status: 'in_progress',
          completionPercentage: this.calculateCompletionPercentage(formData)
        },
        'Form saved as in progress'
      );
      
      // Reload form instances
      const instances = await firstValueFrom(
        this.formInstanceService.getFormInstancesByVisitSubcomponent(
          this.patientId,
          this.visitSubcomponentId
        )
      );
      this.formInstances = instances;
      
    } catch (error) {
      console.error('Error saving form:', error);
      this.error = 'Failed to save form';
    }
  }
  
  calculateCompletionPercentage(formData: any): number {
    if (!this.selectedFormInstance) return 0;
    
    const template = this.templates.get(this.selectedFormInstance.templateId);
    if (!template) return 0;
    
    const requiredFields = template.fields.filter((f: any) => f.required);
    if (requiredFields.length === 0) return 100;
    
    const completedFields = requiredFields.filter((f: any) => {
      const value = formData[f.id];
      return value !== null && value !== undefined && value !== '';
    });
    
    return Math.round((completedFields.length / requiredFields.length) * 100);
  }
  
  getFormStatusClass(instance: FormInstance): string {
    switch (instance.status) {
      case 'completed': return 'completed';
      case 'in_progress': return 'in-progress';
      case 'locked': return 'locked';
      default: return 'not-started';
    }
  }
  
  getFormStatusIcon(instance: FormInstance): string {
    switch (instance.status) {
      case 'completed': return 'check_circle';
      case 'in_progress': return 'edit';
      case 'locked': return 'lock';
      default: return 'radio_button_unchecked';
    }
  }
  
  isFormRequired(templateId: string): boolean {
    return this.phaseData?.blockingTemplates?.includes(templateId) || false;
  }
  
  canProgressToNextPhase(): boolean {
    return this.phaseData?.canProgressToNextPhase || false;
  }
  
  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
