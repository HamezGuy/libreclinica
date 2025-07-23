import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, Observable, combineLatest, map, of, withLatestFrom, firstValueFrom } from 'rxjs';

import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { FormTemplateService } from '../../services/form-template.service';
import { FormInstanceService } from '../../services/form-instance.service';
import { DataSeparationService } from '../../services/data-separation.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { HealthcareApiService, Patient as HealthcarePatient } from '../../services/healthcare-api.service';
import { FormBuilderComponent } from '../form-builder/form-builder.component';
import { UserProfile } from '../../models/user-profile.model';
import { FormTemplate, FormInstance as TemplateFormInstance } from '../../models/form-template.model';
import { AccessLevel } from '../../enums/access-levels.enum';

// Patient display model (non-PHI)
export interface PatientListItem {
  id: string;
  identifier: string;
  displayName: string;
  studyId?: string;
  lastVisit?: Date;
  formsCount: number;
  status: 'active' | 'completed' | 'withdrawn';
  canViewPhi: boolean;
}

// Form instance interface for dashboard
interface FormInstance {
  id: string;
  templateId: string;
  templateName: string;
  status: 'draft' | 'completed' | 'locked' | 'in_progress' | 'reviewed';
  lastModified: Date;
  completionPercentage: number;
}

// Form Permissions interface
export interface FormPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
}

// Patient PHI data interface
export interface Patient {
  id: string;
  name: {
    given: string[];
    family: string;
  };
  dateOfBirth: Date;
  birthDate?: Date; // Alternative property name
  gender: string;
  contactInfo: {
    phone?: string;
    email?: string;
    address?: string;
  };
}



