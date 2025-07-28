import { Injectable, inject, Inject, Injector, runInInjectionContext } from '@angular/core';
import { Observable, from, BehaviorSubject, combineLatest } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  writeBatch,
  deleteField
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { FormTemplate, FormInstance, FormValidationResult, FormPermissions } from '../models/form-template.model';
import { UserProfile } from '../models/user-profile.model';
import { AccessLevel } from '../enums/access-levels.enum';
import { EdcCompliantAuthService } from './edc-compliant-auth.service';
import { CloudAuditService } from './cloud-audit.service';
import { FormTemplateUpdatedEvent } from '../models/form-events.model';
import { 
  IEventBus, 
  FormTemplateCreatedEvent,
  FormTemplateModifiedEvent,
  FormTemplatePublishedEvent,
  FormTemplateDeletedEvent,
  FormInstanceCreatedEvent,
  FormInstanceSubmittedEvent,
  FormInstanceSignedEvent,
  FormValidationFailedEvent
} from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';

@Injectable({
  providedIn: 'root'
})
export class FormTemplateService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private authService = inject(EdcCompliantAuthService);
  private auditService = inject(CloudAuditService);
  private injector: Injector = inject(Injector);
  
  private templatesSubject = new BehaviorSubject<FormTemplate[]>([]);
  public templates$ = this.templatesSubject.asObservable();
  private eventBus = inject(EVENT_BUS_TOKEN);
  
  constructor() {
    this.loadTemplates();
  }

  /**
   * Load all form templates the user has access to
   */
  private loadTemplates(): void {
    combineLatest([
      this.authService.currentUserProfile$
    ]).pipe(
      switchMap(([user]) => {
        if (!user) return from([]);
        return this.getTemplatesForUser(user);
      })
    ).subscribe(templates => {
      this.templatesSubject.next(templates);
    });
  }

  /**
   * Get form templates based on user permissions
   */
  private getTemplatesForUser(user: UserProfile): Observable<FormTemplate[]> {
    const templatesRef = collection(this.firestore, 'formTemplates');
    let q = query(templatesRef, orderBy('updatedAt', 'desc'));

    // Apply access control based on user role
    if (user.accessLevel === AccessLevel.VIEWER || user.accessLevel === AccessLevel.DATA_ENTRY) {
      // Only show published templates
      q = query(templatesRef, 
        where('status', '==', 'published'),
        orderBy('updatedAt', 'desc')
      );
    }

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => {
          const data = doc.data();
          // CRITICAL: Always use Firebase document ID, not the internal template ID
          // The document data might have an 'id' field that we need to ignore
          console.log('[getTemplatesForUser] Loading template:', {
            firebaseDocId: doc.id,
            internalId: data['id'],
            templateName: data['name']
          });
          const template = {
            ...data,
            id: doc.id // This MUST be the Firebase document ID, overwriting any internal ID
          } as FormTemplate;
          console.log('[getTemplatesForUser] Final template ID:', template.id);
          return template;
        })
      )
    );
  }

  /**
   * Create a new form template
   * Only ADMIN and INVESTIGATOR can create templates
   */
  async createTemplate(template: FormTemplate): Promise<FormTemplate> {
    const currentUser = await this.authService.getCurrentUserProfile();
    console.log('Creating template with user:', {
      uid: currentUser?.uid,
      email: currentUser?.email,
      accessLevel: currentUser?.accessLevel,
      status: currentUser?.status
    });
    
    if (!currentUser) throw new Error('User not authenticated');
    if (!this.canCreateTemplate(currentUser)) {
      console.error('Permission check failed:', {
        userStatus: currentUser.status,
        userAccessLevel: currentUser.accessLevel,
        requiredLevels: ['ADMIN', 'SUPER_ADMIN', 'INVESTIGATOR']
      });
      throw new Error('Insufficient permissions to create template');
    }

    try {
      // Remove id field to avoid conflicts with Firestore document ID
      const { id, ...templateWithoutId } = template;
      
      const templateData = {
        ...templateWithoutId,
        createdBy: currentUser.uid,
        lastModifiedBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        changeHistory: [{
          id: crypto.randomUUID(),
          action: 'created',
          timestamp: new Date(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          reason: 'Initial template creation',
          changes: { created: true }
        }]
      };

      const docRef = await runInInjectionContext(this.injector, async () => {
        const templatesRef = collection(this.firestore, 'formTemplates');
        return await addDoc(templatesRef, templateData);
      });
      // Create local template object with proper Date types
      const createdTemplate: FormTemplate = {
        id: docRef.id,
        ...template,
        createdBy: currentUser.uid,
        lastModifiedBy: currentUser.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        changeHistory: [{
          id: crypto.randomUUID(),
          action: 'created',
          timestamp: new Date(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          reason: 'Initial template creation',
          changes: { created: true }
        }]
      };

      // Publish event
      this.eventBus.publish<FormTemplateCreatedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_TEMPLATE_CREATED',
        timestamp: new Date(),
        userId: currentUser.uid,
        templateId: docRef.id,
        templateName: template.name,
        studyId: template.studyId,
        createdBy: currentUser.uid,
        templateData: templateData
      });

      // Refresh templates list
      this.loadTemplates();

      return createdTemplate;
    } catch (error) {
      console.error('Failed to create form template:', error);
      throw error;
    }
  }

  /**
   * Update an existing form template
   */
  async updateTemplate(templateId: string, updates: Partial<FormTemplate>): Promise<FormTemplate> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    // Get existing template
    const existingTemplate = await this.getTemplate(templateId);
    if (!existingTemplate) throw new Error('Template not found');

    // Check permissions
    if (!this.canEditTemplate(currentUser, existingTemplate)) {
      throw new Error('Insufficient permissions to edit this template');
    }

    try {
      // Create change history entry
      const changeEntry = {
        id: crypto.randomUUID(),
        action: 'modified',
        timestamp: new Date(),
        userId: currentUser.uid,
        userEmail: currentUser.email,
        reason: updates.reason || 'Template modification',
        changes: updates
      };

      // Remove id field from updates to avoid conflicts
      const { id, ...updatesWithoutId } = updates;
      
      const updateData = {
        ...updatesWithoutId,
        lastModifiedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
        changeHistory: [
          ...(existingTemplate.changeHistory || []),
          changeEntry
        ]
      };

      await runInInjectionContext(this.injector, async () => {
        const templateRef = doc(this.firestore, 'formTemplates', templateId);
        return await updateDoc(templateRef, updateData);
      });

      // Refetch the template to get the correct version and other server-updated fields
      const updatedTemplate = await this.getTemplate(templateId);
      if (!updatedTemplate) {
        throw new Error('Failed to retrieve updated template after update.');
      }

      // Publish event
      this.eventBus.publish<FormTemplateModifiedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_TEMPLATE_MODIFIED',
        timestamp: new Date(),
        userId: currentUser.uid,
        templateId,
        templateName: updatedTemplate.name,
        studyId: updatedTemplate.studyId,
        modifiedBy: currentUser.uid,
        changes: updates,
        oldVersion: existingTemplate.version,
        newVersion: updatedTemplate.version
      });

      // Publish an event for the template update
      this.eventBus.publish<FormTemplateUpdatedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_TEMPLATE_UPDATED',
        timestamp: new Date(),
        templateId: templateId,
        userId: currentUser.uid,
        version: updatedTemplate.version,
        changes: updates // For a real app, generate a proper diff
      });

      // Refresh templates list
      this.loadTemplates();

      return updatedTemplate;
    } catch (error) {
      console.error('Failed to update form template:', error);
      throw error;
    }
  }

  /**
   * Publish a form template
   * Requires ADMIN or INVESTIGATOR role
   */
  async publishTemplate(templateId: string, approvalRequired: boolean = true): Promise<FormTemplate> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const template = await this.getTemplate(templateId);
    if (!template) throw new Error('Template not found');

    // Check permissions
    if (!this.canPublishTemplate(currentUser, template)) {
      throw new Error('Insufficient permissions to publish this template');
    }

    try {
      const updates: Partial<FormTemplate> = {
        status: 'published',
        publishedAt: new Date(),
        approvedBy: currentUser.uid,
        approvalDate: new Date()
      };

      const updatedTemplate = await this.updateTemplate(templateId, updates);

      // Publish event
      this.eventBus.publish<FormTemplatePublishedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_TEMPLATE_PUBLISHED',
        timestamp: new Date(),
        userId: currentUser.uid,
        templateId,
        templateName: template.name,
        studyId: template.studyId,
        publishedBy: currentUser.uid,
        version: template.version,
        approvalRequired
      });

      return updatedTemplate;
    } catch (error) {
      console.error('Failed to publish template:', error);
      throw error;
    }
  }

  /**
   * Delete a form template
   * Only ADMIN can delete templates
   */
  async deleteTemplate(templateId: string, reason: string): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const template = await this.getTemplate(templateId);
    if (!template) throw new Error('Template not found');

    // Cannot delete already archived templates
    if (template.status === 'archived') {
      throw new Error('Template is already archived and cannot be deleted again');
    }

    // Check permissions - only ADMIN can delete
    if (currentUser.accessLevel !== AccessLevel.ADMIN && currentUser.accessLevel !== AccessLevel.SUPER_ADMIN) {
      throw new Error('Only administrators can delete form templates');
    }

    try {
      // Instead of hard delete, mark as archived for compliance
      await this.updateTemplate(templateId, {
        status: 'archived',
        reason
      });

      // Publish event
      this.eventBus.publish<FormTemplateDeletedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_TEMPLATE_DELETED',
        timestamp: new Date(),
        userId: currentUser.uid,
        templateId,
        templateName: template.name,
        studyId: template.studyId,
        deletedBy: currentUser.uid,
        reason,
        version: template.version,
      });

    } catch (error) {
      console.error('Failed to delete template:', error);
      throw error;
    }
  }

  /**
   * Get a single form template by ID
   * @param templateId The Firebase document ID (NOT the internal template ID)
   * @important Always use the Firebase document ID for lookups, never the internal template.id field
   */
  async getTemplate(templateId: string): Promise<FormTemplate | null> {
    try {
      console.log('[getTemplate] Fetching template with ID:', templateId);
      return await runInInjectionContext(this.injector, async () => {
        const templateRef = doc(this.firestore, 'formTemplates', templateId);
        console.log('[getTemplate] Template reference path:', templateRef.path);
        const templateSnap = await getDoc(templateRef);
        
        if (!templateSnap.exists()) {
          console.log('[getTemplate] Template document does not exist in Firestore');
          return null;
        }
        
        const data = templateSnap.data();
        console.log('[getTemplate] Template data retrieved:', data);
        
        // CRITICAL: Always use Firebase document ID, not the internal template ID
        // The document data might have an 'id' field that we need to overwrite
        const template = {
          ...data,
          id: templateSnap.id // This MUST be the Firebase document ID, overwriting any internal ID
        } as FormTemplate;
        
        // Log both IDs to help debug any issues
        console.log('[getTemplate] Firebase document ID:', templateSnap.id);
        console.log('[getTemplate] Internal template ID (if any):', data['id']);
        console.log('[getTemplate] Returning template with Firebase doc ID:', template.id);
        return template;
      });
    } catch (error) {
      console.error('[getTemplate] Failed to get template:', error);
      throw error;
    }
  }

  /**
   * Get all templates (compatibility method for dashboard)
   */
  async getAllTemplates(): Promise<FormTemplate[]> {
    try {
      return await runInInjectionContext(this.injector, async () => {
        const templatesRef = collection(this.firestore, 'formTemplates');
        const q = query(templatesRef, orderBy('updatedAt', 'desc'));
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FormTemplate));
      });
    } catch (error) {
      console.error('Failed to get all templates:', error);
      return [];
    }
  }

  /**
   * Get templates by study ID
   */
  getTemplatesByStudy(studyId: string): Observable<FormTemplate[]> {
    const templatesRef = collection(this.firestore, 'formTemplates');
    const q = query(templatesRef, 
      where('studyId', '==', studyId),
      where('status', '==', 'published'),
      orderBy('updatedAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as FormTemplate))
      )
    );
  }

  /**
   * Get templates by patient visit subcomponent
   */
  getTemplatesBySubcomponent(patientVisitSubcomponentId: string): Observable<FormTemplate[]> {
    const templatesRef = collection(this.firestore, 'formTemplates');
    const q = query(templatesRef, 
      where('patientVisitSubcomponentId', '==', patientVisitSubcomponentId),
      where('status', '==', 'published'),
      orderBy('updatedAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as FormTemplate))
      )
    );
  }

  /**
   * Assign templates to a patient visit subcomponent
   */
  async assignTemplatesToSubcomponent(
    templateIds: string[], 
    patientVisitSubcomponentId: string
  ): Promise<void> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    if (!this.canCreateTemplate(currentUser)) {
      throw new Error('Insufficient permissions to assign templates');
    }

    const batch = writeBatch(this.firestore);
    
    for (const templateId of templateIds) {
      const templateRef = doc(this.firestore, 'formTemplates', templateId);
      batch.update(templateRef, {
        patientVisitSubcomponentId,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp()
      });
    }

    await batch.commit();

    // Emit events for each template assignment
    for (const templateId of templateIds) {
      const template = await this.getTemplate(templateId);
      if (template) {
        this.eventBus.publish({
          type: 'FORM_TEMPLATE_MODIFIED',
          templateId,
          templateName: template.name,
          studyId: template.studyId,
          modifiedBy: currentUser.uid,
          changes: { patientVisitSubcomponentId },
          oldVersion: template.version,
          newVersion: template.version,
          timestamp: new Date(),
          userId: currentUser.uid
        } as FormTemplateModifiedEvent);
      }
    }
  }

  /**
   * Validate a form instance against its template
   */
  async validateFormInstance(instance: FormInstance): Promise<FormValidationResult> {
    try {
      const validateFn = httpsCallable<FormInstance, FormValidationResult>(
        this.functions,
        'validateFormInstance'
      );
      
      const result = await validateFn(instance);
      
      // If validation failed, publish event
      if (!result.data.isValid) {
        const currentUser = await this.authService.getCurrentUserProfile();
        this.eventBus.publish<FormValidationFailedEvent>({
          id: crypto.randomUUID(),
          type: 'FORM_VALIDATION_FAILED',
          timestamp: new Date(),
          userId: currentUser?.uid || 'unknown',
          instanceId: instance.id || 'unknown',
          templateId: instance.templateId,
          validationErrors: result.data.errors,
          attemptedBy: currentUser?.uid || 'unknown'
        });
      }
      
      return result.data;
    } catch (error) {
      console.error('Failed to validate form instance:', error);
      throw error;
    }
  }

  /**
   * Get form permissions for current user
   */
  async getFormPermissions(template?: FormTemplate): Promise<FormPermissions> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) {
      return {
        canView: false,
        canEdit: false,
        canCreate: false,
        canDelete: false,
        canPublish: false,
        canSign: false,
        canReview: false,
        requiredAccessLevel: AccessLevel.VIEWER
      };
    }

    const permissions: FormPermissions = {
      canView: this.canViewTemplates(currentUser),
      canEdit: template ? this.canEditTemplate(currentUser, template) : this.canCreateTemplate(currentUser),
      canCreate: this.canCreateTemplate(currentUser),
      canDelete: currentUser.accessLevel === AccessLevel.ADMIN || currentUser.accessLevel === AccessLevel.SUPER_ADMIN,
      canPublish: template ? this.canPublishTemplate(currentUser, template) : false,
      canSign: this.canSignForms(currentUser),
      canReview: this.canReviewForms(currentUser),
      requiredAccessLevel: AccessLevel.VIEWER
    };

    return permissions;
  }

  // Permission helper methods
  private canViewTemplates(user: UserProfile): boolean {
    return user.status === 'ACTIVE';
  }

  private canCreateTemplate(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN || 
            user.accessLevel === AccessLevel.INVESTIGATOR);
  }

  private canEditTemplate(user: UserProfile, template: FormTemplate): boolean {
    if (user.status !== 'ACTIVE') return false;
    
    // Archived templates cannot be edited by anyone
    if (template.status === 'archived') return false;
    
    // Admins can edit any non-archived template
    if (user.accessLevel === AccessLevel.ADMIN || user.accessLevel === AccessLevel.SUPER_ADMIN) {
      return true;
    }
    
    // Investigators can edit their own templates or templates in their studies
    if (user.accessLevel === AccessLevel.INVESTIGATOR) {
      return template.createdBy === user.uid || 
             (!!template.studyId && !!user.assignedStudies?.includes(template.studyId));
    }
    
    return false;
  }

  private canPublishTemplate(user: UserProfile, template: FormTemplate): boolean {
    // Cannot publish archived templates
    if (template.status === 'archived') return false;
    
    return this.canEditTemplate(user, template) && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN || 
            user.accessLevel === AccessLevel.INVESTIGATOR);
  }

  private canSignForms(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           user.accessLevel !== AccessLevel.VIEWER;
  }

  private canReviewForms(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           (user.accessLevel === AccessLevel.ADMIN || 
            user.accessLevel === AccessLevel.SUPER_ADMIN || 
            user.accessLevel === AccessLevel.INVESTIGATOR ||
            user.accessLevel === AccessLevel.MONITOR);
  }

  /**
   * Fix template IDs by removing internal id fields that conflict with document IDs
   * This is a one-time migration to fix existing templates
   */
  async fixTemplateIds(): Promise<void> {
    try {
      console.log('[fixTemplateIds] Starting template ID fix...');
      
      const templatesRef = collection(this.firestore, 'formTemplates');
      const snapshot = await getDocs(templatesRef);
      
      let fixedCount = 0;
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Check if the document has an internal 'id' field
        if (data['id']) {
          console.log(`[fixTemplateIds] Fixing template ${docSnap.id}: removing internal id field "${data['id']}"`);
          
          // Remove the id field from the document
          await runInInjectionContext(this.injector, async () => {
            const docRef = doc(this.firestore, 'formTemplates', docSnap.id);
            await updateDoc(docRef, {
              id: deleteField()
            });
          });
          
          fixedCount++;
        }
      }
      
      console.log(`[fixTemplateIds] Template ID fix complete. Fixed ${fixedCount} templates.`);
      
      // Reload templates after fixing
      this.loadTemplates();
    } catch (error) {
      console.error('[fixTemplateIds] Error fixing template IDs:', error);
      throw error;
    }
  }
}
