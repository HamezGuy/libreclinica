import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
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
  addDoc,
  arrayUnion,
  arrayRemove,
  increment,
  documentId,
  writeBatch,
  onSnapshot
} from '@angular/fire/firestore';
import { Observable, BehaviorSubject, map, switchMap, combineLatest, firstValueFrom } from 'rxjs';

import { IStudyService, StudyStatistics, EnrollmentStatistics, CompletionStatistics, AuditReport, ImportResult } from './interfaces/study-service.interface';
import { 
  Study, 
  StudySummary, 
  StudySection, 
  StudySectionSummary,
  PatientStudyEnrollment, 
  CareIndicator, 
  StudyConfiguration,
  StudyPermissions,
  StudyChange,
  PatientEnrollmentChange,
  CareIndicatorType,
  CareIndicatorSeverity,
  Substudy,
  StudyGroup,
  StudyFormInstance,
  EnhancedStudySection,
  StudySectionFormTemplate,
  DataQuery,
  FormInstanceChange,
  StudyFormInstanceStatus,
  SectionCompletionStatus
} from '../models/study.model';
// StudyPatientReference removed - using simplified patient reference directly
import { EdcCompliantAuthService } from './edc-compliant-auth.service';
import { CloudAuditService } from './cloud-audit.service';
import { StudyPhaseService } from './study-phase.service';
import { AccessLevel } from '../enums/access-levels.enum';

@Injectable({
  providedIn: 'root'
})
export class StudyService implements IStudyService {
  // Reactive data streams
  private studiesSubject = new BehaviorSubject<Study[]>([]);
  private careIndicatorsSubject = new BehaviorSubject<CareIndicator[]>([]);

  constructor(
    private firestore: Firestore,
    private authService: EdcCompliantAuthService,
    private auditService: CloudAuditService,
    private studyPhaseService: StudyPhaseService,
    private injector: Injector
  ) {
    this.initializeRealtimeListeners();
  }

  // Reactive data streams for enhanced features
  private substudiesSubject = new BehaviorSubject<Substudy[]>([]);
  private studyGroupsSubject = new BehaviorSubject<StudyGroup[]>([]);
  private formInstancesSubject = new BehaviorSubject<StudyFormInstance[]>([]);
  private dataQueriesSubject = new BehaviorSubject<DataQuery[]>([]);

