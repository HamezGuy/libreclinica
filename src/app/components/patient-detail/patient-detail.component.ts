import { Component, OnInit, inject, Input, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PatientService } from '../../services/patient.service';
import { StudyService } from '../../services/study.service';
import { ExcelConversionService } from '../../services/excel-conversion.service';
import { Patient } from '../../models/patient.model';
import { Study } from '../../models/study.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormTemplateService } from '../../services/form-template.service';
import { firstValueFrom } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';

// Enhanced Phase Interface
interface PhaseData {
  id: string;
  name: string;
  description?: string;
  type: 'screening' | 'baseline' | 'treatment' | 'follow_up' | 'closeout';
  order: number;
  status: 'completed' | 'in-progress' | 'todo' | 'locked';
  startDate?: Date;
  endDate?: Date;
  scheduledDate?: Date;
  windowStartDate?: Date;
  windowEndDate?: Date;
  templates: TemplateData[];
  completionPercentage: number;
  isCurrentPhase?: boolean;
  canEdit: boolean;
  blockers?: string[];
}

// Enhanced Template Interface
interface TemplateData {
  id: string;
  templateId: string;
  name: string;
  version: string;
  category: string;
  status: 'completed' | 'in-progress' | 'not-started' | 'locked';
  required: boolean;
  completedDate?: Date;
  completedBy?: string;
  formInstanceId?: string;
  estimatedTime?: number;
  actualTime?: number;
  fields?: any[];
  validationErrors?: string[];
}

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
    MatTabsModule,
    MatProgressBarModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
    MatSelectModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './patient-detail.component.html',
  styleUrls: ['./patient-detail.component.scss']
})
export class PatientDetailComponent implements OnInit, AfterViewInit {
  @Input() patientId?: string;
  @ViewChild('phaseTimelineCanvas') phaseTimelineCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('progressChart') progressChart?: ElementRef<HTMLCanvasElement>;
  
  patient: Patient | null = null;
  study: any = null;
  loading = true;
  error: string | null = null;
  expandedPhases: Set<string> = new Set();
  selectedPhaseId: string | null = null;
  selectedTabIndex = 0;
  phaseTimelineChart: Chart | null = null;
  studyProgressChart: Chart | null = null;
  
  // Export modal properties
  showExportModal: boolean = false;
  exportOptions = {
    allPhases: true,
    selectedPhases: [] as string[],
    includeMetadata: true
  };
  
  // Enhanced phase management
  phases: PhaseData[] = [];
  phaseStatuses = new Map<string, {
    status: 'completed' | 'in-progress' | 'todo' | 'locked';
    completionPercentage: number;
    completedTemplates: number;
    totalTemplates: number;
    blockers: string[];
  }>();
  phaseTemplates = new Map<string, TemplateData[]>();
  currentPhaseIndex: number = 0;
  
  // Enhanced study progress metrics
  studyMetrics: {
    totalVisits: number;
    completedVisits: number;
    missedVisits: number;
    upcomingVisits: number;
    overallProgress: number;
    complianceRate: number;
    averageFormCompletionTime: string;
    protocolDeviations: number;
    totalTemplates: number;
    completedTemplates: number;
    inProgressTemplates: number;
    dataQualityScore: number;
    lastActivityDate?: Date;
    nextMilestone?: string;
    estimatedCompletionDate?: Date;
  } = {
    totalVisits: 0,
    completedVisits: 0,
    missedVisits: 0,
    upcomingVisits: 0,
    overallProgress: 0,
    complianceRate: 0,
    averageFormCompletionTime: '15 mins',
    protocolDeviations: 0,
    totalTemplates: 0,
    completedTemplates: 0,
    inProgressTemplates: 0,
    dataQualityScore: 100,
    lastActivityDate: undefined,
    nextMilestone: undefined,
    estimatedCompletionDate: undefined
  };
  
