import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudyPhaseService } from '../../services/study-phase.service';
import { PatientPhaseProgress, StudyPhaseConfig } from '../../models/study-phase.model';
import { Observable, combineLatest, map } from 'rxjs';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-patient-phase-progress',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './patient-phase-progress.component.html',
  styleUrls: ['./patient-phase-progress.component.scss']
})
export class PatientPhaseProgressComponent implements OnInit {
  @Input() patientId!: string;
  @Input() studyId!: string;
  @Output() phaseSelected = new EventEmitter<{ phase: StudyPhaseConfig, progress: PatientPhaseProgress }>();
  
  phases: StudyPhaseConfig[] = [];
  phaseProgressData: { phase: StudyPhaseConfig, progress: PatientPhaseProgress }[] = [];
  loading = true;
  
  constructor(private studyPhaseService: StudyPhaseService) {}
  
  ngOnInit() {
    this.loadPhaseProgress();
  }
  
  private async loadPhaseProgress() {
    try {
      // Import required Firestore functions
      const { doc, getDoc, getFirestore } = await import('@angular/fire/firestore');
      const firestore = getFirestore();
      
      // First, get the patient document to retrieve phases from the patient itself
      const patientRef = doc(firestore, 'patients', this.patientId);
      const patientDoc = await getDoc(patientRef);
      
      if (patientDoc.exists()) {
        const patientData = patientDoc.data();
        
        // Use phases from patient document first, fallback to visitSubcomponents
        const patientPhases = patientData['phases'] || patientData['visitSubcomponents'] || [];
        
        // If patient has phases, use those instead of querying study phases
        if (patientPhases.length > 0) {
          // Convert patient phases to StudyPhaseConfig format
          this.phases = patientPhases.map((phase: any) => ({
            id: phase.id || phase.phaseId || '',
            phaseName: phase.name || phase.phaseName || '',
            phaseCode: phase.phaseCode || '',
            description: phase.description || '',
            order: phase.order || 0,
            duration: phase.duration || 0,
            durationUnit: phase.durationUnit || 'days',
            isRequired: phase.isRequired !== false,
            templateAssignments: phase.templateAssignments || phase.formTemplates || [],
            createdAt: phase.createdAt,
            createdBy: phase.createdBy,
            lastModifiedAt: phase.lastModifiedAt,
            lastModifiedBy: phase.lastModifiedBy
          }));
        } else {
          // Fallback to querying study phases if patient doesn't have phases
          this.phases = await this.studyPhaseService.getStudyPhases(this.studyId);
        }
      } else {
        // If patient document doesn't exist, fallback to study phases
        this.phases = await this.studyPhaseService.getStudyPhases(this.studyId);
      }
      
      // Get patient phase progress
      const progress = await this.studyPhaseService.getPatientPhaseProgress(this.patientId, this.studyId);
      
      // Combine phases with their progress
      this.phaseProgressData = this.phases.map(phase => {
        const existingProgress = progress.find(p => p.phaseId === phase.id);
        return { phase, progress: existingProgress || this.createEmptyProgress(phase) };
      });
    } catch (error) {
      console.error('Error loading phase progress:', error);
    } finally {
      this.loading = false;
    }
  }
  
  private createEmptyProgress(phase: StudyPhaseConfig): PatientPhaseProgress {
    const phaseProgress: PatientPhaseProgress = {
      id: '',
      patientId: this.patientId,
      studyId: this.studyId,
      phaseId: phase.id,
      phaseName: phase.phaseName,
      status: 'not_started',
      totalTemplates: 0,
      requiredTemplates: 0,
      completedTemplates: 0,
      completedRequiredTemplates: 0,
      progressPercentage: 0,
      canProgress: false,
      blockingReasons: ['Phase not started'],
      formCompletionStatus: {},
      createdAt: new Date(),
      createdBy: '',
      lastModifiedAt: new Date(),
      lastModifiedBy: ''
    };
    return phaseProgress;
  }
  
  selectPhase(phase: StudyPhaseConfig, progress: PatientPhaseProgress) {
    this.phaseSelected.emit({ phase, progress });
  }
  
  getPhaseStatusClass(status: string): string {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'in_progress':
        return 'status-in-progress';
      case 'not_started':
        return 'status-not-started';
      default:
        return '';
    }
  }
  
  getPhaseIcon(phaseCode: string): string {
    const iconMap: { [key: string]: string } = {
      'SCR': 'fas fa-clipboard-check',      // Screening
      'BSL': 'fas fa-chart-line',           // Baseline
      'TRT': 'fas fa-pills',                // Treatment
      'FU': 'fas fa-calendar-check',        // Follow-up
      'V': 'fas fa-hospital-user',          // Visit
      'UNS': 'fas fa-exclamation-circle'    // Unscheduled
    };
    // Also check for longer codes
    const codePrefix = phaseCode?.substring(0, 3)?.toUpperCase();
    return iconMap[phaseCode] || iconMap[codePrefix] || 'fas fa-folder';
  }
  
  canAccessPhase(phaseData: { phase: StudyPhaseConfig, progress: PatientPhaseProgress }, index: number, allPhases: Array<{ phase: StudyPhaseConfig, progress: PatientPhaseProgress }>): boolean {
    // First phase is always accessible
    if (index === 0) return true;
    
    // Check if previous phase is complete or current phase is optional
    const previousPhase = allPhases[index - 1];
    const currentPhase = allPhases[index];
    
    // Check if phase is accessible based on progression rules
    if (previousPhase && !previousPhase.progress.canProgress && !currentPhase.phase.allowSkip) {
      return false; // Disabled if previous phase not complete and current phase not skippable
    }
    return true;
  }
}
