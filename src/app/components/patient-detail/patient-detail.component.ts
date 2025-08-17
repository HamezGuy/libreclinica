import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Patient, PatientVisitSubcomponent } from '../../models/patient.model';
import { StudyService } from '../../services/study.service';
import { PatientService } from '../../services/patient.service';
import { FormTemplateService } from '../../services/form-template.service';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-patient-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './patient-detail.component.html',
  styleUrls: ['./patient-detail.component.scss']
})
export class PatientDetailComponent implements OnInit {
  @Input() patientId?: string;
  
  patient: Patient | null = null;
  study: any = null;
  loading = true;
  error: string | null = null;
  expandedPhases: Set<string> = new Set();
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private studyService: StudyService,
    private patientService: PatientService,
    private formTemplateService: FormTemplateService
  ) {}
  
  async ngOnInit() {
    try {
      // Get patient ID from route or input
      const id = this.patientId || this.route.snapshot.paramMap.get('id');
      if (!id) {
        throw new Error('No patient ID provided');
      }
      
      // Load patient data
      await this.loadPatientData(id);
    } catch (error) {
      console.error('Error loading patient details:', error);
      this.error = 'Failed to load patient details';
      this.loading = false;
    }
  }
  
  private async loadPatientData(patientId: string) {
    try {
      // Get patient data using the new getPatientById method
      this.patient = await this.patientService.getPatientById(patientId);
      
      if (!this.patient) {
        throw new Error('Patient not found');
      }
      
      // Load study data if patient is enrolled
      if (this.patient.studyId) {
        const studies = await firstValueFrom(this.studyService.getStudies());
        this.study = studies.find(s => s.id === this.patient!.studyId);
      }
      
      this.loading = false;
    } catch (error) {
      console.error('Error in loadPatientData:', error);
      throw error;
    }
  }
  
  togglePhase(phaseId: string) {
    if (this.expandedPhases.has(phaseId)) {
      this.expandedPhases.delete(phaseId);
    } else {
      this.expandedPhases.add(phaseId);
    }
  }
  
  isPhaseExpanded(phaseId: string): boolean {
    return this.expandedPhases.has(phaseId);
  }
  
  getPhaseCompletionPercentage(phase: PatientVisitSubcomponent): number {
    return phase.completionPercentage || 0;
  }
  
  getPhaseStatus(phase: PatientVisitSubcomponent): string {
    return phase.status || 'scheduled';
  }
  
  getTemplateStatus(templateId: string, phase: PatientVisitSubcomponent): string {
    if (phase.completedTemplates?.includes(templateId)) {
      return 'completed';
    } else if (phase.inProgressTemplates?.includes(templateId)) {
      return 'in-progress';
    }
    return 'pending';
  }
  
  isTemplateRequired(templateId: string, phase: PatientVisitSubcomponent): boolean {
    return phase.requiredTemplateIds?.includes(templateId) || false;
  }
  
  openTemplate(template: any, phase: PatientVisitSubcomponent) {
    // Navigate to form instance or create new instance
    console.log('Opening template:', template, 'for phase:', phase);
    // TODO: Implement navigation to form instance
  }
  
  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