@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, FormBuilderComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private authService = inject(EdcCompliantAuthService);
  private templateService = inject(FormTemplateService);
  private instanceService = inject(FormInstanceService);
  private healthcareService = inject(HealthcareApiService);
  private dataSeparationService = inject(DataSeparationService);
  private router = inject(Router);
  private eventBus = inject(EventBusService);
  
  // Observables
  userProfile$: Observable<UserProfile | null> = this.authService.currentUserProfile$;
  templates$: Observable<FormTemplate[]> = this.templateService.templates$;
  
  // Component state
  patients: PatientListItem[] = [];

  selectedPatient: PatientListItem | null = null;
  selectedPatientForms: FormInstance[] = [];
  selectedPatientPhiData: Patient | null = null;
  
  // Modal state
  showTemplateModal = false;
  showFormBuilderModal = false;
  selectedTemplateForEdit: FormTemplate | null = null;
  formBuilderTemplateId: string | undefined = undefined;
  searchQuery = '';

  // Permissions
  permissions: FormPermissions = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canPublish: false
  };

  // Sidebar navigation
  sidebarItems = [
    { id: 'patients', label: 'Patients', icon: 'people', active: true },
    { id: 'forms', label: 'Forms', icon: 'description', active: false },
    { id: 'studies', label: 'Studies', icon: 'folder', active: false },
    { id: 'reports', label: 'Reports', icon: 'assessment', active: false },
    { id: 'audit', label: 'Audit Logs', icon: 'history', active: false }
  ];

  activeSidebarItem = 'patients';

  ngOnInit(): void {
    this.loadPatients();
    this.setupPermissions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async setupPermissions(): Promise<void> {
    try {
      const userProfile = await this.authService.getCurrentUserProfile();
      this.permissions = {
        canView: userProfile?.accessLevel !== AccessLevel.DATA_ENTRY,
        canCreate: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN, AccessLevel.INVESTIGATOR].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canEdit: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN, AccessLevel.INVESTIGATOR].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canDelete: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userProfile?.accessLevel || AccessLevel.VIEWER),
        canPublish: [AccessLevel.SUPER_ADMIN, AccessLevel.ADMIN].includes(userProfile?.accessLevel || AccessLevel.VIEWER)
      };
    } catch (error) {
      console.error('Error setting up permissions:', error);
    }
  }

  async loadPatients(): Promise<void> {
    try {
      // Load patients with non-PHI data only
      const patients = await this.healthcareService.searchPatients({});
      this.patients = patients.map(patient => {
        const healthcarePatient = patient as HealthcarePatient;
        const patientName = healthcarePatient.name;
        let displayName = 'Unknown Patient';
        
        if (patientName) {
          if (typeof patientName === 'string') {
            displayName = patientName;
          } else if (Array.isArray(patientName) && patientName.length > 0) {
            const firstNameEntry = patientName[0];
            const given = firstNameEntry.given?.join(' ') || '';
            const family = firstNameEntry.family || '';
            displayName = `${given} ${family}`.trim() || 'Unknown Patient';
          }
        }
        
        return {
          id: healthcarePatient.id || 'unknown',
          identifier: healthcarePatient.identifier?.[0]?.value || 'N/A',
          displayName: displayName,
          studyId: undefined,
          lastVisit: undefined,
          formsCount: 0,
          status: 'active' as const,
          canViewPhi: this.permissions.canView
        };
      });
    } catch (error) {
      console.error('Error loading patients:', error);
      this.patients = [];
    }
  }

  private calculateAge(birthDate: Date | string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  private getPatientDisplayName(patient: PatientListItem): string {
    const displayName = patient.displayName;
    if (displayName && displayName.length > 0) {
      return displayName[0].toUpperCase();
    }
    return '?';
  }

  async selectPatient(patient: PatientListItem) {
    this.selectedPatient = patient;
    
    try {
      // Load patient forms using observable pattern
      this.instanceService.getFormInstancesByPatient(patient.id).subscribe({
        next: (instances) => {
          // Map instances to dashboard format, enriching with template name
          of(instances).pipe(
            withLatestFrom(this.templates$),
            takeUntil(this.destroy$)
          ).subscribe(([formInstances, templates]) => {
            this.selectedPatientForms = formInstances.map((instance: TemplateFormInstance) => {
              const template = templates.find((t: FormTemplate) => t.id === instance.templateId);
              return {
                id: instance.id!,
                templateId: instance.templateId!,
                templateName: template?.name || 'Unknown Template',
                status: instance.status,
                lastModified: (instance.updatedAt as any).toDate(),
                completionPercentage: this.calculateCompletionPercentage(instance)
              };
            });
          });
        },
        error: (error) => {
          console.error('Error loading patient forms:', error);
          this.selectedPatientForms = [];
        }
      });
      
      // Load PHI data if user has permission
      if (this.permissions.canView) {
        try {
          const phiData = await this.healthcareService.getPatient(patient.id);
          // Map healthcare patient to dashboard patient interface
          const name = phiData.name?.[0] || { given: [], family: '' };
          const birthDate = phiData.birthDate ? 
            (typeof phiData.birthDate === 'string' ? new Date(phiData.birthDate) : phiData.birthDate) : 
            new Date();
          
          this.selectedPatientPhiData = {
            id: phiData.id || '',
            name: {
              given: name.given || [],
              family: name.family || ''
            },
            dateOfBirth: birthDate,
            gender: phiData.gender || 'unknown',
            contactInfo: {
              phone: phiData.telecom?.find(t => t.system === 'phone')?.value,
              email: phiData.telecom?.find(t => t.system === 'email')?.value,
              address: phiData.address?.[0] ? 
                `${phiData.address[0].line?.join(', ') || ''}, ${phiData.address[0].city || ''}, ${phiData.address[0].state || ''} ${phiData.address[0].postalCode || ''}`.trim() : 
                undefined
            }
          };
        } catch (error) {
          console.error('Error loading PHI data:', error);
        }
      }
    } catch (error) {
      console.error('Error in selectPatient:', error);
    }
  }

  // Template management methods
  openTemplateModal(): void {
    this.showTemplateModal = true;
  }

  closeTemplateModal(): void {
    this.showTemplateModal = false;
  }

  async openFormBuilder(templateId?: string): Promise<void> {
    this.formBuilderTemplateId = templateId;
    if (templateId) {
      const templates = await firstValueFrom(this.templates$);
      this.selectedTemplateForEdit = templates.find((t: FormTemplate) => t.id === templateId) || null;
    } else {
      this.selectedTemplateForEdit = null;
    }
    this.showFormBuilderModal = true;
  }

  closeFormBuilder(): void {
    this.showFormBuilderModal = false;
    this.selectedTemplateForEdit = null;
    this.formBuilderTemplateId = undefined;
  }

  onTemplateSaved(template: FormTemplate): void {
    // The templates$ observable will update automatically.
    // Close the form builder
    this.closeFormBuilder();
  }

  private calculateCompletionPercentage(instance: TemplateFormInstance): number {
    if (!instance.data || !instance.templateId) return 0;
    // Simple calculation based on filled fields vs total fields
    const filledFields = Object.keys(instance.data).filter(key => 
      instance.data![key] !== null && instance.data![key] !== undefined && instance.data![key] !== ''
    ).length;
    const totalFields = Object.keys(instance.data).length;
    return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }

  async createNewTemplate() {
    if (!this.permissions.canCreate) {
      alert('You do not have permission to create templates');
      return;
    }
    
    this.openFormBuilder();
  }

  async editTemplate(template: FormTemplate) {
    if (!this.permissions.canEdit) {
      alert('You do not have permission to edit templates');
      return;
    }
    
    this.selectedTemplateForEdit = template;
    this.formBuilderTemplateId = template.id;
    this.showFormBuilderModal = true;
  }

  async publishTemplate(template: FormTemplate) {
    if (!this.permissions.canPublish) {
      alert('You do not have permission to publish templates');
      return;
    }
    
    try {
      await this.templateService.publishTemplate(template.id!, true);
      alert('Template published successfully');
    } catch (error) {
      console.error('Failed to publish template:', error);
      alert('Failed to publish template');
    }
  }

  async deleteTemplate(template: FormTemplate) {
    if (!this.permissions.canDelete) {
      alert('You do not have permission to delete templates');
      return;
    }
    
    const reason = prompt('Please provide a reason for deleting this template:');
    if (!reason) return;
    
    try {
      await this.templateService.deleteTemplate(template.id!, reason);
      alert('Template deleted successfully');
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('Failed to delete template');
    }
  }

  // Form instance management
  async createFormInstance(template: FormTemplate, patient: PatientListItem) {
    try {
      const instance = await this.instanceService.createFormInstance(
        template.id!,
        patient.id,
        template.studyId
      );
      
      // Navigate to form filling interface
      this.router.navigate(['/form-instance', instance.id]);
    } catch (error) {
      console.error('Failed to create form instance:', error);
      alert('Failed to create form instance');
    }
  }

  // Sidebar navigation
  selectSidebarItem(itemId: string) {
    this.sidebarItems.forEach(item => item.active = item.id === itemId);
    this.activeSidebarItem = itemId;
    
    // Handle navigation based on selected item
    switch (itemId) {
      case 'patients':
        this.loadPatients();
        break;
      case 'forms':
        // Load forms view
        break;
      case 'studies':
        // Load studies view
        break;
      case 'reports':
        // Load reports view
        break;
      case 'audit':
        // Load audit logs view
        break;
    }
  }

  // Search functionality
  get filteredPatients(): PatientListItem[] {
    if (!this.searchQuery) return this.patients;
    
    const query = this.searchQuery.toLowerCase();
    return this.patients.filter(patient => 
      patient.displayName.toLowerCase().includes(query) ||
      patient.identifier.toLowerCase().includes(query)
    );
  }

  get filteredTemplates(): Observable<FormTemplate[]> {
    return this.templates$.pipe(
      map(templates => {
        if (!this.searchQuery) return templates;
        
        const query = this.searchQuery.toLowerCase();
        return templates.filter(template => 
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query)
        );
      })
    );
  }

  async signOut() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}
