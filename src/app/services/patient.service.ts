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
import { Observable, from, map, switchMap, of, combineLatest, BehaviorSubject } from 'rxjs';
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
import { FormTemplateService } from './form-template.service';
import { PatientPhase, PatientPhaseTemplate } from '../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private readonly COLLECTION_NAME = 'patients';
  private injector: Injector = inject(Injector);
  private patientsSubject = new BehaviorSubject<Patient[]>([]);
  public patients$ = this.patientsSubject.asObservable();

  constructor(
    private firestore: Firestore,
    private authService: EdcCompliantAuthService,
    private studyPhaseService: StudyPhaseService,
    private formTemplateService: FormTemplateService
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
        // Create patient phases with fully embedded template data
        const patientPhases = await this.createPhasesWithEmbeddedTemplates(patientId, studyPhases, currentUser.uid);
        
        // Update the patient document with the new phases structure
        await runInInjectionContext(this.injector, async () => {
          await updateDoc(patientRef, {
            phases: patientPhases, // Store the full PatientPhase[] with embedded templates
            standaloneForms: [], // Initialize empty standalone forms array
            updatedAt: serverTimestamp(),
            lastModifiedBy: currentUser.uid
          });
        });
        
        console.log(`[PatientService] Updated patient ${patientId} with ${patientPhases.length} phases containing embedded templates`);
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

      // Removed - using phases instead of subcomponents
    }
  }

  // Create patient phases with fully embedded template data
  private async createPhasesWithEmbeddedTemplates(
    patientId: string, 
    studyPhases: any[],
    userId: string
  ): Promise<PatientPhase[]> {
    const patientPhases: PatientPhase[] = [];
    
    for (const studyPhase of studyPhases) {
      console.log(`[PatientService] Processing phase: ${studyPhase.phaseName || studyPhase.name}, ID: ${studyPhase.id}`);
      
      // Create the patient phase structure
      const patientPhase: PatientPhase = {
        id: `phase_${studyPhase.id}_${patientId}`, // Make ID unique per patient
        phaseId: studyPhase.id,
        phaseName: studyPhase.phaseName || studyPhase.name || `Phase ${studyPhase.order}`,
        phaseCode: studyPhase.phaseCode,
        description: studyPhase.description,
        type: studyPhase.type || 'treatment',
        order: studyPhase.order || 0,
        
        // Phase timing
        windowStartDays: studyPhase.windowStartDays || 0,
        windowEndDays: studyPhase.windowEndDays || 30,
        daysToComplete: studyPhase.daysToComplete || 7,
        plannedDurationDays: studyPhase.plannedDurationDays,
        
        // Status
        status: 'not_started',
        completionPercentage: 0,
        
        // Templates will be populated below
        templates: [],
        
        // Phase progression
        canProgressToNextPhase: false,
        blockingTemplates: [],
        allowParallel: studyPhase.allowParallel || false,
        allowSkip: studyPhase.allowSkip || false,
        
        // Metadata
        createdBy: userId,
        createdAt: new Date(),
        lastModifiedBy: userId,
        lastModifiedAt: new Date()
      };
      
      // Add scheduled date if applicable
      if (studyPhase.plannedDurationDays) {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + (studyPhase.plannedDurationDays || 0));
        patientPhase.scheduledDate = scheduledDate;
      }
      
      // Process template assignments and fetch full template data
      if (studyPhase.templateAssignments && Array.isArray(studyPhase.templateAssignments)) {
        console.log(`[PatientService] Phase has ${studyPhase.templateAssignments.length} template assignments`);
        
        for (let i = 0; i < studyPhase.templateAssignments.length; i++) {
          const assignment = studyPhase.templateAssignments[i];
          
          try {
            // Fetch the full template data from formTemplates collection
            console.log(`[PatientService] Fetching template ${assignment.templateId} from formTemplates collection`);
            const fullTemplate = await this.formTemplateService.getTemplate(assignment.templateId);
            
            if (!fullTemplate) {
              console.warn(`[PatientService] Template ${assignment.templateId} not found in formTemplates collection`);
              // Try to use the assignment data if template not found
              if (!assignment.templateName) {
                console.warn(`[PatientService] No template name in assignment, skipping`);
                continue;
              }
            }
            
            // Create a unique form instance ID for this patient
            const formInstanceId = `${patientId}_${studyPhase.id}_${assignment.templateId}_${Date.now()}`;
            
            // Deep clone the template to ensure complete independence
            const templateClone = fullTemplate ? JSON.parse(JSON.stringify(fullTemplate)) : null;
            
            // Create the patient phase template with full embedded data
            const patientPhaseTemplate: PatientPhaseTemplate = {
              id: formInstanceId, // Unique form instance ID for this patient
              templateId: assignment.templateId, // Original template ID for reference
              templateName: assignment.templateName || templateClone?.name || `Template ${i + 1}`,
              templateVersion: assignment.templateVersion || templateClone?.version || '1.0',
              category: templateClone?.category || assignment.category || 'general',
              description: templateClone?.description || assignment.description || '',
              
              // Deep copy the complete template structure - this is the patient's own copy
              fields: templateClone?.fields || assignment.fields || [],
              sections: templateClone?.sections || assignment.sections || [],
              metadata: {
                // Store complete original template data
                originalTemplateId: assignment.templateId,
                originalTemplateName: templateClone?.name || assignment.templateName,
                originalTemplateVersion: templateClone?.version || assignment.templateVersion || '1.0',
                templateType: templateClone?.templateType || assignment.templateType || 'form',
                settings: templateClone?.settings || assignment.settings || {},
                validation: templateClone?.validation || assignment.validation || {},
                // Additional template metadata
                layout: templateClone?.layout || assignment.layout || {},
                styling: templateClone?.styling || assignment.styling || {},
                logic: templateClone?.logic || assignment.logic || {},
                calculations: templateClone?.calculations || assignment.calculations || [],
                dependencies: templateClone?.dependencies || assignment.dependencies || [],
                // Compliance and regulatory
                isGxpValidated: templateClone?.isGxpValidated || assignment.isGxpValidated || false,
                requiresSignature: templateClone?.requiresSignature || assignment.requiresSignature || false,
                auditTrail: templateClone?.auditTrail !== false,
                // Template configuration
                allowPartialSave: templateClone?.allowPartialSave !== false,
                autoSaveInterval: templateClone?.autoSaveInterval || 30,
                maxAttachmentSize: templateClone?.maxAttachmentSize || 10485760, // 10MB default
                supportedFileTypes: templateClone?.supportedFileTypes || ['pdf', 'jpg', 'png', 'doc', 'docx'],
                // Copy any custom properties from the template
                customProperties: templateClone?.customProperties || assignment.customProperties || {},
                // Store the complete original template for reference
                fullTemplateSnapshot: templateClone || assignment
              },
              
              // Assignment properties from study phase
              isRequired: assignment.isRequired !== false,
              order: assignment.order || i,
              completionRequired: assignment.completionRequired || false,
              signatureRequired: assignment.signatureRequired || false,
              reviewRequired: assignment.reviewRequired || false,
              
              // Additional assignment metadata
              assignmentNotes: assignment.notes || '',
              assignmentTags: assignment.tags || [],
              expectedCompletionDays: assignment.expectedCompletionDays,
              reminderSettings: assignment.reminderSettings || {},
              
              // Initial status for this patient
              status: 'pending',
              completionPercentage: 0,
              
              // Initialize empty form data - will be populated when patient fills the form
              formData: {},
              validationErrors: [],
              changeHistory: [
                {
                  action: 'created',
                  timestamp: new Date(),
                  userId: userId,
                  details: `Form instance created for patient ${patientId}`,
                  metadata: {
                    patientId: patientId,
                    studyPhaseId: studyPhase.id,
                    templateId: assignment.templateId
                  }
                }
              ],
              
              // Patient-specific form instance data
              patientId: patientId,
              studyId: studyPhase.studyId,
              phaseId: studyPhase.id,
              formInstanceCreatedAt: new Date(),
              formInstanceCreatedBy: userId
            };
            
            patientPhase.templates.push(patientPhaseTemplate);
            
            // Track blocking templates if required
            if (patientPhaseTemplate.isRequired) {
              patientPhase.blockingTemplates.push(formInstanceId); // Use form instance ID, not template ID
            }
            
            console.log(`[PatientService] Created form instance ${formInstanceId} from template ${assignment.templateId}`);
            
          } catch (error) {
            console.error(`[PatientService] Error fetching template ${assignment.templateId}:`, error);
            // Continue with other templates even if one fails
          }
        }
        
        console.log(`[PatientService] Successfully embedded ${patientPhase.templates.length} form instances in phase ${patientPhase.phaseName}`);
      } else {
        console.log(`[PatientService] Phase ${patientPhase.phaseName} has no template assignments`);
      }
      
      patientPhases.push(patientPhase);
    }
    
    console.log(`[PatientService] Created ${patientPhases.length} patient phases with ${patientPhases.reduce((sum, p) => sum + p.templates.length, 0)} total form instances`);
    return patientPhases;
  }

  // Delete patient (soft delete)
  async deletePatient(patientId: string): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');
    
    // Check permissions
    if (currentUser.accessLevel !== AccessLevel.ADMIN && 
        currentUser.accessLevel !== AccessLevel.SUPER_ADMIN) {
      throw new Error('Insufficient permissions to delete patient');
    }
    
    const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
    
    // Soft delete by updating status
    await runInInjectionContext(this.injector, async () => {
      await updateDoc(patientRef, {
        status: 'withdrawn',
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp(),
        lastModifiedBy: currentUser.uid
      });
    });
    
    console.log(`[PatientService] Soft deleted patient ${patientId}`);
  }
  
  // Get patient by ID
  async getPatientById(patientId: string): Promise<Patient | null> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const patientRef = doc(this.firestore, this.COLLECTION_NAME, patientId);
    const patientDoc = await runInInjectionContext(this.injector, async () => await getDoc(patientRef));
    
    if (!patientDoc.exists()) {
      return null;
    }

    const patient = this.convertFromFirestore(patientDoc.data()) as Patient;
    patient.id = patientDoc.id;
    
    if (!this.canViewPatient(currentUser, patient)) {
      throw new Error('Insufficient permissions to view this patient');
    }

    // Mask PHI if user doesn't have permission
    if (!this.canViewPHI(currentUser)) {
      patient.demographics = this.maskPHI(patient.demographics);
    }

    return patient;
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

  // Get patient as observable
  getPatient(patientId: string): Observable<Patient | null> {
    return from(this.getPatientById(patientId));
  }

  // Removed assignTemplatesToSubcomponent - using phases instead

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
      currentVisit: patient.currentPhaseId || undefined,
      nextVisitDate: patient.nextScheduledPhaseId ? new Date() : undefined, // TODO: Get from phase
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
