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
  writeBatch
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
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FormTemplate))
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
      const templateData = {
        ...template,
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

      const updateData = {
        ...updates,
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
   */
  async getTemplate(templateId: string): Promise<FormTemplate | null> {
    try {
      return await runInInjectionContext(this.injector, async () => {
        const templateRef = doc(this.firestore, 'formTemplates', templateId);
        const templateSnap = await getDoc(templateRef);
        
        if (!templateSnap.exists()) {
          return null;
        }
        
        return {
          id: templateSnap.id,
          ...templateSnap.data()
        } as FormTemplate;
      });
    } catch (error) {
      console.error('Failed to get template:', error);
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
    return from(runInInjectionContext(this.injector, async () => {
      const templatesRef = collection(this.firestore, 'formTemplates');
      const q = query(
        templatesRef,
        where('studyId', '==', studyId),
        where('status', 'in', ['published', 'review']),
        orderBy('name')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FormTemplate));
    }));
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
    
    // Admins can edit any template
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
}