  // Public observables
  public studies$ = this.studiesSubject.asObservable();
  public substudies$ = this.substudiesSubject.asObservable();
  public studyGroups$ = this.studyGroupsSubject.asObservable();
  public formInstances$ = this.formInstancesSubject.asObservable();
  public dataQueries$ = this.dataQueriesSubject.asObservable();

  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  /**
   * Remove undefined fields from an object to prevent Firestore errors
   */
  private removeUndefinedFields(obj: any): any {
    const cleaned: any = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (value !== undefined && value !== null) {
          if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            // Recursively clean nested objects
            cleaned[key] = this.removeUndefinedFields(value);
          } else if (Array.isArray(value)) {
            // Clean arrays
            cleaned[key] = value.map(item => {
              if (typeof item === 'object' && item !== null && !(item instanceof Date)) {
                return this.removeUndefinedFields(item);
              }
              return item;
            }).filter(item => item !== undefined && item !== null);
          } else {
            cleaned[key] = value;
          }
        }
      }
    }
    
    return cleaned;
  }
  
  /**
   * Debug helper to check for undefined values in an object
   */
  private checkForUndefined(obj: any, path: string = 'root'): void {
    if (obj === undefined) {
      console.error(`[StudyService] UNDEFINED found at: ${path}`);
      return;
    }
    
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
      return;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.checkForUndefined(item, `${path}[${index}]`);
      });
    } else {
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value === undefined) {
          console.error(`[StudyService] UNDEFINED found at: ${path}.${key}`);
        } else {
          this.checkForUndefined(value, `${path}.${key}`);
        }
      });
    }
  }

  // ============================================================================
  // Study CRUD Operations
  // ============================================================================

  async createStudy(studyData: Partial<Study>): Promise<Study> {
    console.log('[StudyService] createStudy() method called');
    
    try {
      // Get current user
      const currentUser = await firstValueFrom(this.authService.user$);
      console.log('[StudyService] Current user:', currentUser?.uid, currentUser?.email);
      
      if (currentUser) {
        const tokenResult = await currentUser.getIdTokenResult();
        console.log('[StudyService] User custom claims:', tokenResult?.claims);
        console.log('[StudyService] User role from claims:', tokenResult?.claims?.['role']);
        console.log('[StudyService] User accessLevel from claims:', tokenResult?.claims?.['accessLevel']);
      }
      
      if (!currentUser) {
        console.error('[StudyService] No authenticated user');
        throw new Error('User must be authenticated to create a study');
      }

      const now = new Date();
      
      // Generate IDs upfront
      const studyRef = doc(collection(this.firestore, 'studies'));
      const studyId = studyRef.id;
      console.log('[StudyService] Generated study ID:', studyId);
      
      // Prepare phase references and IDs
      const phaseRefs: any[] = [];
      const phaseIds: string[] = [];
      
      if (studyData.sections && studyData.sections.length > 0) {
        for (const section of studyData.sections) {
          const phaseRef = doc(collection(this.firestore, 'phases'));
          phaseRefs.push({ ref: phaseRef, section });
          phaseIds.push(phaseRef.id);
        }
        console.log('[StudyService] Generated', phaseIds.length, 'phase IDs');
      }
    
      // Prepare the study object with phase IDs
      console.log('[StudyService] Preparing study object...');
      const study: Study = {
        ...studyData,
        id: studyId,
        protocolNumber: studyData.protocolNumber || '',
        title: studyData.title || '',
        phaseIds: phaseIds,  // Include phase IDs from the start
        createdBy: currentUser.uid,
        createdAt: now,
        lastModifiedAt: now,
        lastModifiedBy: currentUser.uid,
        changeHistory: [{
          id: this.generateId(),
          timestamp: now,
          userId: currentUser.uid,
          userEmail: currentUser.email || 'unknown',
          action: 'created',
          changes: {
            description: 'Study created'
          }
        }]
      } as Study;
      
      console.log('[StudyService] Study object prepared:', study);
      
      // Clean the study object to remove undefined fields
      console.log('[StudyService] Cleaning study object...');
      const cleanedStudy = this.removeUndefinedFields(study);
      console.log('[StudyService] Study cleaned');
      
      // Start atomic batch write
      console.log('[StudyService] Starting atomic batch write...');
      const batch = writeBatch(this.firestore);
      
      // Add study document to batch
      console.log('[StudyService] Adding study document to batch...');
      const studyDocRef = doc(this.firestore, 'studies', studyId);
      batch.set(studyDocRef, cleanedStudy);
      
      // Add phase documents to batch
      const phases = studyData.phases || [];
      console.log(`[StudyService] Adding ${phases.length} phase documents to batch...`);
      phases.forEach((phase: any) => {
        const phaseRef = doc(collection(this.firestore, 'studyPhases'));
        const phaseId = phaseRef.id;
        phaseIds.push(phaseId);
        
        const phaseData = {
          ...phase,
          id: phaseId,
          studyId: studyId,
          createdAt: now,
          updatedAt: now,
          createdBy: currentUser.uid,
          updatedBy: currentUser.uid
        };
        
        const cleanedPhase = this.removeUndefinedFields(phaseData);
        batch.set(phaseRef, cleanedPhase);
        console.log(`[StudyService] Added phase to batch: ${phase.name} with ID: ${phaseId}`);
      });
      
      // Commit the batch
      console.log('[StudyService] Committing atomic batch write...');
      await batch.commit();
      console.log('[StudyService] ✅ Study and phases created successfully');
      
      // Log audit event
      console.log('[StudyService] Logging audit event...');
      try {
        await this.auditService.logAuditEvent({
          action: 'STUDY_CREATED',
          resourceType: 'study',
          resourceId: studyId,
          details: JSON.stringify({
            studyTitle: study.title,
            protocolNumber: study.protocolNumber,
            phaseCount: phases.length
          }),
          userId: currentUser.uid,
          userEmail: currentUser.email || 'unknown',
          timestamp: now,
          severity: 'INFO'
        });
        console.log('[StudyService] ✅ Audit event logged');
      } catch (auditError) {
        console.error('[StudyService] Failed to log audit event:', auditError);
        // Don't fail the creation if audit logging fails
      }
      
      // Return the created study with ID and phase IDs
      const createdStudy = { ...cleanedStudy, id: studyId, phaseIds } as Study;
      console.log('[StudyService] Returning created study:', createdStudy);
      return createdStudy;
      
    } catch (error) {
      console.error('[StudyService] Error creating study:', error);
      throw error;
    }
  }

  async getStudy(studyId: string): Promise<Study | null> {
    return await runInInjectionContext(this.injector, async () => {
      const studyRef = doc(this.firestore, 'studies', studyId);
      const studyDoc = await getDoc(studyRef);
      
      if (!studyDoc.exists()) {
        return null;
      }

      return this.deserializeStudyData({ id: studyDoc.id, ...studyDoc.data() } as any);
    });
  }

  async updateStudy(studyId: string, updates: Partial<Study>, reason?: string): Promise<Study> {
    return await runInInjectionContext(this.injector, async () => {
      // Get current user through observable (synchronous access)
      const currentUser = this.authService.isAuthenticated$ ? await firstValueFrom(this.authService.user$) : null;
      if (!currentUser) {
        throw new Error('User must be authenticated to update studies');
      }

      const studyRef = doc(this.firestore, 'studies', studyId);
      const existingStudy = await this.getStudy(studyId);
      
      if (!existingStudy) {
        throw new Error('Study not found');
      }

      const now = new Date();
      const changeRecord: StudyChange = {
        id: this.generateId(),
        timestamp: now,
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        action: 'modified',
        changes: updates,
        reason: reason || 'Study updated',
        ipAddress: await this.getClientIpAddress(),
        userAgent: navigator.userAgent
      };

      const updatedData = {
        ...updates,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp(),
        changeHistory: [...existingStudy.changeHistory, changeRecord]
      };

      await updateDoc(studyRef, this.serializeStudyData(updatedData));
      
      // Log audit event
      await this.auditService.logAuditEvent({
        action: 'study_updated',
        resourceType: 'study',
        resourceId: studyId,
        userId: currentUser.uid,
        details: JSON.stringify({
          changes: updates,
          reason: reason
        })
      });

      return { ...existingStudy, ...updates, lastModifiedBy: currentUser.uid, lastModifiedAt: now };
    });
  }

  async deleteStudy(studyId: string, reason: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      // Get current user through observable (synchronous access)
      const currentUser = this.authService.isAuthenticated$ ? await firstValueFrom(this.authService.user$) : null;
      if (!currentUser) {
        throw new Error('User must be authenticated to delete studies');
      }

      // Get all patient references from the study's subcollection
      const studyPatientsRef = collection(this.firestore, `studies/${studyId}/patients`);
      const studyPatientsSnapshot = await getDocs(studyPatientsRef);
      
      // Start a batch operation for all deletions
      const batch = writeBatch(this.firestore);
      
      // Delete all patient references and actual patient documents
      for (const docSnapshot of studyPatientsSnapshot.docs) {
        const patientRef = docSnapshot.data() as { patientId: string };
        
        // Delete the patient reference from the study subcollection
        batch.delete(docSnapshot.ref);
        
        // Delete the actual patient document
        const patientDoc = doc(this.firestore, 'patients', patientRef.patientId);
        batch.delete(patientDoc);
        
        // Also delete patient's visitSubcomponents subcollection
        const visitSubcomponentsRef = collection(this.firestore, `patients/${patientRef.patientId}/visitSubcomponents`);
        const visitSubcomponentsSnapshot = await getDocs(visitSubcomponentsRef);
        
        for (const visitDoc of visitSubcomponentsSnapshot.docs) {
          batch.delete(visitDoc.ref);
          
          // Delete formInstances under each visit subcomponent
          const formInstancesRef = collection(this.firestore, `patients/${patientRef.patientId}/visitSubcomponents/${visitDoc.id}/formInstances`);
          const formInstancesSnapshot = await getDocs(formInstancesRef);
          
          for (const formDoc of formInstancesSnapshot.docs) {
            batch.delete(formDoc.ref);
          }
        }
      }

      // Delete any study sections/phases
      const sectionsQuery = query(
        collection(this.firestore, 'studySections'),
        where('studyId', '==', studyId)
      );
      const sectionsSnapshot = await getDocs(sectionsQuery);
      
      sectionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete the study document itself
      const studyRef = doc(this.firestore, 'studies', studyId);
      batch.delete(studyRef);
      
      await batch.commit();

      // Log audit event
      await this.auditService.logAuditEvent({
        action: 'study_deleted',
        resourceType: 'study',
        resourceId: studyId,
        userId: currentUser.uid,
        details: JSON.stringify({ 
          reason,
          patientsDeleted: studyPatientsSnapshot.size,
          sectionsDeleted: sectionsSnapshot.size
        })
      });
    });
  }

  /**
   * Delete a study and all associated patients (cascade delete)
   * This is a destructive operation that permanently removes the study and all patient data
   */
  async deleteStudyWithPatients(studyId: string, reason: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      // Get current user through observable (synchronous access)
      const currentUser = this.authService.isAuthenticated$ ? await firstValueFrom(this.authService.user$) : null;
      if (!currentUser) {
        throw new Error('User must be authenticated to delete studies');
      }

      // Get the study first to ensure it exists
      const study = await this.getStudy(studyId);
      if (!study) {
        throw new Error('Study not found');
      }

      // Get all patients enrolled in this study
      const patients = await this.getStudyPatients(studyId);
      
      // Use a batch to ensure atomic operation
      const batch = writeBatch(this.firestore);
      
      // Delete all patients associated with the study
      for (const patient of patients) {
        if (patient.id) {
          const patientRef = doc(this.firestore, 'patients', patient.id);
          batch.delete(patientRef);
          
          // Also delete patient's visitSubcomponents subcollection
          const visitSubcomponentsRef = collection(this.firestore, `patients/${patient.id}/visitSubcomponents`);
          const visitSubcomponentsSnapshot = await getDocs(visitSubcomponentsRef);
          visitSubcomponentsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          // Log audit event for each patient deletion
          await this.auditService.logAuditEvent({
            action: 'patient_deleted_with_study',
            resourceType: 'patient',
            resourceId: patient.id,
            userId: currentUser.uid,
            details: JSON.stringify({ 
              studyId: studyId,
              reason: `Deleted with study: ${reason}`,
              patientIdentifier: patient.identifier
            })
          });
        }
      }
      
      // Delete all studyPhases associated with the study
      const studyPhasesRef = collection(this.firestore, 'studyPhases');
      const studyPhasesQuery = query(studyPhasesRef, where('studyId', '==', studyId));
      const studyPhasesSnapshot = await getDocs(studyPhasesQuery);
      
      studyPhasesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete all study sections
      const sectionsRef = collection(this.firestore, 'study-sections');
      const sectionsQuery = query(sectionsRef, where('studyId', '==', studyId));
      const sectionsSnapshot = await getDocs(sectionsQuery);
      
      sectionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete all substudies
      const substudiesRef = collection(this.firestore, 'substudies');
      const substudiesQuery = query(substudiesRef, where('studyId', '==', studyId));
      const substudiesSnapshot = await getDocs(substudiesQuery);
      
      substudiesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete all study groups
      const groupsRef = collection(this.firestore, 'study-groups');
      const groupsQuery = query(groupsRef, where('studyId', '==', studyId));
      const groupsSnapshot = await getDocs(groupsQuery);
      
      groupsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete all form instances for this study
      const formInstancesRef = collection(this.firestore, 'study-form-instances');
      const formInstancesQuery = query(formInstancesRef, where('studyId', '==', studyId));
      const formInstancesSnapshot = await getDocs(formInstancesQuery);
      
      formInstancesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Finally, delete the study itself
      const studyRef = doc(this.firestore, 'studies', studyId);
      batch.delete(studyRef);
      
      // Commit the batch
      await batch.commit();
      
      console.log(`Successfully deleted study ${studyId} with ${patients.length} patients and ${studyPhasesSnapshot.size} phases`);
            // Log audit event for study deletion
      await this.auditService.logAuditEvent({
        action: 'study_deleted_with_patients',
        resourceType: 'study',
        resourceId: studyId,
        userId: currentUser.uid,
        details: JSON.stringify({ 
          reason,
          patientsDeleted: patients.length,
          studyTitle: study.title,
          protocolNumber: study.protocolNumber
        })
      });
    });
  }

  // ============================================================================
  // Study List Operations
  // ============================================================================

  getStudies(): Observable<Study[]> {
    return this.studiesSubject.asObservable();
  }

  getStudySummaries(): Observable<StudySummary[]> {
    return this.getStudies().pipe(
      map(studies => studies.map(study => this.createStudySummary(study)))
    );
  }

  getStudiesByStatus(status: string): Observable<Study[]> {
    return this.getStudies().pipe(
      map(studies => studies.filter(study => study.status === status))
    );
  }

  getStudiesByPhase(phase: string): Observable<Study[]> {
    return this.getStudies().pipe(
      map(studies => studies.filter(study => study.phase === phase))
    );
  }

  // ============================================================================
  // Study Section Management
  // ============================================================================

  async createStudySection(studyId: string, sectionData: Omit<StudySection, 'id' | 'studyId'>): Promise<StudySection> {
    return await runInInjectionContext(this.injector, async () => {
      const sectionsRef = collection(this.firestore, 'study-sections');
      const section: Omit<StudySection, 'id'> = {
        ...sectionData,
        studyId: studyId
      };

      const docRef = await addDoc(sectionsRef, section);
      return { ...section, id: docRef.id };
    });
  }

  async getStudySections(studyId: string): Promise<StudySection[]> {
    return await runInInjectionContext(this.injector, async () => {
      const sectionsRef = collection(this.firestore, 'study-sections');
      const q = query(sectionsRef, where('studyId', '==', studyId), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as StudySection));
    });
  }

  async updateStudySection(sectionId: string, updates: Partial<StudySection>, reason?: string): Promise<StudySection> {
    return await runInInjectionContext(this.injector, async () => {
      const sectionRef = doc(this.firestore, 'study-sections', sectionId);
      await updateDoc(sectionRef, updates);
      
      const updatedDoc = await getDoc(sectionRef);
      return { id: updatedDoc.id, ...updatedDoc.data() } as StudySection;
    });
  }

  async deleteStudySection(sectionId: string, reason: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const sectionRef = doc(this.firestore, 'study-sections', sectionId);
      await deleteDoc(sectionRef);
    });
  }

  async reorderStudySections(studyId: string, sectionIds: string[]): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const batch = writeBatch(this.firestore);
      
      sectionIds.forEach((sectionId, index) => {
        const sectionRef = doc(this.firestore, 'study-sections', sectionId);
        batch.update(sectionRef, { order: index + 1 });
      });

      await batch.commit();
    });
  }

  // Continue with remaining methods...
  // Due to token limits, I'll create this in parts

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private initializeRealtimeListeners(): void {
    // Initialize real-time listeners for studies and care indicators
    const studiesRef = collection(this.firestore, 'studies');
    onSnapshot(studiesRef, (snapshot) => {
      const studies = snapshot.docs.map(doc => 
        this.deserializeStudyData({ id: doc.id, ...doc.data() } as any)
      );
      this.studiesSubject.next(studies);
    });

    const careIndicatorsRef = collection(this.firestore, 'care-indicators');
    onSnapshot(careIndicatorsRef, (snapshot) => {
      const indicators = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CareIndicator));
      this.careIndicatorsSubject.next(indicators);
    });
  }

  // ============================================================================
  // Form Instance Management
  // ============================================================================

  async createFormInstance(formInstanceData: Omit<StudyFormInstance, 'id' | 'changeHistory'>): Promise<StudyFormInstance> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) throw new Error('User must be authenticated');

      const now = new Date();
      const formInstance: Omit<StudyFormInstance, 'id'> = {
        ...formInstanceData,
        lastModifiedDate: now,
        filledBy: currentUser.uid,
        changeHistory: [{
          id: this.generateId(),
          timestamp: now,
          userId: currentUser.uid,
          userEmail: currentUser.email || 'unknown',
          action: 'created',
          reason: 'Form instance created'
        }]
      };

      const instanceRef = doc(collection(this.firestore, 'study-form-instances'));
      await setDoc(instanceRef, formInstance);

      const createdInstance: StudyFormInstance = { id: instanceRef.id, ...formInstance };
      
      // Update local state
      const currentInstances = this.formInstancesSubject.value;
      this.formInstancesSubject.next([...currentInstances, createdInstance]);

      return createdInstance;
    });
  }

  async getFormInstancesBySection(sectionId: string): Promise<StudyFormInstance[]> {
    return await runInInjectionContext(this.injector, async () => {
      const instancesRef = collection(this.firestore, 'study-form-instances');
      const q = query(instancesRef, where('sectionId', '==', sectionId));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as StudyFormInstance));
    });
  }

  async updateFormInstance(instanceId: string, formData: { [key: string]: any }, reason?: string): Promise<StudyFormInstance> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) throw new Error('User must be authenticated');

      const instanceRef = doc(this.firestore, 'study-form-instances', instanceId);
      const instanceDoc = await getDoc(instanceRef);
      
      if (!instanceDoc.exists()) {
        throw new Error('Form instance not found');
      }

      const existingInstance = instanceDoc.data() as StudyFormInstance;
      const now = new Date();
      
      // Calculate completion percentage
      const totalFields = Object.keys(formData).length;
      const completedFields = Object.values(formData).filter(value => 
        value !== null && value !== undefined && value !== ''
      ).length;
      const completionPercentage = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
      
      // Determine status based on completion
      let status: StudyFormInstanceStatus = 'in_progress';
      if (completionPercentage === 100) {
        status = 'completed';
      } else if (completionPercentage === 0) {
        status = 'not_started';
      }

      const updateData = {
        formData,
        completionPercentage,
        status,
        lastModifiedDate: now,
        changeHistory: [
          ...existingInstance.changeHistory,
          {
            id: this.generateId(),
            timestamp: now,
            userId: currentUser.uid,
            userEmail: currentUser.email || 'unknown',
            action: 'modified' as const,
            fieldChanges: this.calculateFieldChanges(existingInstance.formData, formData),
            reason: reason || 'Form data updated'
          }
        ]
      };
      
      await updateDoc(instanceRef, updateData);
      
      const updatedDoc = await getDoc(instanceRef);
      const updatedInstance = { id: updatedDoc.id, ...updatedDoc.data() } as StudyFormInstance;
      
      // Update local state
      const currentInstances = this.formInstancesSubject.value;
      const updatedInstances = currentInstances.map(i => 
        i.id === instanceId ? updatedInstance : i
      );
      this.formInstancesSubject.next(updatedInstances);
      
      return updatedInstance;
    });
  }

  async completeFormInstance(instanceId: string): Promise<StudyFormInstance> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) throw new Error('User must be authenticated');

      const instanceRef = doc(this.firestore, 'study-form-instances', instanceId);
      const now = new Date();
      
      const updateData = {
        status: 'completed' as StudyFormInstanceStatus,
        completedDate: now,
        lastModifiedDate: now
      };
      
      await updateDoc(instanceRef, updateData);
      
      const updatedDoc = await getDoc(instanceRef);
      return { id: updatedDoc.id, ...updatedDoc.data() } as StudyFormInstance;
    });
  }

  // ============================================================================
  // Section Completion Management
  // ============================================================================

  async updateSectionStatus(sectionId: string, status: SectionCompletionStatus, reason?: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) throw new Error('User must be authenticated');

      const sectionRef = doc(this.firestore, 'study-sections', sectionId);
      const updateData = {
        status,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: new Date()
      };
      
      await updateDoc(sectionRef, updateData);
      
      // Log audit event
      await this.auditService.logAuditEvent({
        action: 'section_status_updated',
        resourceType: 'study_section',
        resourceId: sectionId,
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        severity: 'INFO' as const,
        details: JSON.stringify({
          newStatus: status,
          reason: reason || 'Section status updated'
        })
      });
    });
  }

  async getSectionProgress(sectionId: string): Promise<{
    totalForms: number;
    completedForms: number;
    inProgressForms: number;
    overdueForms: number;
    completionPercentage: number;
  }> {
    const formInstances = await this.getFormInstancesBySection(sectionId);
    
    const totalForms = formInstances.length;
    const completedForms = formInstances.filter(f => f.status === 'completed').length;
    const inProgressForms = formInstances.filter(f => f.status === 'in_progress').length;
    const overdueForms = formInstances.filter(f => 
      f.dueDate && new Date() > f.dueDate && f.status !== 'completed'
    ).length;
    const completionPercentage = totalForms > 0 ? (completedForms / totalForms) * 100 : 0;
    
    return {
      totalForms,
      completedForms,
      inProgressForms,
      overdueForms,
      completionPercentage
    };
  }

  // ============================================================================
  // Data Query Management
  // ============================================================================

  async createDataQuery(queryData: Omit<DataQuery, 'id' | 'createdAt'>): Promise<DataQuery> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) throw new Error('User must be authenticated');

      const dataQuery: Omit<DataQuery, 'id'> = {
        ...queryData,
        createdBy: currentUser.uid,
        createdAt: new Date()
      };

      const queryRef = doc(collection(this.firestore, 'data-queries'));
      await setDoc(queryRef, dataQuery);

      const createdQuery: DataQuery = { id: queryRef.id, ...dataQuery };
      
      // Update local state
      const currentQueries = this.dataQueriesSubject.value;
      this.dataQueriesSubject.next([...currentQueries, createdQuery]);

      return createdQuery;
    });
  }

  async resolveDataQuery(queryId: string, resolution: string): Promise<DataQuery> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) throw new Error('User must be authenticated');

      const queryRef = doc(this.firestore, 'data-queries', queryId);
      const updateData = {
        status: 'resolved' as const,
        resolvedBy: currentUser.uid,
        resolvedAt: new Date(),
        resolutionNotes: resolution
      };
      
      await updateDoc(queryRef, updateData);
      
      const updatedDoc = await getDoc(queryRef);
      const updatedQuery = { id: updatedDoc.id, ...updatedDoc.data() } as DataQuery;
      
      // Update local state
      const currentQueries = this.dataQueriesSubject.value;
      const updatedQueries = currentQueries.map(q => 
        q.id === queryId ? updatedQuery : q
      );
      this.dataQueriesSubject.next(updatedQueries);
      
      return updatedQuery;
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateFieldChanges(oldData: { [key: string]: any }, newData: { [key: string]: any }): { [fieldId: string]: { oldValue: any; newValue: any } } {
    const changes: { [fieldId: string]: { oldValue: any; newValue: any } } = {};
    
    // Check for changed fields
    Object.keys(newData).forEach(fieldId => {
      if (oldData[fieldId] !== newData[fieldId]) {
        changes[fieldId] = {
          oldValue: oldData[fieldId],
          newValue: newData[fieldId]
        };
      }
    });
    
    // Check for removed fields
    Object.keys(oldData).forEach(fieldId => {
      if (!(fieldId in newData)) {
        changes[fieldId] = {
          oldValue: oldData[fieldId],
          newValue: null
        };
      }
    });
    
    return changes;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
  
  // Extract template IDs from form templates array
  private extractTemplateIds(templates: any[]): string[] {
    if (!templates || !Array.isArray(templates)) {
      return [];
    }
    
    // Handle both string IDs and objects with templateId/id properties
    return templates
      .map((template: any) => {
        if (typeof template === 'string') {
          return template;
        }
        return template.templateId || template.id || '';
      })
      .filter(id => id !== '');
  }

  /**
   * Extract template assignments from form templates array
   */
  private extractTemplateAssignments(templates: any[]): any[] {
    if (!templates || !Array.isArray(templates)) return [];
    
    return templates.map((template: any, index: number) => {
      if (typeof template === 'string') {
        return {
          templateId: template,
          templateName: `Template ${index + 1}`,
          templateVersion: '1.0',
          isRequired: true,
          order: index
        };
      }
      return {
        templateId: template.templateId || template.id || template,
        templateName: template.templateName || template.name || `Template ${index + 1}`,
        templateVersion: template.templateVersion || template.version || '1.0',
        isRequired: template.isRequired !== false,
        order: template.order || index,
        name: template.name || template.templateName || '',
        description: template.description || ''
      };
    });
  }

  private async getClientIpAddress(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }

  private serializeStudyData(data: any): any {
    // Convert dates to Firestore timestamps
    const serialized = { ...data };
    
    // Handle all date fields
    if (serialized.createdAt instanceof Date) {
      serialized.createdAt = Timestamp.fromDate(serialized.createdAt);
    }
    if (serialized.lastModifiedAt instanceof Date) {
      serialized.lastModifiedAt = Timestamp.fromDate(serialized.lastModifiedAt);
    }
    if (serialized.plannedStartDate instanceof Date) {
      serialized.plannedStartDate = Timestamp.fromDate(serialized.plannedStartDate);
    } else if (serialized.plannedStartDate === undefined || serialized.plannedStartDate === null || serialized.plannedStartDate === '') {
      // Remove undefined/null/empty date fields to avoid Firestore errors
      delete serialized.plannedStartDate;
    }
    if (serialized.plannedEndDate instanceof Date) {
      serialized.plannedEndDate = Timestamp.fromDate(serialized.plannedEndDate);
    } else if (serialized.plannedEndDate === undefined || serialized.plannedEndDate === null || serialized.plannedEndDate === '') {
      // Remove undefined/null/empty date fields to avoid Firestore errors
      delete serialized.plannedEndDate;
    }
    
    return serialized;
  }

  private deserializeStudyData(data: any): Study {
    // Convert Firestore timestamps to dates
    const deserialized = { ...data };
    if (deserialized.createdAt?.toDate) {
      deserialized.createdAt = deserialized.createdAt.toDate();
    }
    if (deserialized.lastModifiedAt?.toDate) {
      deserialized.lastModifiedAt = deserialized.lastModifiedAt.toDate();
    }
    return deserialized as Study;
  }

  private serializeEnrollmentData(data: any): any {
    const serialized = { ...data };
    if (serialized.enrollmentDate instanceof Date) {
      serialized.enrollmentDate = Timestamp.fromDate(serialized.enrollmentDate);
    }
    if (serialized.lastModifiedAt instanceof Date) {
      serialized.lastModifiedAt = Timestamp.fromDate(serialized.lastModifiedAt);
    }
    return serialized;
  }

  private deserializeEnrollmentData(data: any): PatientStudyEnrollment {
    const deserialized = { ...data };
    if (deserialized.enrollmentDate?.toDate) {
      deserialized.enrollmentDate = deserialized.enrollmentDate.toDate();
    }
    if (deserialized.lastModifiedAt?.toDate) {
      deserialized.lastModifiedAt = deserialized.lastModifiedAt.toDate();
    }
    return deserialized as PatientStudyEnrollment;
  }

  private createStudySummary(study: Study): StudySummary {
    return {
      id: study.id!,
      protocolNumber: study.protocolNumber,
      title: study.title,
      shortTitle: study.shortTitle,
      phase: study.phase,
      status: study.status,
      plannedEnrollment: study.plannedEnrollment,
      actualEnrollment: study.actualEnrollment,
      enrollmentPercentage: study.plannedEnrollment > 0 ? 
        (study.actualEnrollment / study.plannedEnrollment) * 100 : 0,
      plannedStartDate: study.plannedStartDate,
      actualStartDate: study.actualStartDate,
      plannedEndDate: study.plannedEndDate,
      totalCareIndicators: 0, // TODO: Calculate from care indicators
      criticalIndicators: 0,
      highPriorityIndicators: 0,
      overdueItems: 0,
      lastActivity: study.lastModifiedAt,
      totalSections: study.phaseIds ? study.phaseIds.length : 0,
      completedSections: 0, // TODO: Calculate from enrollments
      totalForms: 0, // TODO: Calculate from studyPhases collection
      completedForms: 0 // TODO: Calculate from form instances
    };
  }

  private async getCareIndicatorsByStudy(studyId: string): Promise<CareIndicator[]> {
    return await runInInjectionContext(this.injector, async () => {
      const indicatorsRef = collection(this.firestore, 'care-indicators');
      const q = query(indicatorsRef, where('studyId', '==', studyId));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CareIndicator));
    });
  }

  private getDefaultPermissions(): StudyPermissions {
    return {
      canView: false,
      canEdit: false,
      canCreate: false,
      canDelete: false,
      canEnrollPatients: false,
      canLockStudy: false,
      canViewPHI: false,
      canManageSites: false,
      canGenerateReports: false,
      requiredAccessLevel: AccessLevel.SUPER_ADMIN
    };
  }

  // Placeholder implementations for interface compliance
  async getStudySectionSummaries(studyId: string): Promise<StudySectionSummary[]> {
    return [];
  }

  async enrollPatient(enrollmentData: Omit<PatientStudyEnrollment, 'id' | 'changeHistory'>): Promise<PatientStudyEnrollment> {
    throw new Error('Method not implemented');
  }

  async getPatientEnrollment(studyId: string, patientId: string): Promise<PatientStudyEnrollment | null> {
    return null;
  }

  async updatePatientEnrollment(enrollmentId: string, updates: Partial<PatientStudyEnrollment>, reason?: string): Promise<PatientStudyEnrollment> {
    throw new Error('Method not implemented');
  }

  async withdrawPatient(enrollmentId: string, reason: string): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getPatientsByStudy(studyId: string): Promise<PatientStudyEnrollment[]> {
    // For now, return empty array since we're handling patient deletion directly in deleteStudy
    // This method needs to be properly implemented when displaying patient enrollments
    return [];
  }

  async updatePatientProgress(enrollmentId: string, sectionId: string, status: 'in_progress' | 'completed'): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getPatientProgress(enrollmentId: string): Promise<{ completed: string[], inProgress: string[], overdue: string[] }> {
    return { completed: [], inProgress: [], overdue: [] };
  }

  getCareIndicators(filters?: { studyId?: string, patientId?: string, severity?: string }): Observable<CareIndicator[]> {
    return this.careIndicatorsSubject.asObservable();
  }

  async createCareIndicator(indicatorData: Omit<CareIndicator, 'id' | 'createdAt'>): Promise<CareIndicator> {
    throw new Error('Method not implemented');
  }

  async updateCareIndicator(indicatorId: string, updates: Partial<CareIndicator>): Promise<CareIndicator> {
    throw new Error('Method not implemented');
  }

  async resolveCareIndicator(indicatorId: string, resolutionNotes: string): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getStudyStatistics(studyId: string): Promise<StudyStatistics> {
    throw new Error('Method not implemented');
  }

  async getEnrollmentStatistics(studyId: string): Promise<EnrollmentStatistics> {
    throw new Error('Method not implemented');
  }

  async getCompletionStatistics(studyId: string): Promise<CompletionStatistics> {
    throw new Error('Method not implemented');
  }

  async getStudyConfiguration(studyId: string): Promise<StudyConfiguration> {
    throw new Error('Method not implemented');
  }

  async updateStudyConfiguration(studyId: string, config: StudyConfiguration): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getStudyPermissions(studyId: string, userId: string): Promise<StudyPermissions> {
    return this.getDefaultPermissions();
  }

  async checkPermission(studyId: string, userId: string, action: string): Promise<boolean> {
    return false;
  }

  async getStudyChangeHistory(studyId: string): Promise<StudyChange[]> {
    return [];
  }

  async getPatientEnrollmentHistory(enrollmentId: string): Promise<PatientEnrollmentChange[]> {
    return [];
  }

  async generateAuditReport(studyId: string, fromDate: Date, toDate: Date): Promise<AuditReport> {
    throw new Error('Method not implemented');
  }

  async exportStudyData(studyId: string, format: 'json' | 'csv' | 'xml'): Promise<Blob> {
    throw new Error('Method not implemented');
  }

  async importStudyData(studyId: string, data: any, format: 'json' | 'csv' | 'xml'): Promise<ImportResult> {
    throw new Error('Method not implemented');
  }

  async lockStudy(studyId: string, reason: string): Promise<void> {
    throw new Error('Method not implemented');
  }

  async unlockStudy(studyId: string, reason: string): Promise<void> {
    throw new Error('Method not implemented');
  }

  async archiveStudy(studyId: string, reason: string): Promise<void> {
    throw new Error('Method not implemented');
  }

  // ============================================================================
  // Patient Management Methods
  // ============================================================================

  /**
   * Get all patients for a study by their IDs
   */
  async getStudyPatients(studyId: string): Promise<any[]> {
    const study = await this.getStudy(studyId);
    if (!study || !study.patientIds || study.patientIds.length === 0) {
      return [];
    }

    return await runInInjectionContext(this.injector, async () => {
      const patients: any[] = [];
      const patientsRef = collection(this.firestore, 'patients');
      
      // Get patients in batches (Firestore 'in' query limit is 10)
      const batches = [];
      for (let i = 0; i < study.patientIds.length; i += 10) {
        const batch = study.patientIds.slice(i, i + 10);
        const q = query(patientsRef, where('id', 'in', batch));
        batches.push(getDocs(q));
      }
      
      const results = await Promise.all(batches);
      results.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          patients.push({ id: doc.id, ...doc.data() });
        });
      });
      
      return patients;
    });
  }

  /**
   * Add a patient to a study
   */
  async addPatientToStudy(studyId: string, patientId: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) {
        throw new Error('User must be authenticated to add patients to studies');
      }

      // Update study with new patient ID
      const studyRef = doc(this.firestore, 'studies', studyId);
      const studyDoc = await getDoc(studyRef);
      
      if (!studyDoc.exists()) {
        throw new Error('Study not found');
      }

      const studyData = studyDoc.data() as Study;
      const currentPatientIds = studyData.patientIds || [];
      
      // Check if patient is already in study
      if (currentPatientIds.includes(patientId)) {
        console.warn(`Patient ${patientId} is already enrolled in study ${studyId}`);
        return;
      }

      // Add patient to study's patient list
      const updatedPatientIds = [...currentPatientIds, patientId];
      await updateDoc(studyRef, {
        patientIds: updatedPatientIds,
        actualEnrollment: updatedPatientIds.length,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });

      // Create patient phases using study-phase service
      const phasesQuery = query(
        collection(this.firestore, 'studyPhases'),
        where('studyId', '==', studyId)
      );
      const phasesSnapshot = await getDocs(phasesQuery);
      const phases = phasesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      // Use study-phase service to create patient phases
      if (phases.length > 0) {
        await this.studyPhaseService.createPatientPhaseFolders(
          patientId,
          studyId,
          phases
        );
      }

      // Update patient with study ID
      const patientRef = doc(this.firestore, 'patients', patientId);
      await updateDoc(patientRef, {
        studyId: studyId,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });

      // Log audit event
      await this.auditService.logAuditEvent({
        action: 'patient_added_to_study',
        resourceType: 'study',
        resourceId: studyId,
        userId: currentUser.uid,
        details: JSON.stringify({
          patientId,
          studyId,
          newEnrollmentCount: updatedPatientIds.length
        })
      });
    });
  }

  /**
   * @deprecated Use StudyPhaseService.createPatientPhaseFolders instead
   * This method is kept for backward compatibility only
   */
  private async createPatientVisitSubcomponents(
    study: Study,
    patientId: string,
    userId: string
  ): Promise<any[]> {
    const now = new Date();
    const visitSubcomponents: any[] = [];

    // Load phases from studyPhases collection
    if (study.phaseIds && Array.isArray(study.phaseIds) && study.phaseIds.length > 0) {
      const phasesQuery = query(
        collection(this.firestore, 'studyPhases'),
        where('studyId', '==', study.id)
      );
      const phasesSnapshot = await getDocs(phasesQuery);
      const phases = phasesSnapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          ...data
        };
      }).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

      for (const phase of phases as any[]) {
        try {
          // Extract template information safely
          const templateIds: string[] = [];
          const requiredTemplateIds: string[] = [];
          const optionalTemplateIds: string[] = [];
          const formTemplates: any[] = [];
          
          if (phase.formTemplates && Array.isArray(phase.formTemplates)) {
            for (const template of phase.formTemplates) {
              try {
                // Copy the entire template object for the patient
                const patientTemplate = {
                  templateId: template.templateId,
                  templateName: template.templateName,
                  templateVersion: template.templateVersion || '1.0',
                  order: template.order || 0,
                  isRequired: template.isRequired || false,
                  completionRequired: template.completionRequired || false,
                  signatureRequired: template.signatureRequired || false,
                  reviewRequired: template.reviewRequired || false,
                  daysToComplete: template.daysToComplete,
                  showConditions: template.showConditions,
                  requiredConditions: template.requiredConditions,
                  applicableGroups: template.applicableGroups,
                  customAttributes: template.customAttributes || {}
                };
                
                formTemplates.push(patientTemplate);
                templateIds.push(template.templateId);
                
                if (template.isRequired || template.completionRequired) {
                  requiredTemplateIds.push(template.templateId);
                } else {
                  optionalTemplateIds.push(template.templateId);
                }
              } catch (templateError) {
                console.error(`Error processing template in phase ${phase.phaseName || phase.name}:`, templateError);
                // Continue with other templates even if one fails
              }
            }
          }
          
          // Create the visit subcomponent even if templates had issues
          const visitSubcomponent = {
            id: this.generateId(),
            patientId: patientId,
            studyId: study.id || '',
            name: phase.phaseName || phase.name,
            description: phase.description || '',
            type: phase.type || 'treatment',
            order: phase.order,
            phaseId: phase.id,
            phaseCode: `PHASE_${phase.order}`,
            isPhaseFolder: true,
            
            // Calculate visit window dates based on enrollment date and scheduled day
            scheduledDate: phase.scheduledDay ? 
              new Date(now.getTime() + (phase.scheduledDay * 24 * 60 * 60 * 1000)) : 
              undefined,
            windowStartDate: phase.windowStart !== undefined ? 
              new Date(now.getTime() + (phase.windowStart * 24 * 60 * 60 * 1000)) : 
              undefined,
            windowEndDate: phase.windowEnd !== undefined ? 
              new Date(now.getTime() + (phase.windowEnd * 24 * 60 * 60 * 1000)) : 
              undefined,
            
            // Initial status
            status: 'scheduled' as const,
            completionPercentage: 0,
            
            // Store both template IDs and full template objects
            templateIds: templateIds,
            requiredTemplateIds: requiredTemplateIds,
            optionalTemplateIds: optionalTemplateIds,
            formTemplates: formTemplates, // Store full template objects
            completedTemplates: [],
            inProgressTemplates: [],
            
            // Phase progression
            canProgressToNextPhase: false,
            blockingTemplates: requiredTemplateIds, // Only required templates block progression
            
            // Metadata
            createdBy: userId,
            createdAt: now,
            lastModifiedBy: userId,
            lastModifiedAt: now
          };
          
          visitSubcomponents.push(visitSubcomponent);
        } catch (phaseError) {
          console.error(`Error processing phase ${phase.phaseName || phase.name}:`, phaseError);
          // Still create a basic visit subcomponent even if there's an error
          const fallbackVisitSubcomponent = {
            id: this.generateId(),
            patientId: patientId,
            studyId: study.id || '',
            name: phase.phaseName || phase.name || 'Unknown Phase',
            description: phase.description || '',
            type: phase.type || 'treatment',
            order: phase.order || 0,
            phaseId: phase.id || this.generateId(),
            phaseCode: `PHASE_${phase.order || 0}`,
            isPhaseFolder: true,
            status: 'scheduled' as const,
            completionPercentage: 0,
            templateIds: [],
            requiredTemplateIds: [],
            optionalTemplateIds: [],
            formTemplates: [],
            completedTemplates: [],
            inProgressTemplates: [],
            canProgressToNextPhase: false,
            blockingTemplates: [],
            createdBy: userId,
            createdAt: now,
            lastModifiedBy: userId,
            lastModifiedAt: now
          };
          visitSubcomponents.push(fallbackVisitSubcomponent);
        }
      }
    }

    return visitSubcomponents;
  }

  /**
   * Remove a patient from a study
   */
  async removePatientFromStudy(studyId: string, patientId: string, reason?: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUser = await firstValueFrom(this.authService.user$);
      if (!currentUser) {
        throw new Error('User must be authenticated to remove patients from studies');
      }

      // Update study - remove patient ID
      const studyRef = doc(this.firestore, 'studies', studyId);
      const studyDoc = await getDoc(studyRef);
      
      if (!studyDoc.exists()) {
        throw new Error('Study not found');
      }

      const studyData = studyDoc.data() as Study;
      const currentPatientIds = studyData.patientIds || [];
      
      // Remove patient from study's patient list
      const updatedPatientIds = currentPatientIds.filter(id => id !== patientId);
      
      await updateDoc(studyRef, {
        patientIds: updatedPatientIds,
        actualEnrollment: updatedPatientIds.length,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });

      // Clear patient's study ID (set to empty string or null)
      const patientRef = doc(this.firestore, 'patients', patientId);
      await updateDoc(patientRef, {
        studyId: '', // Clear the study association
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });

      // Log audit event
      await this.auditService.logAuditEvent({
        action: 'patient_removed_from_study',
        resourceType: 'study',
        resourceId: studyId,
        userId: currentUser.uid,
        details: JSON.stringify({
          patientId,
          studyId,
          reason: reason || 'No reason provided',
          newEnrollmentCount: updatedPatientIds.length
        })
      });
    });
  }

  /**
   * Get study information for a specific patient
   */
  async getPatientStudy(patientId: string): Promise<Study | null> {
    return await runInInjectionContext(this.injector, async () => {
      const patientRef = doc(this.firestore, 'patients', patientId);
      const patientDoc = await getDoc(patientRef);
      
      if (!patientDoc.exists()) {
        return null;
      }

      const patientData = patientDoc.data();
      const studyId = patientData['studyId'];
      
      if (!studyId) {
        return null;
      }

      return await this.getStudy(studyId);
    });
  }

  /**
   * Get patient count for a study
   */
  async getStudyPatientCount(studyId: string): Promise<number> {
    const study = await this.getStudy(studyId);
    return study?.patientIds?.length || 0;
  }

  // Organization-specific study methods
  async getStudiesForOrganization(organizationId: string): Promise<Study[]> {
    return await runInInjectionContext(this.injector, async () => {
      const studiesRef = collection(this.firestore, 'studies');
      const q = query(studiesRef, where('organizationId', '==', organizationId));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return this.deserializeStudyData({ id: doc.id, ...data } as any);
      });
    });
  }
}
