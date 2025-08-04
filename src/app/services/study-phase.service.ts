import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  writeBatch, 
  updateDoc,
  Timestamp,
  limit 
} from '@angular/fire/firestore';
import { Observable, from, map, firstValueFrom } from 'rxjs';
import { 
  StudyPhaseConfig, 
  PatientPhaseProgress, 
  PhaseTemplateAssignment,
  PhaseStatus,
  PhaseTemplateStatus,
  StudyPhaseSummary,
  PhaseTransitionRule,
  TransitionCondition
} from '../models/study-phase.model';
import { PatientVisitSubcomponent } from '../models/patient.model';
import { EdcCompliantAuthService } from './edc-compliant-auth.service';
import { FormInstanceService } from './form-instance.service';
import { FormTemplateService } from './form-template.service';
import { EventBusService } from './event-bus.service';


@Injectable({
  providedIn: 'root'
})
export class StudyPhaseService {
  private readonly PHASES_COLLECTION = 'studyPhases';
  private readonly PHASE_PROGRESS_COLLECTION = 'patientPhaseProgress';

  private eventBus = inject(EventBusService);

  constructor(
    private firestore: Firestore,
    private authService: EdcCompliantAuthService,
    private formInstanceService: FormInstanceService,
    private formTemplateService: FormTemplateService
  ) {
    // Subscribe to form completion events
    this.eventBus.onEvent('FORM_COMPLETION_STATUS_CHANGED').subscribe(async (event: any) => {
      if (event.patientId && event.studyId && event.phaseId && event.templateId) {
        await this.updateFormCompletionStatus(
          event.patientId,
          event.studyId,
          event.phaseId,
          event.templateId,
          event.isCompleted
        );
      }
    });
  }

  // Create study phases during study initialization
  async createStudyPhases(studyId: string, phaseConfigs: Partial<StudyPhaseConfig>[]): Promise<StudyPhaseConfig[]> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const createdPhases: StudyPhaseConfig[] = [];
    const batch = writeBatch(this.firestore);
    const now = new Date();

    for (const config of phaseConfigs) {
      const phaseId = doc(collection(this.firestore, this.PHASES_COLLECTION)).id;
      const phase: StudyPhaseConfig = {
        id: phaseId,
        studyId,
        phaseName: config.phaseName!,
        phaseCode: config.phaseCode!,
        description: config.description,
        order: config.order!,
        plannedDurationDays: config.plannedDurationDays,
        windowStartDays: config.windowStartDays,
        windowEndDays: config.windowEndDays,
        templateAssignments: config.templateAssignments || [],
        entryRequirements: config.entryRequirements,
        exitRequirements: config.exitRequirements,
        isActive: config.isActive !== false,
        allowSkip: config.allowSkip || false,
        allowParallel: config.allowParallel || false,
        customAttributes: config.customAttributes,
        createdBy: currentUser.uid,
        createdAt: now,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: now
      };

      const phaseRef = doc(this.firestore, this.PHASES_COLLECTION, phaseId);
      batch.set(phaseRef, this.prepareForFirestore(phase));
      createdPhases.push(phase);
    }

