import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PatientVisitSubcomponent } from '../../models/patient.model';
import { PatientService } from '../../services/patient.service';
import { StudyPhaseService } from '../../services/study-phase.service';
import { PatientPhaseProgress } from '../../models/study-phase.model';
import { firstValueFrom } from 'rxjs';

interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  count?: number;
  active?: boolean;
}

interface PatientListItem {
  id: string;
  identifier: string;
  displayName: string;
  studyId?: string;
  lastVisit?: Date;
  enrollmentDate?: Date;
  formsCount: number;
  status: 'active' | 'completed' | 'withdrawn';
  canViewPhi: boolean;
  visitSubcomponents?: PatientVisitSubcomponent[];
  phaseProgress?: PatientPhaseProgress[];
}

interface Study {
  id?: string;
  title: string;
  protocolNumber: string;
  status: string;
  phase: string;
  description: string;
  plannedEnrollment: number;
  actualEnrollment?: number;
  patientIds?: string[];
}

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-sidebar.component.html',
  styleUrls: ['./dashboard-sidebar.component.scss']
})
export class DashboardSidebarComponent implements OnInit, OnChanges {
  @Input() activeSidebarItem: string = 'studies';
  @Input() templates: any[] = [];
  @Input() studies: Study[] = [];
  @Input() patients: PatientListItem[] = [];
  @Input() permissions: any = {};
  @Input() searchQuery: string = '';
  
  @Output() activeSidebarItemChange = new EventEmitter<string>();
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() createTemplate = new EventEmitter<void>();
  @Output() createStudy = new EventEmitter<void>();
  @Output() selectPatient = new EventEmitter<PatientListItem>();
  @Output() deletePatient = new EventEmitter<{patient: PatientListItem, studyId: string}>();
  @Output() viewPatientForms = new EventEmitter<PatientListItem>();
  @Output() viewPatientHistory = new EventEmitter<PatientListItem>();
  
  sidebarItems: SidebarItem[] = [];
  expandedStudies = new Set<string>();
  expandedPatients = new Set<string>();
  patientFolders = new Map<string, PatientVisitSubcomponent[]>();
  patientProgress = new Map<string, PatientPhaseProgress[]>();
  loadingFolders = new Set<string>();
  
  constructor(
    private patientService: PatientService,
    private studyPhaseService: StudyPhaseService,
    private router: Router
  ) {}
  
  ngOnInit() {
    this.updateSidebarItems();
  }
  
  ngOnChanges() {
    this.updateSidebarItems();
  }
  
  private updateSidebarItems() {
    this.sidebarItems = [
      {
        id: 'studies',
        label: 'Studies',
        icon: 'science',
        count: this.studies.length,
        active: this.activeSidebarItem === 'studies'
      }
    ];
  }
  
  selectSidebarItem(item: SidebarItem) {
    this.activeSidebarItem = item.id;
    this.activeSidebarItemChange.emit(item.id);
    this.updateSidebarItems();
  }
  
  onSearchChange() {
    this.searchQueryChange.emit(this.searchQuery);
  }
  
  onCreateTemplate() {
    this.createTemplate.emit();
  }
  
  onCreateStudy() {
    this.createStudy.emit();
  }
  
  // Study expansion methods
  toggleStudyExpansion(studyId: string, event: Event) {
    event.stopPropagation();
    if (this.expandedStudies.has(studyId)) {
      this.expandedStudies.delete(studyId);
    } else {
      this.expandedStudies.add(studyId);
    }
  }
  
  isStudyExpanded(studyId: string): boolean {
    return this.expandedStudies.has(studyId);
  }
  
  // Patient expansion methods
  async togglePatientExpansion(patientId: string) {
    if (this.expandedPatients.has(patientId)) {
      this.expandedPatients.delete(patientId);
    } else {
      this.expandedPatients.add(patientId);
      // Load patient folders if not already loaded
      if (!this.patientFolders.has(patientId)) {
        await this.loadPatientFolders(patientId);
      }
    }
  }
  
  async loadPatientFolders(patientId: string) {
    if (this.loadingFolders.has(patientId)) return;
    
    this.loadingFolders.add(patientId);
    try {
      // Load visit subcomponents (folders)
      const subcomponents$ = this.patientService.getPatientVisitSubcomponents(patientId);
      const subcomponents = await firstValueFrom(subcomponents$);
      this.patientFolders.set(patientId, subcomponents);
      
      // Load phase progress if patient has a study
      const patient = this.patients.find(p => p.id === patientId);
      if (patient?.studyId) {
        const progress = await this.studyPhaseService.getPatientPhaseProgress(patientId, patient.studyId);
        this.patientProgress.set(patientId, progress);
      }
    } catch (error) {
      console.error('Error loading patient folders:', error);
    } finally {
      this.loadingFolders.delete(patientId);
    }
  }
  
  getPatientFolders(patientId: string): PatientVisitSubcomponent[] {
    return this.patientFolders.get(patientId) || [];
  }
  
  getPhaseProgress(patientId: string, phaseId: string): PatientPhaseProgress | undefined {
    const progress = this.patientProgress.get(patientId) || [];
    return progress.find(p => p.phaseId === phaseId);
  }
  
  getFolderCompletionClass(folder: PatientVisitSubcomponent): string {
    if (folder.status === 'completed') return 'completed';
    if (folder.status === 'in_progress') return 'in-progress';
    if (folder.status === 'missed') return 'missed';
    return 'scheduled';
  }
  
  getFolderIcon(folder: PatientVisitSubcomponent): string {
    if (folder.isPhaseFolder) {
      switch (folder.type) {
        case 'screening': return 'search';
        case 'baseline': return 'assessment';
        case 'treatment': return 'medication';
        case 'follow_up': return 'event_note';
        default: return 'folder';
      }
    }
    return 'folder_open';
  }
  
  isPatientExpanded(patientId: string): boolean {
    return this.expandedPatients.has(patientId);
  }
  
  // Get patients for a specific study
  getStudyPatients(studyId: string): PatientListItem[] {
    return this.patients.filter(patient => patient.studyId === studyId);
  }
  
  // Patient selection
  onSelectPatient(patient: PatientListItem, event: Event) {
    event.stopPropagation();
    this.selectPatient.emit(patient);
  }
  
  // Patient deletion
  onDeletePatient(patient: PatientListItem, studyId: string, event: Event) {
    event.stopPropagation();
    // Emit deletion event - confirmation is handled by parent component
    this.deletePatient.emit({ patient, studyId });
  }
  
  // Get patient status icon
  getPatientStatusIcon(status: string): string {
    switch (status) {
      case 'active':
        return 'check_circle';
      case 'completed':
        return 'task_alt';
      case 'withdrawn':
        return 'remove_circle';
      default:
        return 'help';
    }
  }
  
  // View patient forms
  onViewPatientForms(patient: PatientListItem, event: Event) {
    event.stopPropagation();
    this.viewPatientForms.emit(patient);
  }
  
  // View patient history
  onViewPatientHistory(patient: PatientListItem, event: Event) {
    event.stopPropagation();
    this.viewPatientHistory.emit(patient);
  }
  
  // Navigate to phase forms
  onPhaseClick(studyId: string, patientId: string, phaseId: string, visitSubcomponentId: string, event: Event) {
    event.stopPropagation();
    this.router.navigate(['/phase-forms', studyId, patientId, phaseId, visitSubcomponentId]);
  }
}
