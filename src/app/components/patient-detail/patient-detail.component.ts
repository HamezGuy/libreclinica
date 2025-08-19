import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PatientService } from '../../services/patient.service';
import { StudyService } from '../../services/study.service';
import { ExcelConversionService } from '../../services/excel-conversion.service';
import { Patient } from '../../models/patient.model';
import { Study } from '../../models/study.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { FormTemplateService } from '../../services/form-template.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-patient-detail',
  standalone: true,
  imports: [
    CommonModule, 
    TranslatePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    FormsModule
  ],
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
  selectedPhaseId: string | null = null;
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private patientService = inject(PatientService);
  private studyService = inject(StudyService);
  private excelService = inject(ExcelConversionService);
  private dialog = inject(MatDialog);
  private formTemplateService = inject(FormTemplateService);
  
  async ngOnInit() {
    try {
      // Get patient ID from route or input
      const id = this.patientId || this.route.snapshot.paramMap.get('id');
      if (!id) {
        throw new Error('No patient ID provided');
      }
      
      // Load patient data
      await this.loadPatientData(id);
      
      // Auto-select first phase if available
      if (this.patient?.phases && this.patient.phases.length > 0) {
        this.selectedPhaseId = this.patient.phases[0].id;
        this.expandedPhases.add(this.patient.phases[0].id);
      }
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
  
  getCompletedTemplatesCount(visit: any): number {
    return visit.formTemplates?.filter((t: any) => t.status === 'completed').length || 0;
  }
  
  getTemplateStatus(phase: any, templateId: string): string {
    return phase.formTemplates?.find((t: any) => t.id === templateId)?.status || 'not_started';
  }
  
  getTemplateCompletionPercentage(visit: any): number {
    const completedTemplates = visit.formTemplates?.filter((t: any) => t.status === 'completed').length || 0;
    const totalTemplates = visit.formTemplates?.length || 0;
    return (completedTemplates / totalTemplates) * 100 || 0;
  }
  
  isTemplateRequired(templateId: string, phase: any): boolean {
    return phase.requiredTemplateIds?.includes(templateId) || false;
  }
  
  openTemplate(template: any, visit: any) {
    // Navigate to form instance or create new instance
    console.log('Opening template:', template, 'for visit:', visit);
    // TODO: Implement navigation to form instance
  }
  
  getFormsForPhase(phaseId: string): any[] {
    if (!this.patient?.forms) return [];
    
    // Filter forms that belong to this phase
    // Forms may have a phaseId property or be linked via phase's formTemplateIds
    return this.patient.forms.filter((form: any) => 
      form.phaseId === phaseId || 
      form.originalPhaseId === phaseId
    );
  }
  
  selectPhase(phaseId: string) {
    this.selectedPhaseId = phaseId;
    // Auto-expand the selected phase
    if (!this.expandedPhases.has(phaseId)) {
      this.expandedPhases.add(phaseId);
    }
    // Scroll to the phase in the main content
    setTimeout(() => {
      const element = document.querySelector(`[data-phase-id="${phaseId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
  
  openForm(form: any, phase: any) {
    // Navigate to form instance for data entry
    console.log('Opening form:', form, 'for phase:', phase);
    // TODO: Implement navigation to form instance for data entry
    // this.router.navigate(['/form-instance', form.id]);
  }
  
  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // Excel Export functionality
  showExportModal = false;
  exportOptions = {
    includeMetadata: true,
    selectedPhases: [] as string[],
    allPhases: true
  };

  openExportModal(): void {
    this.showExportModal = true;
    this.exportOptions.allPhases = true;
    this.exportOptions.selectedPhases = [];
  }

  closeExportModal(): void {
    this.showExportModal = false;
  }

  togglePhaseSelection(phaseId: string): void {
    const index = this.exportOptions.selectedPhases.indexOf(phaseId);
    if (index > -1) {
      this.exportOptions.selectedPhases.splice(index, 1);
    } else {
      this.exportOptions.selectedPhases.push(phaseId);
    }
    this.exportOptions.allPhases = false;
  }

  isPhaseSelected(phaseId: string): boolean {
    return this.exportOptions.allPhases || 
           this.exportOptions.selectedPhases.includes(phaseId);
  }

  async exportToExcel(): Promise<void> {
    if (!this.patient) return;

    try {
      const phasesToExport = this.exportOptions.allPhases 
        ? undefined 
        : this.exportOptions.selectedPhases;

      await this.excelService.exportPatientDataToExcel(
        this.patient,
        this.exportOptions.includeMetadata,
        phasesToExport
      );

      this.closeExportModal();
      
      // Show success message (you can add a snackbar here)
      console.log('Patient data exported successfully');
    } catch (error) {
      console.error('Error exporting patient data:', error);
      // Show error message (you can add a snackbar here)
    }
  }
}