  // Template management
  showTemplateDialog = false;
  showTemplateAssignmentModal = false;
  editingTemplate: TemplateData | null = null;
  selectedPhaseForTemplate: PhaseData | null = null;
  availableTemplates: any[] = [];
  selectedTemplatesForAssignment: string[] = [];
  templateFilter = {
    category: '',
    search: '',
    showOnlyRequired: false
  };
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private patientService = inject(PatientService);
  private studyService = inject(StudyService);
  private excelService = inject(ExcelConversionService);
  private dialog = inject(MatDialog);
  private formTemplateService = inject(FormTemplateService);
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private authService = inject(EdcCompliantAuthService);
  
  templateForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    version: ['1.0', Validators.required],
    required: [false],
    category: ['data_collection'],
    estimatedTime: [30],
    fields: this.fb.array([])
  });
  
  async ngOnInit() {
    Chart.register(...registerables);
    
    try {
      // Get patient ID from route or input
      const id = this.patientId || this.route.snapshot.paramMap.get('id');
      if (!id) {
        throw new Error('No patient ID provided');
      }
      
      // Load patient data
      await this.loadPatientData(id);
      
      // Initialize phase data
      this.initializePhaseData();
      
      // Calculate study metrics
      this.calculateStudyMetrics();
      
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
  
  ngAfterViewInit() {
    if (this.patient?.phases && this.patient.phases.length > 0) {
      setTimeout(() => this.createPhaseTimeline(), 100);
    }
  }
  
  private async loadPatientData(patientId: string) {
    try {
      // Get patient data using the new getPatientById method
      this.patient = await this.patientService.getPatientById(patientId);
      
      if (!this.patient) {
        throw new Error('Patient not found');
      }
      
      // Ensure phases array exists
      if (!this.patient.phases) {
        this.patient.phases = [];
      }
      
      // Load study data if patient is enrolled
      if (this.patient.studyId) {
        const studies = await firstValueFrom(this.studyService.getStudies());
        this.study = studies.find(s => s.id === this.patient!.studyId);
        
        // If patient has no phases but study has phases, copy them
        if (this.patient.phases.length === 0 && this.study?.phases) {
          // Transform StudyPhaseConfig to patient phase structure
          this.patient.phases = this.study.phases.map((studyPhase: any) => ({
            id: studyPhase.id,
            phaseId: studyPhase.id,
            phaseName: studyPhase.phaseName,
            phaseCode: studyPhase.phaseCode,
            description: studyPhase.description,
            order: studyPhase.order,
            status: 'not_started',
            
            // Copy template assignments as patient templates
            formTemplates: studyPhase.templateAssignments ? 
              studyPhase.templateAssignments.map((assignment: any) => ({
                templateId: assignment.templateId,
                name: assignment.templateName,
                required: assignment.isRequired,
                order: assignment.order,
                category: assignment.category || 'general',
                description: assignment.description,
                dueAfterDays: assignment.dueAfterDays,
                status: 'not-started',
                completedDate: null,
                completedBy: null,
                formInstanceId: null
              })) : [],
            
            // Phase timing from study
            plannedDurationDays: studyPhase.plannedDurationDays,
            windowStartDays: studyPhase.windowStartDays,
            windowEndDays: studyPhase.windowEndDays,
            
            // Patient-specific tracking
            startedDate: null,
            completedDate: null,
            completionPercentage: 0,
            totalTemplates: studyPhase.templateAssignments?.length || 0,
            completedTemplates: 0,
            requiredTemplates: studyPhase.templateAssignments?.filter((t: any) => t.isRequired).length || 0,
            completedRequiredTemplates: 0
          }));
        }
      }
      
      // Transform patient phases to enhanced PhaseData structure
      this.phases = await this.transformPhasesToEnhancedStructure();
      
      // Load available templates for assignment
      await this.loadAvailableTemplates();
      
      this.loading = false;
    } catch (error) {
      console.error('Error in loadPatientData:', error);
      throw error;
    }
  }
  
  // Initialize phase data and calculate metrics
  initializePhaseData() {
    if (!this.phases || this.phases.length === 0) return;
    
    // Calculate phase statuses and determine current phase
    let foundCurrent = false;
    this.phases.forEach((phase, index) => {
      const completedTemplates = phase.templates.filter(t => t.status === 'completed').length;
      const inProgressTemplates = phase.templates.filter(t => t.status === 'in-progress').length;
      const totalTemplates = phase.templates.length;
      const completionPercentage = totalTemplates > 0 ? (completedTemplates / totalTemplates) * 100 : 0;
      
      // Determine phase status based on templates and chronological order
      let status: 'completed' | 'in-progress' | 'todo' | 'locked' = 'todo';
      const blockers: string[] = [];
      
      if (index > 0 && this.phases[index - 1].status !== 'completed') {
        status = 'locked';
        blockers.push(`Previous phase "${this.phases[index - 1].name}" must be completed`);
      } else if (completionPercentage === 100 && totalTemplates > 0) {
        status = 'completed';
      } else if (inProgressTemplates > 0 || completedTemplates > 0) {
        status = 'in-progress';
      } else if (!foundCurrent && index > 0 && this.phases[index - 1].status === 'completed') {
        status = 'in-progress';
        phase.isCurrentPhase = true;
        this.currentPhaseIndex = index;
        foundCurrent = true;
      }
      
      // Check for required templates blocking progression
      const incompleteRequired = phase.templates.filter(t => t.required && t.status !== 'completed');
      if (incompleteRequired.length > 0) {
        blockers.push(...incompleteRequired.map(t => `Complete required template: ${t.name}`));
      }
      
      phase.status = status;
      phase.completionPercentage = completionPercentage;
      phase.canEdit = status !== 'locked';
      phase.blockers = blockers;
      
      this.phaseStatuses.set(phase.id, {
        status,
        completionPercentage,
        completedTemplates,
        totalTemplates,
        blockers
      });
      
      this.phaseTemplates.set(phase.id, phase.templates);
    });
    
    // Create phase timeline after initialization
    setTimeout(() => this.createPhaseTimeline(), 100);
    setTimeout(() => this.createStudyProgressChart(), 150);
  }
  
  // Calculate study metrics from patient data
  calculateStudyMetrics() {
    if (!this.phases || this.phases.length === 0) return;
    
    const totalPhases = this.phases.length;
    const completedPhases = this.phases.filter(p => p.status === 'completed').length;
    const inProgressPhases = this.phases.filter(p => p.status === 'in-progress').length;
    
    const allTemplates = this.phases.flatMap(p => p.templates);
    const totalTemplates = allTemplates.length;
    const completedTemplates = allTemplates.filter(t => t.status === 'completed').length;
    const inProgressTemplates = allTemplates.filter(t => t.status === 'in-progress').length;
    
    const overallProgress = totalTemplates > 0 ? 
      (completedTemplates / totalTemplates) * 100 : 0;
    
    // Calculate data quality score based on validation errors
    const templatesWithErrors = allTemplates.filter(t => t.validationErrors && t.validationErrors.length > 0).length;
    const dataQualityScore = totalTemplates > 0 ? 
      ((totalTemplates - templatesWithErrors) / totalTemplates) * 100 : 100;
    
    // Find next milestone
    const currentPhase = this.phases.find(p => p.isCurrentPhase);
    const nextMilestone = currentPhase ? `Complete ${currentPhase.name}` : 
      (completedPhases < totalPhases ? `Start ${this.phases[completedPhases].name}` : 'Study Complete');
    
    // Estimate completion date based on average completion rate
    const daysElapsed = this.patient?.enrollmentDate ? 
      Math.floor((new Date().getTime() - new Date(this.patient.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const progressRate = daysElapsed > 0 ? overallProgress / daysElapsed : 0;
    const remainingProgress = 100 - overallProgress;
    const estimatedDaysRemaining = progressRate > 0 ? remainingProgress / progressRate : 0;
    const estimatedCompletionDate = estimatedDaysRemaining > 0 ? 
      new Date(Date.now() + estimatedDaysRemaining * 24 * 60 * 60 * 1000) : undefined;
    
    this.studyMetrics = {
      totalVisits: totalPhases,
      completedVisits: completedPhases,
      missedVisits: this.patient?.studyProgress?.missedVisits || 0,
      upcomingVisits: totalPhases - completedPhases,
      overallProgress,
      complianceRate: 100 - (this.patient?.studyProgress?.missedVisits || 0) * 10,
      averageFormCompletionTime: this.calculateAverageCompletionTime(allTemplates),
      protocolDeviations: this.patient?.protocolDeviations?.length || 0,
      totalTemplates,
      completedTemplates,
      inProgressTemplates,
      dataQualityScore,
      lastActivityDate: this.patient?.lastModifiedAt,
      nextMilestone,
      estimatedCompletionDate
    };
  }
  
  // Transform phases to enhanced structure
  private async transformPhasesToEnhancedStructure(): Promise<PhaseData[]> {
    if (!this.patient?.phases) return [];
    
    return this.patient.phases.map((phase: any, index: number) => {
      // Transform patient phase templates to TemplateData structure
      const templates: TemplateData[] = (phase.formTemplates || []).map((template: any) => ({
        id: template.templateId || `template-${Date.now()}-${Math.random()}`,
        templateId: template.templateId,
        name: template.name || 'Unnamed Template',
        version: template.version || '1.0',
        category: template.category || 'general',
        status: template.status || 'not-started',
        required: template.required !== undefined ? template.required : true,
        completedDate: template.completedDate,
        completedBy: template.completedBy,
        formInstanceId: template.formInstanceId,
        estimatedTime: template.estimatedTime || template.dueAfterDays || 15,
        actualTime: template.actualTime,
        fields: template.fields || [],
        validationErrors: template.validationErrors || []
      }));
      
      // Calculate phase dates based on study configuration
      let scheduledDate = phase.scheduledDate;
      let windowStartDate = phase.windowStartDate;
      let windowEndDate = phase.windowEndDate;
      
      if (!scheduledDate && this.patient?.enrollmentDate && phase.plannedDurationDays) {
        const enrollDate = new Date(this.patient.enrollmentDate);
        // Calculate scheduled date based on previous phases' durations
        let daysOffset = 0;
        for (let i = 0; i < index; i++) {
          daysOffset += this.patient?.phases?.[i]?.plannedDurationDays || 0;
        }
        scheduledDate = new Date(enrollDate.getTime() + daysOffset * 24 * 60 * 60 * 1000);
        
        // Calculate window dates
        if (phase.windowStartDays) {
          windowStartDate = new Date(scheduledDate.getTime() - phase.windowStartDays * 24 * 60 * 60 * 1000);
        }
        if (phase.windowEndDays) {
          windowEndDate = new Date(scheduledDate.getTime() + phase.windowEndDays * 24 * 60 * 60 * 1000);
        }
      }
      
      return {
        id: phase.id || phase.phaseId || `phase-${index}`,
        name: phase.phaseName || phase.name || `Phase ${index + 1}`,
        description: phase.description,
        type: phase.phaseCode || phase.type || 'treatment',
        order: phase.order !== undefined ? phase.order : index,
        status: this.mapPhaseStatus(phase.status),
        startDate: phase.startedDate || phase.startDate,
        endDate: phase.completedDate || phase.endDate,
        scheduledDate,
        windowStartDate,
        windowEndDate,
        templates,
        completionPercentage: phase.completionPercentage || 0,
        isCurrentPhase: false,
        canEdit: true,
        blockers: []
      };
    });
  }
  
  // Map phase status from patient model to UI status
  private mapPhaseStatus(status: string): 'completed' | 'in-progress' | 'todo' | 'locked' {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'in_progress':
        return 'in-progress';
      case 'locked':
        return 'locked';
      case 'not_started':
      case 'skipped':
      default:
        return 'todo';
    }
  }
  
  // Load available templates for assignment
  private async loadAvailableTemplates() {
    try {
      const templates = await firstValueFrom(this.formTemplateService.templates$);
      this.availableTemplates = templates.filter((t: any) => 
        t.status === 'active' && 
        (t.templateType === 'form' || t.templateType === 'study_subject')
      );
    } catch (error) {
      console.error('Error loading available templates:', error);
      this.availableTemplates = [];
    }
  }
  
  // Calculate average completion time for templates
  private calculateAverageCompletionTime(templates: TemplateData[]): string {
    const completedTemplates = templates.filter(t => t.status === 'completed' && t.actualTime);
    if (completedTemplates.length === 0) return '15 mins';
    
    const totalTime = completedTemplates.reduce((sum, t) => sum + (t.actualTime || 0), 0);
    const avgTime = Math.round(totalTime / completedTemplates.length);
    
    if (avgTime < 60) return `${avgTime} mins`;
    const hours = Math.floor(avgTime / 60);
    const mins = avgTime % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  }
  
  // Create study progress chart
  private createStudyProgressChart() {
    const canvas = this.progressChart?.nativeElement;
    if (!canvas || !this.phases) return;
    
    // Destroy existing chart if it exists
    if (this.studyProgressChart) {
      this.studyProgressChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Prepare data for the chart
    const labels = this.phases.map(p => p.name);
    const completedData = this.phases.map(p => {
      const completed = p.templates.filter(t => t.status === 'completed').length;
      return completed;
    });
    const inProgressData = this.phases.map(p => {
      const inProgress = p.templates.filter(t => t.status === 'in-progress').length;
      return inProgress;
    });
    const todoData = this.phases.map(p => {
      const todo = p.templates.filter(t => t.status === 'not-started').length;
      return todo;
    });
    
    this.studyProgressChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Completed',
            data: completedData,
            backgroundColor: '#4caf50',
            borderColor: '#388e3c',
            borderWidth: 1
          },
          {
            label: 'In Progress',
            data: inProgressData,
            backgroundColor: '#ff9800',
            borderColor: '#f57c00',
            borderWidth: 1
          },
          {
            label: 'To Do',
            data: todoData,
            backgroundColor: '#9e9e9e',
            borderColor: '#757575',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: {
              display: false
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 15
            }
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                return `${label}: ${value} template${value !== 1 ? 's' : ''}`;
              }
            }
          }
        }
      }
    });
  }
  
  // Create phase timeline chart
  createPhaseTimeline() {
    const canvas = document.getElementById('phaseTimelineChart') as HTMLCanvasElement;
    if (!canvas || !this.patient?.phases) return;
    
    // Destroy existing chart if it exists
    if (this.phaseTimelineChart) {
      this.phaseTimelineChart.destroy();
    }
    
    const phases = this.patient.phases;
    const labels = phases.map(p => p.name);
    const completionData = phases.map(p => {
      const status = this.phaseStatuses.get(p.id);
      return status?.completionPercentage || 0;
    });
    
    const backgroundColors = phases.map(p => {
      const status = this.phaseStatuses.get(p.id);
      if (status?.status === 'completed') return '#4caf50';
      if (status?.status === 'in-progress') return '#ff9800';
      return '#e0e0e0';
    });
    
    this.phaseTimelineChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Phase Completion %',
          data: completionData,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map(c => c === '#e0e0e0' ? '#bdbdbd' : c),
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const phase = phases[context.dataIndex];
                const status = this.phaseStatuses.get(phase.id);
                return [
                  `Completion: ${context.parsed.y.toFixed(1)}%`,
                  `Status: ${status?.status || 'not-started'}`,
                  `Templates: ${status?.completedTemplates}/${status?.totalTemplates}`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value: any) => value + '%'
            }
          }
        }
      }
    });
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

  // Phase management helper methods
  refreshPhases(): void {
    // Reload patient data to refresh phase information
    if (this.patient?.id) {
      this.loading = true;
      this.loadPatientData(this.patient.id).then(() => {
        this.initializePhaseData();
        this.calculateStudyMetrics();
      });
    }
  }

  getCompletedPhasesCount(): number {
    if (!this.patient?.phases) return 0;
    return this.patient.phases.filter(p => p.status === 'completed').length;
  }

  getInProgressPhasesCount(): number {
    if (!this.patient?.phases) return 0;
    return this.patient.phases.filter(p => p.status === 'in_progress').length;
  }

  getPendingPhasesCount(): number {
    if (!this.patient?.phases) return 0;
    return this.patient.phases.filter(p => 
      p.status === 'not_started' || p.status === 'pending' || !p.status
    ).length;
  }

  getTotalFormsCount(): number {
    if (!this.patient?.forms) return 0;
    return this.patient.forms.length;
  }

  getCompletedFormsCount(phaseId: string): number {
    const forms = this.getFormsForPhase(phaseId);
    return forms.filter(f => f.status === 'completed').length;
  }

  getFormIcon(form: any): string {
    // Return appropriate icon based on form type or category
    if (form.category === 'consent') return 'assignment_ind';
    if (form.category === 'demographics') return 'person';
    if (form.category === 'medical_history') return 'medical_services';
    if (form.category === 'lab_results') return 'science';
    if (form.category === 'adverse_events') return 'warning';
    if (form.category === 'medications') return 'medication';
    if (form.category === 'vitals') return 'favorite';
    return 'description';
  }

  getFormStatusText(status: string | undefined): string {
    if (!status) return 'Not Started';
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'not_started': return 'Not Started';
      case 'locked': return 'Locked';
      default: return status;
    }
  }

  async downloadFormData(form: any, phase: any): Promise<void> {
    // Download form data as PDF or Excel
    console.log('Downloading form data:', form, 'for phase:', phase);
    // TODO: Implement form data download functionality
    // This could export the filled form data to PDF or Excel
  }

  assignTemplateToPhase(phase: any): void {
    // Open template assignment modal
    this.selectedPhaseForTemplate = phase;
    this.showTemplateAssignmentModal = true;
    // Load available templates if not already loaded
    if (this.availableTemplates.length === 0) {
      this.loadAvailableTemplates();
    }
  }

  skipPhase(phase: any): void {
    // Skip the current phase
    if (confirm(`Are you sure you want to skip phase "${phase.name}"? This action may require justification.`)) {
      phase.status = 'skipped';
      // TODO: Add audit log for phase skip
      // TODO: Update patient record in Firestore
      this.updatePatientPhase(phase);
    }
  }

  startPhase(phase: any): void {
    // Start the phase
    phase.status = 'in_progress';
    phase.startedDate = new Date();
    // TODO: Add audit log for phase start
    this.updatePatientPhase(phase);
  }

  canCompletePhase(phase: any): boolean {
    // Check if all required forms in the phase are completed
    const forms = this.getFormsForPhase(phase.id);
    const requiredForms = forms.filter(f => f.required);
    const completedRequiredForms = requiredForms.filter(f => f.status === 'completed');
    return requiredForms.length === completedRequiredForms.length;
  }

  completePhase(phase: any): void {
    // Complete the phase
    if (this.canCompletePhase(phase)) {
      phase.status = 'completed';
      phase.completedDate = new Date();
      phase.completionPercentage = 100;
      // TODO: Add audit log for phase completion
      this.updatePatientPhase(phase);
      
      // Auto-start next phase if available
      const phaseIndex = this.patient?.phases?.findIndex(p => p.id === phase.id);
      if (phaseIndex !== undefined && phaseIndex >= 0 && 
          this.patient?.phases && phaseIndex < this.patient.phases.length - 1) {
        const nextPhase = this.patient.phases[phaseIndex + 1];
        if (nextPhase.status === 'not_started') {
          this.startPhase(nextPhase);
        }
      }
    } else {
      alert('Cannot complete phase. Please ensure all required forms are completed.');
    }
  }


  private async updatePatientPhase(phase: any): Promise<void> {
    // Update the patient's phase in Firestore
    if (!this.patient) return;
    
    try {
      // Find and update the phase in the patient's phases array
      const phaseIndex = this.patient.phases?.findIndex(p => p.id === phase.id);
      if (phaseIndex !== undefined && phaseIndex >= 0 && this.patient.phases) {
        this.patient.phases[phaseIndex] = phase;
        
        // Update patient in Firestore
        const patientRef = doc(this.firestore, 'patients', this.patient.id!);
        const currentUser = await firstValueFrom(this.authService.user$) as any;
        await updateDoc(patientRef, {
          phases: this.patient.phases,
          lastModifiedAt: new Date(),
          lastModifiedBy: currentUser?.uid || 'system'
        });
        
        // Recalculate metrics
        this.initializePhaseData();
        this.calculateStudyMetrics();
      }
    } catch (error) {
      console.error('Error updating patient phase:', error);
      alert('Failed to update phase. Please try again.');
    }
  }
}