    await batch.commit();
    return createdPhases;
  }

  // Get all phases for a study
  async getStudyPhases(studyId: string): Promise<StudyPhaseConfig[]> {
    const phasesRef = collection(this.firestore, this.PHASES_COLLECTION);
    const q = query(
      phasesRef, 
      where('studyId', '==', studyId),
      orderBy('order', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => this.convertFromFirestore(doc.data()) as StudyPhaseConfig);
  }

  // Update phase configuration
  async updatePhase(phaseId: string, updates: Partial<StudyPhaseConfig>): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const phaseRef = doc(this.firestore, this.PHASES_COLLECTION, phaseId);
    await updateDoc(phaseRef, {
      ...this.prepareForFirestore(updates),
      lastModifiedBy: currentUser.uid,
      lastModifiedAt: serverTimestamp()
    });
  }

  // Assign templates to a phase
  async assignTemplatesToPhase(
    phaseId: string, 
    templateAssignments: PhaseTemplateAssignment[]
  ): Promise<void> {
    await this.updatePhase(phaseId, { templateAssignments });
  }

  // Create phase-based folders for a patient when they're added to a study
  async createPatientPhaseFolders(
    patientId: string, 
    studyId: string, 
    phases: StudyPhaseConfig[]
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const now = new Date();
    const batch = writeBatch(this.firestore);

    // Sort phases by order
    const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

    for (const phase of sortedPhases) {
      // Create visit subcomponent for each phase
      const subcomponentId = doc(collection(this.firestore, 'temp')).id;
      
      // Collect all template IDs from phase assignments
      const allTemplateIds = phase.templateAssignments.map(ta => ta.templateId);
      const requiredTemplateIds = phase.templateAssignments
        .filter(ta => ta.isRequired)
        .map(ta => ta.templateId);
      const optionalTemplateIds = phase.templateAssignments
        .filter(ta => !ta.isRequired)
        .map(ta => ta.templateId);

      const subcomponent: PatientVisitSubcomponent = {
        id: subcomponentId,
        patientId,
        studyId,
        name: phase.phaseName,
        description: phase.description,
        type: this.mapPhaseToVisitType(phase.phaseCode),
        order: phase.order,
        phaseId: phase.id,
        phaseCode: phase.phaseCode,
        isPhaseFolder: true,
        status: 'scheduled',
        completionPercentage: 0,
        templateIds: allTemplateIds,
        requiredTemplateIds,
        optionalTemplateIds,
        completedTemplates: [],
        inProgressTemplates: [],
        canProgressToNextPhase: false, // Will be updated based on completion
        blockingTemplates: requiredTemplateIds, // Initially all required templates are blocking
        createdBy: currentUser.uid,
        createdAt: now,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: now
      };

      const subcomponentRef = doc(
        this.firestore,
        'patients',
        patientId,
        'visitSubcomponents',
        subcomponentId
      );
      batch.set(subcomponentRef, this.prepareForFirestore(subcomponent));

      // Create phase progress tracking
      const progressId = doc(collection(this.firestore, this.PHASE_PROGRESS_COLLECTION)).id;
      const progress: PatientPhaseProgress = {
        id: progressId,
        patientId,
        studyId,
        phaseId: phase.id,
        phaseName: phase.phaseName,
        status: 'not_started',
        totalTemplates: allTemplateIds.length,
        requiredTemplates: requiredTemplateIds.length,
        completedTemplates: 0,
        completedRequiredTemplates: 0,
        progressPercentage: 0,
        formCompletionStatus: {},
        canProgress: false,
        blockingReasons: ['Phase not started'],
        createdBy: currentUser.uid,
        createdAt: now,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: now
      };

      // Initialize form completion status
      for (const assignment of phase.templateAssignments) {
        progress.formCompletionStatus[assignment.templateId] = {
          isCompleted: false,
          isRequired: assignment.isRequired
        };
      }

      const progressRef = doc(this.firestore, this.PHASE_PROGRESS_COLLECTION, progressId);
      batch.set(progressRef, this.prepareForFirestore(progress));
    }

    // Commit the batch to create folders and progress tracking
    await batch.commit();
    
    // Now create form instances for each template in each phase
    // This is done after batch commit to ensure folders exist
    for (const phase of sortedPhases) {
      const subcomponentId = `${patientId}_${phase.phaseCode}`;
      
      // Create form instances for each template assignment
      for (const assignment of phase.templateAssignments) {
        try {
          // Get template details
          const template = await this.formTemplateService.getTemplate(assignment.templateId);
          if (!template) {
            console.warn(`Template ${assignment.templateId} not found for phase ${phase.phaseName}`);
            continue;
          }
          
          // Create form instance
          await this.formInstanceService.createFormInstance(
            assignment.templateId,
            patientId,
            studyId,
            subcomponentId
          );
          
          console.log(`Created form instance for template ${template.name} in phase ${phase.phaseName}`);
        } catch (error) {
          console.error(`Failed to create form instance for template ${assignment.templateId}:`, error);
          // Continue with other templates even if one fails
        }
      }
    }
  }

  // Get patient phase progress
  async getPatientPhaseProgress(patientId: string, studyId: string): Promise<PatientPhaseProgress[]> {
    const progressRef = collection(this.firestore, this.PHASE_PROGRESS_COLLECTION);
    const q = query(
      progressRef,
      where('patientId', '==', patientId),
      where('studyId', '==', studyId),
      orderBy('phaseId', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => this.convertFromFirestore(doc.data()) as PatientPhaseProgress);
  }

  // Update phase progress when a form is completed
  async updatePhaseProgressForFormCompletion(
    patientId: string,
    phaseId: string,
    templateId: string,
    formInstanceId: string
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // Find the progress record
    const progressRef = collection(this.firestore, this.PHASE_PROGRESS_COLLECTION);
    const q = query(
      progressRef,
      where('patientId', '==', patientId),
      where('phaseId', '==', phaseId)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const progressDoc = snapshot.docs[0];
    const progress = progressDoc.data() as PatientPhaseProgress;

    // Update form completion status
    if (progress.formCompletionStatus[templateId]) {
      progress.formCompletionStatus[templateId].isCompleted = true;
      progress.formCompletionStatus[templateId].completedDate = new Date();
      progress.formCompletionStatus[templateId].formInstanceId = formInstanceId;
    }

    // Recalculate progress
    const completedForms = Object.values(progress.formCompletionStatus)
      .filter(status => status.isCompleted);
    const completedRequiredForms = completedForms
      .filter(status => status.isRequired);

    progress.completedTemplates = completedForms.length;
    progress.completedRequiredTemplates = completedRequiredForms.length;
    progress.progressPercentage = Math.round(
      (progress.completedTemplates / progress.totalTemplates) * 100
    );

    // Check if can progress to next phase
    progress.canProgress = progress.completedRequiredTemplates === progress.requiredTemplates;
    progress.blockingReasons = [];
    
    if (!progress.canProgress) {
      const incompleteRequired = Object.entries(progress.formCompletionStatus)
        .filter(([_, status]) => status.isRequired && !status.isCompleted)
        .map(([templateId, _]) => templateId);
      
      progress.blockingReasons.push(
        `${incompleteRequired.length} required forms not completed`
      );
    }

    // Update status
    if (progress.status === 'not_started' && progress.completedTemplates > 0) {
      progress.status = 'in_progress';
      progress.startedDate = new Date();
    } else if (progress.canProgress && progress.completedTemplates === progress.totalTemplates) {
      progress.status = 'completed';
      progress.completedDate = new Date();
    }

    // Save updates
    await updateDoc(doc(this.firestore, this.PHASE_PROGRESS_COLLECTION, progressDoc.id), {
      ...this.prepareForFirestore(progress),
      lastModifiedBy: currentUser.uid,
      lastModifiedAt: serverTimestamp()
    });

    // Update the visit subcomponent
    await this.updateVisitSubcomponentProgress(patientId, phaseId, progress);
  }

  // Update visit subcomponent based on phase progress
  private async updateVisitSubcomponentProgress(
    patientId: string,
    phaseId: string,
    progress: PatientPhaseProgress
  ): Promise<void> {
    const subcomponentsRef = collection(
      this.firestore,
      'patients',
      patientId,
      'visitSubcomponents'
    );
    
    const q = query(subcomponentsRef, where('phaseId', '==', phaseId));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const subcomponentDoc = snapshot.docs[0];
      const blockingTemplates = Object.entries(progress.formCompletionStatus)
        .filter(([_, status]) => status.isRequired && !status.isCompleted)
        .map(([templateId, _]) => templateId);

      await updateDoc(subcomponentDoc.ref, {
        completionPercentage: progress.progressPercentage,
        completedTemplates: Object.entries(progress.formCompletionStatus)
          .filter(([_, status]) => status.isCompleted)
          .map(([templateId, _]) => templateId),
        canProgressToNextPhase: progress.canProgress,
        blockingTemplates,
        status: progress.status === 'completed' ? 'completed' : 
                progress.status === 'in_progress' ? 'in_progress' : 'scheduled',
        lastModifiedAt: serverTimestamp()
      });
    }
  }

  // Check if patient can progress to next phase
  async canProgressToNextPhase(
    patientId: string,
    currentPhaseId: string,
    nextPhaseId: string,
    transitionRules: PhaseTransitionRule[]
  ): Promise<{ canProgress: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    // Get current phase progress
    const progressList = await this.getPatientPhaseProgress(patientId, '');
    const currentProgress = progressList.find(p => p.phaseId === currentPhaseId);
    
    if (!currentProgress) {
      return { canProgress: false, reasons: ['Current phase progress not found'] };
    }

    // Check basic completion requirements
    if (!currentProgress.canProgress) {
      reasons.push(...(currentProgress.blockingReasons || []));
    }

    // Check transition rules
    const applicableRules = transitionRules.filter(
      rule => rule.fromPhase === currentPhaseId && rule.toPhase === nextPhaseId
    );

    for (const rule of applicableRules) {
      for (const condition of rule.conditions) {
        const conditionMet = await this.evaluateTransitionCondition(
          condition,
          patientId,
          currentProgress
        );
        
        if (!conditionMet.met) {
          reasons.push(conditionMet.reason);
        }
      }
    }

    return {
      canProgress: reasons.length === 0,
      reasons
    };
  }

  // Evaluate transition condition
  private async evaluateTransitionCondition(
    condition: TransitionCondition,
    patientId: string,
    progress: PatientPhaseProgress
  ): Promise<{ met: boolean; reason: string }> {
    switch (condition.type) {
      case 'all_required_forms_completed':
        const allCompleted = progress.completedRequiredTemplates === progress.requiredTemplates;
        return {
          met: allCompleted,
          reason: allCompleted ? '' : 'Not all required forms are completed'
        };

      case 'specific_forms_completed':
        if (!condition.formIds) {
          return { met: true, reason: '' };
        }
        const incompleteSpecific = condition.formIds.filter(
          formId => !progress.formCompletionStatus[formId]?.isCompleted
        );
        return {
          met: incompleteSpecific.length === 0,
          reason: incompleteSpecific.length > 0 
            ? `Specific forms not completed: ${incompleteSpecific.length}` 
            : ''
        };

      case 'date_based':
        if (!condition.daysAfterEnrollment || !progress.startedDate) {
          return { met: true, reason: '' };
        }
        const daysSinceStart = Math.floor(
          (new Date().getTime() - progress.startedDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const metDateRequirement = daysSinceStart >= condition.daysAfterEnrollment;
        return {
          met: metDateRequirement,
          reason: metDateRequirement 
            ? '' 
            : `Must wait ${condition.daysAfterEnrollment - daysSinceStart} more days`
        };

      case 'custom':
        // Custom conditions would be evaluated based on specific business logic
        return { met: true, reason: '' };

      default:
        return { met: true, reason: '' };
    }
  }

  // Get phase summary for dashboard
  async getStudyPhaseSummary(studyId: string): Promise<StudyPhaseSummary[]> {
    const phases = await this.getStudyPhases(studyId);
    const summaries: StudyPhaseSummary[] = [];

    for (const phase of phases) {
      // Get all patient progress for this phase
      const progressRef = collection(this.firestore, this.PHASE_PROGRESS_COLLECTION);
      const q = query(
        progressRef,
        where('studyId', '==', studyId),
        where('phaseId', '==', phase.id)
      );
      
      const snapshot = await getDocs(q);
      const progressRecords = snapshot.docs.map(
        doc => doc.data() as PatientPhaseProgress
      );

      const summary: StudyPhaseSummary = {
        phaseId: phase.id,
        phaseName: phase.phaseName,
        phaseCode: phase.phaseCode,
        order: phase.order,
        totalPatients: progressRecords.length,
        patientsNotStarted: progressRecords.filter(p => p.status === 'not_started').length,
        patientsInProgress: progressRecords.filter(p => p.status === 'in_progress').length,
        patientsCompleted: progressRecords.filter(p => p.status === 'completed').length,
        patientsSkipped: progressRecords.filter(p => p.status === 'skipped').length,
        totalTemplates: phase.templateAssignments.length,
        requiredTemplates: phase.templateAssignments.filter(ta => ta.isRequired).length,
        averageCompletionRate: progressRecords.length > 0
          ? progressRecords.reduce((sum, p) => sum + p.progressPercentage, 0) / progressRecords.length
          : 0,
        overduePatients: 0 // TODO: Calculate based on phase windows
      };

      summaries.push(summary);
    }

    return summaries;
  }

  // Helper to map phase codes to visit types
  private mapPhaseToVisitType(phaseCode: string): PatientVisitSubcomponent['type'] {
    const mapping: { [key: string]: PatientVisitSubcomponent['type'] } = {
      'SCR': 'screening',
      'BSL': 'baseline',
      'TRT': 'treatment',
      'FUP': 'follow_up',
      'AE': 'adverse_event'
    };
    
    return mapping[phaseCode] || 'treatment';
  }

  // Firestore conversion helpers
  private prepareForFirestore(data: any): any {
    const prepared = { ...data };
    
    Object.keys(prepared).forEach(key => {
      if (prepared[key] instanceof Date) {
        prepared[key] = Timestamp.fromDate(prepared[key]);
      } else if (Array.isArray(prepared[key])) {
        prepared[key] = prepared[key].map((item: any) => 
          typeof item === 'object' ? this.prepareForFirestore(item) : item
        );
      } else if (typeof prepared[key] === 'object' && prepared[key] !== null) {
        prepared[key] = this.prepareForFirestore(prepared[key]);
      }
    });
    
    return prepared;
  }

  private convertFromFirestore(data: any): any {
    const converted = { ...data };
    
    Object.keys(converted).forEach(key => {
      if (converted[key] && converted[key].toDate) {
        converted[key] = converted[key].toDate();
      } else if (Array.isArray(converted[key])) {
        converted[key] = converted[key].map((item: any) => 
          typeof item === 'object' ? this.convertFromFirestore(item) : item
        );
      } else if (typeof converted[key] === 'object' && converted[key] !== null) {
        converted[key] = this.convertFromFirestore(converted[key]);
      }
    });
    
    return converted;
  }
  
  // Update form completion status when a form is submitted
  async updateFormCompletionStatus(
    patientId: string,
    studyId: string,
    phaseId: string,
    templateId: string,
    isCompleted: boolean
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    try {
      // Get the phase progress document
      const progressQuery = query(
        collection(this.firestore, this.PHASE_PROGRESS_COLLECTION),
        where('patientId', '==', patientId),
        where('studyId', '==', studyId),
        where('phaseId', '==', phaseId),
        limit(1)
      );
      
      const progressSnapshot = await getDocs(progressQuery);
      if (progressSnapshot.empty) {
        console.error('Phase progress not found for patient:', patientId, 'phase:', phaseId);
        return;
      }
      
      const progressDoc = progressSnapshot.docs[0];
      const progressData = progressDoc.data() as PatientPhaseProgress;
      
      // Update form completion status
      if (!progressData.formCompletionStatus) {
        progressData.formCompletionStatus = {};
      }
      
      const wasCompleted = progressData.formCompletionStatus[templateId]?.isCompleted || false;
      
      if (wasCompleted !== isCompleted) {
        progressData.formCompletionStatus[templateId] = {
          ...progressData.formCompletionStatus[templateId],
          isCompleted,
          completedDate: isCompleted ? new Date() : undefined
        };
        
        // Recalculate completion counts
        let completedTemplates = 0;
        let completedRequiredTemplates = 0;
        
        Object.entries(progressData.formCompletionStatus).forEach(([tid, status]) => {
          if (status.isCompleted) {
            completedTemplates++;
            if (status.isRequired) {
              completedRequiredTemplates++;
            }
          }
        });
        
        // Update progress percentages
        const progressPercentage = progressData.totalTemplates > 0 
          ? Math.round((completedTemplates / progressData.totalTemplates) * 100)
          : 0;
        
        // Check if all required templates are completed
        const allRequiredCompleted = completedRequiredTemplates === progressData.requiredTemplates;
        const canProgress = allRequiredCompleted;
        
        // Update blocking reasons
        const blockingReasons: string[] = [];
        if (!allRequiredCompleted) {
          const incompleteRequired = Object.entries(progressData.formCompletionStatus)
            .filter(([_, status]) => status.isRequired && !status.isCompleted)
            .length;
          blockingReasons.push(`${incompleteRequired} required form(s) not completed`);
        }
        
        // Update the progress document
        await updateDoc(doc(this.firestore, this.PHASE_PROGRESS_COLLECTION, progressDoc.id), {
          formCompletionStatus: progressData.formCompletionStatus,
          completedTemplates,
          completedRequiredTemplates,
          progressPercentage,
          canProgress,
          blockingReasons,
          status: completedTemplates === 0 ? 'not_started' : 
                  completedTemplates === progressData.totalTemplates ? 'completed' : 'in_progress',
          lastModifiedBy: currentUser.uid,
          lastModifiedAt: serverTimestamp()
        });
        
        // Also update the patient's visit subcomponent
        const updatedProgress: PatientPhaseProgress = {
          ...progressData,
          completedTemplates,
          completedRequiredTemplates,
          progressPercentage,
          canProgress,
          blockingReasons,
          status: completedTemplates === 0 ? 'not_started' : 
                  completedTemplates === progressData.totalTemplates ? 'completed' : 'in_progress'
        };
        await this.updateVisitSubcomponentProgress(patientId, phaseId, updatedProgress);
        
        console.log(`Updated form completion status for patient ${patientId}, phase ${phaseId}, template ${templateId}`);
      }
    } catch (error) {
      console.error('Error updating form completion status:', error);
      throw error;
    }
  }
}
