import { Injectable, inject, runInInjectionContext, Injector } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  DocumentReference,
  CollectionReference,
  QueryConstraint,
  Timestamp,
  addDoc
} from '@angular/fire/firestore';
import { Observable, from, map, switchMap, of, combineLatest } from 'rxjs';
import { 
  Patient, 
  PatientStatus, 
  PatientVisitSubcomponent, 
  PatientSearchCriteria,
  PatientSummary,
  PatientConsent,
  PatientAlert,
  ProtocolDeviation,
  PatientChangeHistory
} from '../models/patient.model';
import { EdcCompliantAuthService } from './edc-compliant-auth.service';
import { UserProfile } from '../models/user-profile.model';
import { AccessLevel } from '../enums/access-levels.enum';
// StudyPatientReference removed - using Patient model directly
import { StudyPhaseService } from './study-phase.service';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private readonly COLLECTION_NAME = 'patients';
  private readonly VISIT_SUBCOMPONENTS_COLLECTION = 'visitSubcomponents';
  private injector: Injector = inject(Injector);

  constructor(
    private firestore: Firestore,
    private authService: EdcCompliantAuthService,
    private studyPhaseService: StudyPhaseService
  ) {}

  // Create a new patient under a study
  async createPatient(studyId: string, patientData: Partial<Patient>): Promise<string> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    if (!this.canCreatePatient(currentUser)) {
      throw new Error('Insufficient permissions to create patients');
    }

    const patientRef = doc(collection(this.firestore, this.COLLECTION_NAME));
    const patientId = patientRef.id;
    const now = new Date();

    // Build the patient object with required fields
    const newPatient: any = {
      id: patientId,
      studyId, // REQUIRED - Patient must belong to a study
      patientNumber: patientData.patientNumber || await this.generatePatientNumber(studyId),
      identifiers: patientData.identifiers || [],
      demographics: patientData.demographics!,
      enrollmentDate: patientData.enrollmentDate || now,
      enrollmentStatus: patientData.enrollmentStatus || 'screening',
      consents: patientData.consents || [],
      hasValidConsent: this.checkValidConsent(patientData.consents || []),
      visitSubcomponents: [], // Will be created separately
      phases: [], // Will be copied from study
      forms: [], // Will be copied from study
      studyProgress: {
        totalVisits: 0,
        completedVisits: 0,
        missedVisits: 0,
        upcomingVisits: 0,
        overallCompletionPercentage: 0
      },
      activeAlerts: [],
      protocolDeviations: [],
      createdBy: currentUser.uid,
      createdAt: now,
      lastModifiedBy: currentUser.uid,
      lastModifiedAt: now,
      changeHistory: [{
        id: doc(collection(this.firestore, 'temp')).id,
        timestamp: now,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        action: 'created',
        changes: { created: true },
        ipAddress: await this.getClientIP(),
        userAgent: navigator.userAgent
      }]
    };

    // Add optional fields only if they are defined
    if (patientData.siteId !== undefined) {
      newPatient.siteId = patientData.siteId;
    }
    if (patientData.treatmentArm !== undefined) {
      newPatient.treatmentArm = patientData.treatmentArm;
    }
    if (patientData.randomizationId !== undefined) {
      newPatient.randomizationId = patientData.randomizationId;
    }

    // Clean the patient object to remove any undefined values
    const cleanedPatient = this.cleanUndefinedValues(newPatient) as Patient;

    // Save patient document
    await runInInjectionContext(this.injector, async () => {
      await setDoc(patientRef, this.prepareForFirestore(cleanedPatient));
    });

    // Create reference in study's patients subcollection (using simplified patient data)
    const studyPatientRef: any = {
      patientId,
      patientNumber: newPatient.patientNumber,
      enrollmentDate: now,
      status: newPatient.enrollmentStatus,
      addedBy: currentUser.uid,
      addedAt: now
    };
    
    // Only add optional fields if they are defined
    if (newPatient.treatmentArm !== undefined && newPatient.treatmentArm !== null) {
      studyPatientRef.treatmentArm = newPatient.treatmentArm;
    }
    if (newPatient.siteId !== undefined && newPatient.siteId !== null) {
      studyPatientRef.siteId = newPatient.siteId;
    }
    
    await runInInjectionContext(this.injector, async () => {
      await setDoc(doc(this.firestore, `studies/${studyId}/patients`, patientId), studyPatientRef);
    });

    // Get study data to copy phases and forms
    const studyDoc = await runInInjectionContext(this.injector, async () => {
      return await getDoc(doc(this.firestore, 'studies', studyId));
    });
    if (studyDoc.exists()) {
      const study = studyDoc.data() as any;
      
      // Copy phases and forms from study to patient
      const patientPhases: any[] = [];
      const patientForms: any[] = [];
      
      // NOTE: We will NOT copy phases/sections here anymore to avoid duplication
      // The phases will be created as visit subcomponents below from either:
      // 1. studyPhases collection (preferred)
      // 2. study.sections (fallback)
      // 3. study.phases (legacy fallback)
      
      console.log(`[PatientService] Skipping inline phase/form copying to avoid duplication`);
      
      // Load study phases from the studyPhases collection
      const { collection: fbCollection, getDocs, query, where, getFirestore } = await import('@angular/fire/firestore');
      const firestore = getFirestore();
      
      // Query study phases for this specific study ONLY
      const studyPhasesRef = fbCollection(firestore, 'studyPhases');
      let studyPhasesQuery = query(
        studyPhasesRef, 
        where('studyId', '==', studyId)
      );
      
      console.log(`[PatientService] Querying studyPhases collection for studyId: ${studyId}`);
      
      let studyPhasesSnapshot;
      try {
        studyPhasesSnapshot = await runInInjectionContext(this.injector, async () => 
          await getDocs(studyPhasesQuery)
        );
      } catch (error) {
        console.error(`[PatientService] Error querying studyPhases:`, error);
        studyPhasesSnapshot = { docs: [] };
      }
      
      const studyPhases = studyPhasesSnapshot.docs.map(doc => {
        const data = doc.data() as any;
        console.log(`[PatientService] Found phase: ${data['phaseName'] || data['name']} with studyId: ${data['studyId']}`);
        return {
          id: doc.id,
          ...data
        };
      }).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      
      if (studyPhases.length > 0) {
        await this.createVisitSubcomponentsFromPhases(patientId, studyPhases, currentUser.uid);
        
        // Also update the patient document with the phases array
        const phasesForPatient = studyPhases.map(phase => ({
          id: phase.id,
          phaseName: phase.phaseName || phase.name || `Phase ${phase.order}`,
          phaseCode: phase.phaseCode,
          order: phase.order || 0,
          description: phase.description || '',
          type: phase.type || 'treatment',
          status: 'pending',
          completionPercentage: 0,
          windowStartDays: phase.windowStartDays || 0,
          windowEndDays: phase.windowEndDays || 30,
          daysToComplete: phase.daysToComplete || 7,
          plannedDurationDays: phase.plannedDurationDays || 30,
          templateAssignments: phase.templateAssignments || [],
          allowParallel: phase.allowParallel || false,
          allowSkip: phase.allowSkip || false,
          isActive: phase.isActive !== false,
          createdAt: new Date(),
          createdBy: currentUser.uid,
          lastModifiedAt: new Date(),
          lastModifiedBy: currentUser.uid
        }));
        
        // Extract all forms/templates from phases
        const formsForPatient: any[] = [];
        studyPhases.forEach(phase => {
          if (phase.templateAssignments && Array.isArray(phase.templateAssignments)) {
            phase.templateAssignments.forEach((assignment: any, index: number) => {
              formsForPatient.push({
                id: assignment.templateId,
                templateId: assignment.templateId,
                templateName: assignment.name || assignment.templateName || `Template ${index + 1}`,
                templateVersion: assignment.templateVersion || '1.0',
                phaseId: phase.id,
                phaseName: phase.phaseName || phase.name,
                type: assignment.type || 'form',
                status: 'pending',
                completionPercentage: 0,
                isRequired: assignment.isRequired !== false,
                order: assignment.order || index,
                windowStartDays: assignment.windowStartDays || phase.windowStartDays || 0,
                windowEndDays: assignment.windowEndDays || phase.windowEndDays || 30,
                description: assignment.description || ''
              });
            });
          }
        });
        
        // Update the patient document with phases and forms
        const { updateDoc } = await import('@angular/fire/firestore');
        await runInInjectionContext(this.injector, async () => {
          await updateDoc(patientRef, {
            phases: phasesForPatient,
            forms: formsForPatient,
            lastModifiedAt: new Date(),
            lastModifiedBy: currentUser.uid
          });
        });
        
        console.log(`[PatientService] Updated patient ${patientId} with ${phasesForPatient.length} phases and ${formsForPatient.length} forms`);
      } else {
        console.warn(`[PatientService] No phases found in studyPhases collection for study ${studyId}. Patient will have no phases.`);
      }
    }

    return patientId;
  }

  // Create default visit subcomponents for a patient
  private async createDefaultVisitSubcomponents(patientId: string, studyId: string): Promise<void> {
    // Default subcomponents - can be customized based on study protocol
    const defaultSubcomponents = [
      { name: 'Screening', type: 'screening', order: 1 },
      { name: 'Initial Checkin', type: 'baseline', order: 2 },
      { name: 'Study Phase 1', type: 'treatment', order: 3 },
      { name: 'Checkin 2', type: 'follow_up', order: 4 },
      { name: 'Study Phase 2', type: 'treatment', order: 5 },
      { name: 'Final Visit', type: 'follow_up', order: 6 }
    ];

    const currentUser = await this.authService.getCurrentUserProfile();
    const now = new Date();

    for (const component of defaultSubcomponents) {
      const subcomponentId = doc(collection(this.firestore, 'temp')).id;
      const subcomponent: PatientVisitSubcomponent = {
        id: subcomponentId,
        patientId,
        studyId,
        name: component.name,
        type: component.type as any,
        order: component.order,
        isPhaseFolder: false, // Will be updated when linked to phases
        status: 'scheduled',
        completionPercentage: 0,
        templateIds: [],
        requiredTemplateIds: [],
        optionalTemplateIds: [],
        completedTemplates: [],
        inProgressTemplates: [],
        canProgressToNextPhase: true,
        blockingTemplates: [],
        createdBy: currentUser!.uid,
        createdAt: now,
        lastModifiedBy: currentUser!.uid,
        lastModifiedAt: now
      };

      const subcomponentRef = doc(
        this.firestore, 
        this.COLLECTION_NAME, 
        patientId, 
        this.VISIT_SUBCOMPONENTS_COLLECTION, 
        subcomponentId
      );
      await runInInjectionContext(this.injector, async () => {
        await setDoc(subcomponentRef, this.prepareForFirestore(subcomponent));
      });
    }
  }

  // Create visit subcomponents from study phases
  private async createVisitSubcomponentsFromPhases(
    patientId: string,
    studyPhases: any[],
    userId: string
  ): Promise<void> {
    const { collection, doc, setDoc, getFirestore } = await import('@angular/fire/firestore');
    const firestore = getFirestore();
    const patientRef = doc(firestore, 'patients', patientId);
    const subcomponentsRef = collection(patientRef, 'visitSubcomponents');
    
    let totalSubcomponents = 0;
    
    for (const phase of studyPhases) {
      console.log(`[PatientService] Processing phase: ${phase.phaseName || phase.name}, ID: ${phase.id}`);
      
      // First, create a phase-level visit subcomponent
      const phaseSubcomponentId = `phase_${phase.id}`;
      const phaseSubcomponentRef = doc(subcomponentsRef, phaseSubcomponentId);
      
      const phaseSubcomponent: any = {
        id: phaseSubcomponentId,
        patientId,
        studyId: phase.studyId, // Ensure studyId is included
        phaseId: phase.id,
        phaseName: phase.phaseName || phase.name || `Phase ${phase.order}`,
        phaseOrder: phase.order || 0,
        type: phase.type || 'treatment',
        isPhaseFolder: true, // Mark this as a phase folder
        order: phase.order || 0,
        status: 'pending',
        completionPercentage: 0,
        createdAt: new Date(),
        createdBy: userId,
        updatedAt: new Date(),
        lastModifiedBy: userId,
        windowStartDays: phase.windowStartDays || 0,
        windowEndDays: phase.windowEndDays || 30,
        daysToComplete: phase.daysToComplete || 7,
        // Store template IDs for this phase
        templateIds: [],
        requiredTemplateIds: [],
        optionalTemplateIds: [],
        completedTemplates: [],
        inProgressTemplates: []
      };
      
      // Add description if available
      if (phase.description) {
        phaseSubcomponent.description = phase.description;
      }
      
      // Add scheduled date if applicable
      if (phase.plannedDurationDays) {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + (phase.plannedDurationDays || 0));
        phaseSubcomponent.scheduledDate = scheduledDate;
      }
      
      // Process template assignments for this phase
      if (phase.templateAssignments && Array.isArray(phase.templateAssignments)) {
        console.log(`[PatientService] Phase has ${phase.templateAssignments.length} template assignments`);
        
        const templateIds: string[] = [];
        const requiredTemplateIds: string[] = [];
        const optionalTemplateIds: string[] = [];
        
        for (let i = 0; i < phase.templateAssignments.length; i++) {
          const assignment = phase.templateAssignments[i];
          const templateSubcomponentId = `${phase.id}_template_${assignment.templateId || i}`;
          const templateSubcomponentRef = doc(subcomponentsRef, templateSubcomponentId);
          
          // Add to template lists
          templateIds.push(assignment.templateId);
          if (assignment.isRequired) {
            requiredTemplateIds.push(assignment.templateId);
          } else {
            optionalTemplateIds.push(assignment.templateId);
          }
          
          const templateSubcomponent: any = {
            id: templateSubcomponentId,
            patientId,
            studyId: phase.studyId, // Ensure studyId is included
            phaseId: phase.id,
            phaseName: phase.phaseName || phase.name || `Phase ${phase.order}`,
            phaseOrder: phase.order || 0,
            templateId: assignment.templateId,
            templateName: assignment.templateName || `Template ${i + 1}`,
            templateVersion: assignment.templateVersion || '1.0',
            type: 'form', // Mark this as a form/template
            isPhaseFolder: false,
            order: (phase.order * 1000) + (assignment.order || i), // Ensure unique ordering
            status: 'pending',
            completionPercentage: 0,
            createdAt: new Date(),
            createdBy: userId,
            updatedAt: new Date(),
            lastModifiedBy: userId,
            isRequired: assignment.isRequired || false,
            completionRequired: assignment.completionRequired || false,
            signatureRequired: assignment.signatureRequired || false,
            reviewRequired: assignment.reviewRequired || false,
            windowStartDays: assignment.windowStartDays || phase.windowStartDays || 0,
            windowEndDays: assignment.windowEndDays || phase.windowEndDays || 30,
            daysToComplete: assignment.daysToComplete || 7
          };
          
          // Add scheduled date if applicable
          if (assignment.scheduledDays || phase.plannedDurationDays) {
            const scheduledDate = new Date();
            scheduledDate.setDate(scheduledDate.getDate() + (assignment.scheduledDays || phase.plannedDurationDays || 0));
            templateSubcomponent.scheduledDate = scheduledDate;
          }
          
          console.log(`[PatientService] Creating template subcomponent: ${templateSubcomponent.templateName}`);
          
          await runInInjectionContext(this.injector, async () => {
            await setDoc(templateSubcomponentRef, this.prepareForFirestore(templateSubcomponent));
          });
          
          totalSubcomponents++;
        }
        
        // Update phase subcomponent with template IDs
        phaseSubcomponent.templateIds = templateIds;
        phaseSubcomponent.requiredTemplateIds = requiredTemplateIds;
        phaseSubcomponent.optionalTemplateIds = optionalTemplateIds;
      } else {
        console.log(`[PatientService] Phase ${phase.phaseName || phase.name} has no template assignments`);
      }
      
      // Save the phase subcomponent
      console.log(`[PatientService] Creating phase subcomponent: ${phaseSubcomponent.phaseName}`);
      await runInInjectionContext(this.injector, async () => {
        await setDoc(phaseSubcomponentRef, this.prepareForFirestore(phaseSubcomponent));
      });
      
      totalSubcomponents++;
    }
    
    console.log(`[PatientService] Created ${totalSubcomponents} visit subcomponents from ${studyPhases.length} phases for patient ${patientId}`);
  }
  
  // DEPRECATED - Remove this method as we only use studyPhases collection now
  // Keeping temporarily for reference but should not be called
  private async DEPRECATED_createVisitSubcomponentsFromSections(
    patientId: string,
    sections: any[],
    userId: string
  ): Promise<void> {
    const { collection, doc, setDoc, getFirestore } = await import('@angular/fire/firestore');
    const firestore = getFirestore();
    const patientRef = doc(firestore, 'patients', patientId);
    const subcomponentsRef = collection(patientRef, 'visitSubcomponents');
    const now = new Date();

    for (const section of sections) {
      const subcomponentId = this.generateId();
      const subcomponent: any = {
        id: subcomponentId,
        patientId,
        name: section.name || 'Unnamed Section',
        type: section.type || 'treatment',
        order: section.order || 1,
        phaseId: section.id,
        isPhaseFolder: true,
        
        // Initial status
        status: 'scheduled',
        completionPercentage: 0,
        
        // Timing information
        windowStartDays: section.windowStartDays || 0,
        windowEndDays: section.windowEndDays || 30,
        daysToComplete: section.daysToComplete || 7,
        
        // Metadata
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        lastModifiedBy: userId,
        lastModifiedAt: now,
        
        // Copy form template IDs from section
        templateIds: section.formTemplates?.map((t: any) => t.templateId || t.id || t) || [],
        requiredTemplateIds: section.formTemplates?.filter((t: any) => t.isRequired !== false).map((t: any) => t.templateId || t.id || t) || [],
        optionalTemplateIds: section.formTemplates?.filter((t: any) => t.isRequired === false).map((t: any) => t.templateId || t.id || t) || [],
        completedTemplates: [],
        inProgressTemplates: [],
        
        // Phase progression
        canProgressToNextPhase: false,
        blockingTemplates: section.formTemplates?.filter((t: any) => t.isRequired !== false).map((t: any) => t.templateId || t.id || t) || []
      };
      
      // Add optional fields only if they are defined
      if (section.description !== undefined && section.description !== null) {
        subcomponent.description = section.description;
      }
      
      // Calculate visit window dates based on enrollment date and scheduled day
      if (section.scheduledDay !== undefined && section.scheduledDay !== null) {
        subcomponent.scheduledDate = new Date(now.getTime() + (section.scheduledDay * 24 * 60 * 60 * 1000));
      }
      if (section.windowStart !== undefined && section.windowStart !== null) {
        subcomponent.windowStartDate = new Date(now.getTime() + (section.windowStart * 24 * 60 * 60 * 1000));
      }
      if (section.windowEnd !== undefined && section.windowEnd !== null) {
        subcomponent.windowEndDate = new Date(now.getTime() + (section.windowEnd * 24 * 60 * 60 * 1000));
      }
      
      // Save to Firestore subcollection
      const subcomponentRef = doc(subcomponentsRef, subcomponentId);
      await runInInjectionContext(this.injector, async () => {
        await setDoc(subcomponentRef, this.prepareForFirestore(subcomponent));
      });
    }
    
    console.log(`Created ${sections.length} visit subcomponents from sections for patient ${patientId}`);
  }

  // Helper method to generate unique IDs
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  // Get patient by ID
  getPatient(patientId: string): Observable<Patient | null> {
    return from(this.authService.getCurrentUserProfile()).pipe(
      switchMap(currentUser => {
        if (!currentUser) throw new Error('User not authenticated');

        const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
        return from(runInInjectionContext(this.injector, async () => await getDoc(patientRef))).pipe(
          map(docSnap => {
            if (!docSnap.exists()) return null;
            const patient = this.convertFromFirestore(docSnap.data()) as Patient;
            
            // Check permissions
            if (!this.canViewPatient(currentUser, patient)) {
              throw new Error('Insufficient permissions to view this patient');
            }

            // Mask PHI if user doesn't have permission
            if (!this.canViewPHI(currentUser)) {
              patient.demographics = this.maskPHI(patient.demographics);
            }

            return patient;
          })
        );
      })
    );
  }

  // Get patient by ID
  async getPatientById(patientId: string): Promise<Patient | null> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    try {
      const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
      const patientDoc = await runInInjectionContext(this.injector, async () => await getDoc(patientRef));
      
      if (!patientDoc.exists()) {
        return null;
      }

      const patient = this.convertFromFirestore(patientDoc.data()) as Patient;
      
      // Check if user can view this patient
      if (!this.canViewPatient(currentUser, patient)) {
        throw new Error('Insufficient permissions to view this patient');
      }

      // Mask PHI if user doesn't have permission
      if (!this.canViewPHI(currentUser)) {
        patient.demographics = this.maskPHI(patient.demographics);
      }

      // Load visit subcomponents from subcollection
      try {
        const subcomponentsRef = collection(this.firestore, this.COLLECTION_NAME, patientId, this.VISIT_SUBCOMPONENTS_COLLECTION);
        const subcomponentsSnapshot = await runInInjectionContext(this.injector, async () => 
          await getDocs(subcomponentsRef)
        );
        
        const visitSubcomponents: PatientVisitSubcomponent[] = [];
        subcomponentsSnapshot.forEach(doc => {
          visitSubcomponents.push(this.convertFromFirestore(doc.data()) as PatientVisitSubcomponent);
        });
        
        // Sort by order
        visitSubcomponents.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        // Add to patient object for backward compatibility
        patient.visitSubcomponents = visitSubcomponents;
        
        // Also set as phases if phases array is empty
        if (!patient.phases || patient.phases.length === 0) {
          patient.phases = visitSubcomponents;
        }
      } catch (error) {
        console.log('No visit subcomponents found or error loading them:', error);
        // Continue without subcomponents
      }

      return patient;
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  // Delete patient by ID
  async deletePatient(patientId: string): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // Check permissions
    const hasPermission = ['ADMIN', 'SUPER_ADMIN', 'INVESTIGATOR'].includes(currentUser.accessLevel);
    if (!hasPermission) {
      throw new Error('Insufficient permissions to delete patients');
    }

    try {
      // Delete the patient document
      const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
      await runInInjectionContext(this.injector, async () => {
        await deleteDoc(patientRef);
      });

      // TODO: Add audit logging when audit service is available
      console.log(`Patient ${patientId} deleted by ${currentUser.email}`);
    } catch (error) {
      console.error('Error deleting patient:', error);
      throw error;
    }
  }

  // Get patients by study using the hierarchical structure
  async getPatientsByStudy(studyId: string): Promise<Patient[]> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // Get patient references from study subcollection
    const studyPatientsRef = collection(this.firestore, `studies/${studyId}/patients`);
    const studyPatientsSnapshot = await runInInjectionContext(this.injector, async () => await getDocs(studyPatientsRef));
    
    const patientIds = studyPatientsSnapshot.docs.map(doc => {
      const data = doc.data() as { patientId: string };
      return data.patientId;
    });

    if (patientIds.length === 0) return [];

    // Get full patient documents
    const patients: Patient[] = [];
    for (const patientId of patientIds) {
      const patient = await this.getPatientById(patientId);
      if (patient && this.canViewPatient(currentUser, patient)) {
        const maskedPatient = this.canViewPHI(currentUser) ? patient : {
          ...patient,
          demographics: this.maskPHI(patient.demographics)
        };
        patients.push(maskedPatient);
      }
    }

    return patients;
  }

  // Get all patients with optional filters
  async getPatients(filters?: {
    studyId?: string;
    siteId?: string;
    enrollmentStatus?: string;
    searchTerm?: string;
  }): Promise<Patient[]> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // If studyId is provided, use the hierarchical method
    if (filters?.studyId) {
      return this.getPatientsByStudy(filters.studyId);
    }

    // Otherwise, query all patients the user has access to
    const patientsRef = collection(this.firestore, this.COLLECTION_NAME);
    let constraints: QueryConstraint[] = [];

    if (filters?.siteId) {
      constraints.push(where('siteId', '==', filters.siteId));
    }
    if (filters?.enrollmentStatus) {
      constraints.push(where('enrollmentStatus', '==', filters.enrollmentStatus));
    }

    const q = query(patientsRef, ...constraints, orderBy('createdAt', 'desc'));
    const snapshot = await runInInjectionContext(this.injector, async () => await getDocs(q));
    
    const patients: Patient[] = [];
    for (const doc of snapshot.docs) {
      const patient = this.convertFromFirestore(doc.data()) as Patient;
      patient.id = doc.id;
      
      if (this.canViewPatient(currentUser, patient)) {
        const maskedPatient = this.canViewPHI(currentUser) ? patient : {
          ...patient,
          demographics: this.maskPHI(patient.demographics)
        };
        patients.push(maskedPatient);
      }
    }

    // Apply search term filter if provided
    if (filters?.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      return patients.filter(p => 
        p.patientNumber.toLowerCase().includes(searchLower) ||
        (this.canViewPHI(currentUser) && (
          p.demographics.firstName?.toLowerCase().includes(searchLower) ||
          p.demographics.lastName?.toLowerCase().includes(searchLower)
        ))
      );
    }

    return patients;
  }

  // Get patient visit subcomponents
  getPatientVisitSubcomponents(patientId: string): Observable<PatientVisitSubcomponent[]> {
    // Query the visitSubcomponents subcollection under the patient document
    const subcomponentsRef = collection(this.firestore, this.COLLECTION_NAME, patientId, this.VISIT_SUBCOMPONENTS_COLLECTION);
    const q = query(subcomponentsRef);
    
    return from(runInInjectionContext(this.injector, async () => await getDocs(q))).pipe(
      map(snapshot => {
        const subcomponents: PatientVisitSubcomponent[] = [];
        snapshot.forEach(doc => {
          subcomponents.push({ id: doc.id, ...doc.data() } as PatientVisitSubcomponent);
        });
        
        console.log(`Found ${subcomponents.length} visitSubcomponents for patient ${patientId}`);
        
        // Sort by order if present
        return subcomponents.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      })
    );
  }

  // Add or update a visit subcomponent
  async updateVisitSubcomponent(
    patientId: string, 
    subcomponent: Partial<PatientVisitSubcomponent>
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    if (!this.canEditPatient(currentUser)) {
      throw new Error('Insufficient permissions to edit patient visits');
    }

    const now = new Date();
    const subcomponentId = subcomponent.id || doc(collection(this.firestore, 'temp')).id;
    
    const updatedSubcomponent = {
      ...subcomponent,
      id: subcomponentId,
      patientId,
      lastModifiedBy: currentUser.uid,
      lastModifiedAt: now
    };

    // Update or create the document in the visitSubcomponents subcollection
    const subcomponentRef = doc(
      this.firestore, 
      this.COLLECTION_NAME, 
      patientId, 
      this.VISIT_SUBCOMPONENTS_COLLECTION, 
      subcomponentId
    );
    
    await runInInjectionContext(this.injector, async () => 
      await setDoc(subcomponentRef, updatedSubcomponent, { merge: true })
    );
    
    // Also update the patient's lastModified fields
    const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
    await runInInjectionContext(this.injector, async () => 
      await updateDoc(patientRef, { 
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: now
      })
    );
  }

  // Assign templates to a visit subcomponent
  async assignTemplatesToSubcomponent(
    patientId: string,
    subcomponentId: string,
    templateIds: string[]
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    if (!this.canEditPatient(currentUser)) {
      throw new Error('Insufficient permissions to assign templates');
    }

    const subcomponentRef = doc(
      this.firestore, 
      this.COLLECTION_NAME, 
      patientId, 
      this.VISIT_SUBCOMPONENTS_COLLECTION, 
      subcomponentId
    );

    await runInInjectionContext(this.injector, async () => {
      await updateDoc(subcomponentRef, {
        templateIds,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });
    });
  }

  // Search patients
  searchPatients(criteria: PatientSearchCriteria): Observable<PatientSummary[]> {
    return from(this.authService.getCurrentUserProfile()).pipe(
      switchMap(currentUser => {
        if (!currentUser) throw new Error('User not authenticated');

        const constraints: QueryConstraint[] = [];
        
        if (criteria.studyId) {
          constraints.push(where('studyId', '==', criteria.studyId));
        }
        
        if (criteria.siteId) {
          constraints.push(where('siteId', '==', criteria.siteId));
        }
        
        if (criteria.status) {
          constraints.push(where('enrollmentStatus', '==', criteria.status));
        }

        constraints.push(orderBy('enrollmentDate', 'desc'));
        constraints.push(limit(100));

        const patientsRef = collection(this.firestore, this.COLLECTION_NAME);
        const q = query(patientsRef, ...constraints);

        return from(runInInjectionContext(this.injector, async () => await getDocs(q))).pipe(
          map(snapshot => {
            return snapshot.docs
              .map(doc => {
                const patient = this.convertFromFirestore(doc.data()) as Patient;
                
                // Check permissions
                if (!this.canViewPatient(currentUser, patient)) {
                  return null;
                }

                // Convert to summary
                return this.toPatientSummary(patient, !this.canViewPHI(currentUser));
              })
              .filter(summary => summary !== null) as PatientSummary[];
          })
        );
      })
    );
  }

  // Update patient status
  async updatePatientStatus(
    patientId: string, 
    newStatus: PatientStatus, 
    reason?: string
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const patient = await this.getPatientById(patientId);
    if (!patient) throw new Error('Patient not found');

    if (!this.canEditPatient(currentUser)) {
      throw new Error('Insufficient permissions to update patient status');
    }

    const now = new Date();
    const changeEntry: PatientChangeHistory = {
      id: doc(collection(this.firestore, 'temp')).id,
      timestamp: now,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      action: 'status_changed',
      changes: {
        oldStatus: patient.enrollmentStatus,
        newStatus,
        reason
      },
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent
    };

    const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
    await runInInjectionContext(this.injector, async () => {
      await updateDoc(patientRef, {
        enrollmentStatus: newStatus,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp(),
        changeHistory: [...patient.changeHistory, changeEntry]
      });
    });
  }

  // Add patient consent
  async addPatientConsent(patientId: string, consent: PatientConsent): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    if (!this.canManageConsent(currentUser)) {
      throw new Error('Insufficient permissions to manage patient consent');
    }

    const patient = await this.getPatientById(patientId);
    if (!patient) throw new Error('Patient not found');

    const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
    await runInInjectionContext(this.injector, async () => {
      await updateDoc(patientRef, {
        consents: [...patient.consents, consent],
        hasValidConsent: true,
        consentExpirationDate: consent.expirationDate,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });
    });
  }

  // Helper methods
  private async generatePatientNumber(studyId: string): Promise<string> {
    // Generate a unique patient number for the study
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 5);
    return `${studyId.substring(0, 3).toUpperCase()}-${timestamp}-${random}`.toUpperCase();
  }

  private checkValidConsent(consents: PatientConsent[]): boolean {
    if (!consents || consents.length === 0) return false;
    
    const now = new Date();
    return consents.some(consent => 
      consent.type === 'informed_consent' && 
      !consent.withdrawnDate &&
      (!consent.expirationDate || consent.expirationDate > now)
    );
  }

  private toPatientSummary(patient: Patient, maskPHI: boolean): PatientSummary {
    return {
      id: patient.id,
      studyId: patient.studyId,
      patientNumber: patient.patientNumber,
      initials: maskPHI ? '**' : this.getInitials(patient.demographics),
      status: patient.enrollmentStatus,
      enrollmentDate: patient.enrollmentDate,
      currentVisit: patient.currentVisitId,
      nextVisitDate: patient.nextScheduledVisitId ? new Date() : undefined, // TODO: Get from visit
      completionPercentage: patient.studyProgress.overallCompletionPercentage,
      hasAlerts: patient.activeAlerts.length > 0,
      alertCount: patient.activeAlerts.length,
      lastActivity: patient.lastModifiedAt
    };
  }

  private getInitials(demographics: any): string {
    if (!demographics.firstName || !demographics.lastName) return 'N/A';
    return `${demographics.firstName.charAt(0)}${demographics.lastName.charAt(0)}`.toUpperCase();
  }

  private maskPHI(demographics: any): any {
    return {
      ...demographics,
      firstName: '***',
      lastName: '***',
      dateOfBirth: null,
      email: '***@***.***',
      phone: '***-***-****',
      address: null,
      emergencyContact: null
    };
  }

  // Permission checks
  private canCreatePatient(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN ||
            user.accessLevel === AccessLevel.INVESTIGATOR ||
            user.accessLevel === AccessLevel.STUDY_COORDINATOR);
  }

  private canViewPatient(user: UserProfile, patient: Patient): boolean {
    if (user.status !== 'ACTIVE') return false;
    
    // Admins can view all
    if (user.accessLevel === AccessLevel.ADMIN || user.accessLevel === AccessLevel.SUPER_ADMIN) {
      return true;
    }

    // Check if user has access to the study
    // TODO: Implement study-specific permissions
    return true;
  }

  private canEditPatient(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN ||
            user.accessLevel === AccessLevel.INVESTIGATOR ||
            user.accessLevel === AccessLevel.STUDY_COORDINATOR);
  }

  private canViewPHI(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN ||
            user.accessLevel === AccessLevel.INVESTIGATOR ||
            user.accessLevel === AccessLevel.STUDY_COORDINATOR ||
            user.accessLevel === AccessLevel.CLINICAL_RESEARCH_ASSOCIATE);
  }

  private canManageConsent(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN ||
            user.accessLevel === AccessLevel.INVESTIGATOR ||
            user.accessLevel === AccessLevel.STUDY_COORDINATOR);
  }

  // Firestore conversion helpers
  private prepareForFirestore(data: any): any {
    // First remove undefined values
    const cleaned = this.removeUndefinedFields(data);
    const prepared = { ...cleaned };
    
    // Convert Date objects to Firestore Timestamps
    Object.keys(prepared).forEach(key => {
      if (prepared[key] instanceof Date) {
        prepared[key] = Timestamp.fromDate(prepared[key]);
      } else if (Array.isArray(prepared[key])) {
        prepared[key] = prepared[key]
          .filter(item => item !== undefined) // Remove undefined items from arrays
          .map((item: any) => 
            typeof item === 'object' ? this.prepareForFirestore(item) : item
          );
      } else if (typeof prepared[key] === 'object' && prepared[key] !== null) {
        prepared[key] = this.prepareForFirestore(prepared[key]);
      }
    });
    
    return prepared;
  }
  
  // Helper to remove undefined fields from objects
  private removeUndefinedFields(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj
        .filter(item => item !== undefined)
        .map(item => this.removeUndefinedFields(item));
    }
    
    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          const cleanedValue = this.removeUndefinedFields(value);
          if (cleanedValue !== undefined) {
            result[key] = cleanedValue;
          }
        }
      }
      return result;
    }
    
    return obj;
  }

  private convertFromFirestore(data: any): any {
    const converted = { ...data };
    
    // Convert Firestore Timestamps to Date objects
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

  private cleanUndefinedValues(obj: any): any {
    if (obj === undefined) {
      return undefined;
    }
    
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      // Filter out undefined values and recursively clean remaining items
      return obj
        .filter(item => item !== undefined)
        .map(item => this.cleanUndefinedValues(item));
    }
    
    // For objects, create a new object without undefined values
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (value !== undefined) {
        const cleanedValue = this.cleanUndefinedValues(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
    });
    
    return cleaned;
  }

  private async getClientIP(): Promise<string> {
    // In a real app, you might want to get this from the server
    return 'CLIENT_IP';
  }
}
