import { Injectable, inject, Inject } from '@angular/core';
import { Observable, from, BehaviorSubject, combineLatest } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  writeBatch
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { 
  FormInstance, 
  FormTemplate, 
  FormValidationResult, 
  ElectronicSignature,
  FormAttachment 
} from '../models/form-template.model';
import { UserProfile } from '../models/user-profile.model';
import { EdcCompliantAuthService } from './edc-compliant-auth.service';
import { FormTemplateService } from './form-template.service';
import { DataSeparationService } from './data-separation.service';
import { 
  IEventBus, 
  FormInstanceCreatedEvent,
  FormInstanceSubmittedEvent,
  FormInstanceSignedEvent
} from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';

@Injectable({
  providedIn: 'root'
})
export class FormInstanceService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private authService = inject(EdcCompliantAuthService);
  private templateService = inject(FormTemplateService);
  private dataSeparationService = inject(DataSeparationService);
  
  private instancesSubject = new BehaviorSubject<FormInstance[]>([]);
  public instances$ = this.instancesSubject.asObservable();
  
  constructor(@Inject(EVENT_BUS_TOKEN) private eventBus: IEventBus) {}

  /**
   * Create a new form instance from a template
   */
  async createFormInstance(
    templateId: string, 
    patientId?: string, 
    studyId?: string,
    visitId?: string
  ): Promise<FormInstance> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const template = await this.templateService.getTemplate(templateId);
    if (!template) throw new Error('Form template not found');

    try {
      const instanceData: Omit<FormInstance, 'id'> = {
        templateId,
        templateVersion: template.version,
        studyId,
        patientId,
        visitId,
        data: {},
        phiData: {},
        attachments: [],
        status: 'draft',
        completionPercentage: 0,
        signatures: [],
        nestedForms: {},
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: new Date(),
        changeHistory: [{
          id: crypto.randomUUID(),
          timestamp: new Date(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          action: 'created',
          fieldChanges: [],
          reason: 'Form instance created'
        }],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const instancesRef = collection(this.firestore, 'formInstances');
      const docRef = await addDoc(instancesRef, {
        ...instanceData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp()
      });

      const createdInstance: FormInstance = {
        id: docRef.id,
        ...instanceData
      };

      // Publish event
      this.eventBus.publish<FormInstanceCreatedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_INSTANCE_CREATED',
        timestamp: new Date(),
        userId: currentUser.uid,
        instanceId: docRef.id,
        templateId,
        patientId,
        studyId,
        createdBy: currentUser.uid
      });

      return createdInstance;
    } catch (error) {
      console.error('Failed to create form instance:', error);
      throw error;
    }
  }

  /**
   * Update form instance data
   */
  async updateFormInstance(
    instanceId: string, 
    updates: Partial<FormInstance>,
    reason?: string
  ): Promise<FormInstance> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const existingInstance = await this.getFormInstance(instanceId);
    if (!existingInstance) throw new Error('Form instance not found');

    // Check if instance is locked
    if (existingInstance.status === 'locked') {
      throw new Error('Cannot modify locked form instance');
    }

    try {
      const template = await this.templateService.getTemplate(existingInstance.templateId);
      if (!template) throw new Error('Form template not found');

      // Separate PHI and non-PHI data
      const { phiData, nonPhiData } = this.separateFormData(updates.data || {}, template);

      // Calculate completion percentage
      const completionPercentage = this.calculateCompletionPercentage(
        { ...existingInstance.data, ...nonPhiData },
        template
      );

      // Create change history entry
      const changeEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        userId: currentUser.uid,
        userEmail: currentUser.email,
        action: 'modified' as const,
        fieldChanges: this.calculateFieldChanges(existingInstance.data, nonPhiData),
        reason: reason || 'Form data updated'
      };

      const updateData = {
        ...updates,
        data: { ...existingInstance.data, ...nonPhiData },
        phiData: { ...existingInstance.phiData, ...phiData },
        completionPercentage,
        lastModifiedBy: currentUser.uid,
        lastModifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        changeHistory: [
          ...(existingInstance.changeHistory || []),
          changeEntry
        ]
      };

      const instanceRef = doc(this.firestore, 'formInstances', instanceId);
      await updateDoc(instanceRef, updateData);

      // Store PHI data separately if present
      if (Object.keys(phiData).length > 0) {
        await this.storePhiData(instanceId, phiData);
      }

      const updatedInstance: FormInstance = {
        ...existingInstance,
        ...updateData,
        lastModifiedAt: new Date(),
        updatedAt: new Date()
      } as FormInstance;

      return updatedInstance;
    } catch (error) {
      console.error('Failed to update form instance:', error);
      throw error;
    }
  }

  /**
   * Submit a form instance
   */
  async submitFormInstance(instanceId: string): Promise<FormInstance> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const instance = await this.getFormInstance(instanceId);
    if (!instance) throw new Error('Form instance not found');

    const template = await this.templateService.getTemplate(instance.templateId);
    if (!template) throw new Error('Form template not found');

    // Validate form before submission
    const validationResult = await this.templateService.validateFormInstance(instance);
    if (!validationResult.isValid) {
      throw new Error(`Form validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    try {
      const updates: Partial<FormInstance> = {
        status: template.requiresReview ? 'completed' : 'completed',
        submittedBy: currentUser.uid,
        submittedAt: new Date()
      };

      const updatedInstance = await this.updateFormInstance(instanceId, updates, 'Form submitted');

      // Publish event
      this.eventBus.publish<FormInstanceSubmittedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_INSTANCE_SUBMITTED',
        timestamp: new Date(),
        userId: currentUser.uid,
        instanceId,
        templateId: instance.templateId,
        patientId: instance.patientId,
        studyId: instance.studyId,
        submittedBy: currentUser.uid,
        formData: instance.data,
        containsPhi: Object.keys(instance.phiData || {}).length > 0
      });

      return updatedInstance;
    } catch (error) {
      console.error('Failed to submit form instance:', error);
      throw error;
    }
  }

  /**
   * Add electronic signature to form instance
   */
  async signFormInstance(
    instanceId: string, 
    signatureMeaning: string,
    method: 'password' | 'biometric' | 'token' | 'certificate' = 'password'
  ): Promise<FormInstance> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    const instance = await this.getFormInstance(instanceId);
    if (!instance) throw new Error('Form instance not found');

    try {
      // Create electronic signature
      const signature: ElectronicSignature = {
        signerId: currentUser.uid,
        signerEmail: currentUser.email,
        signerName: currentUser.displayName,
        timestamp: new Date(),
        meaning: signatureMeaning,
        method,
        ipAddress: await this.getClientIP(),
        userAgent: navigator.userAgent,
        documentHash: await this.calculateDocumentHash(instance)
      };

      const updates: Partial<FormInstance> = {
        signatures: [...(instance.signatures || []), signature],
        status: 'completed'
      };

      const updatedInstance = await this.updateFormInstance(
        instanceId, 
        updates, 
        `Electronic signature added: ${signatureMeaning}`
      );

      // Publish event
      this.eventBus.publish<FormInstanceSignedEvent>({
        id: crypto.randomUUID(),
        type: 'FORM_INSTANCE_SIGNED',
        timestamp: new Date(),
        userId: currentUser.uid,
        instanceId,
        templateId: instance.templateId,
        signedBy: currentUser.uid,
        signatureMethod: method,
        signatureMeaning,
        documentHash: signature.documentHash
      });

      return updatedInstance;
    } catch (error) {
      console.error('Failed to sign form instance:', error);
      throw error;
    }
  }

  /**
   * Get form instance by ID
   */
  async getFormInstance(instanceId: string): Promise<FormInstance | null> {
    try {
      const instanceRef = doc(this.firestore, 'formInstances', instanceId);
      const instanceSnap = await getDoc(instanceRef);
      
      if (instanceSnap.exists()) {
        const instance = {
          id: instanceSnap.id,
          ...instanceSnap.data()
        } as FormInstance;

        // Load PHI data if user has permissions
        const currentUser = await this.authService.getCurrentUserProfile();
        if (currentUser && this.canViewPhiData(currentUser)) {
          instance.phiData = await this.loadPhiData(instanceId);
        }

        return instance;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get form instance:', error);
      throw error;
    }
  }

  /**
   * Get form instances by patient ID
   */
  getFormInstancesByPatient(patientId: string): Observable<FormInstance[]> {
    const instancesRef = collection(this.firestore, 'formInstances');
    const q = query(
      instancesRef,
      where('patientId', '==', patientId),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FormInstance))
      )
    );
  }

  /**
   * Get form instances by study ID
   */
  getFormInstancesByStudy(studyId: string): Observable<FormInstance[]> {
    const instancesRef = collection(this.firestore, 'formInstances');
    const q = query(
      instancesRef,
      where('studyId', '==', studyId),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FormInstance))
      )
    );
  }

  /**
   * Upload file attachment to form instance
   */
  async uploadAttachment(
    instanceId: string,
    fieldId: string,
    file: File
  ): Promise<FormAttachment> {
    const currentUser = await this.authService.getCurrentUserProfile();
    if (!currentUser) throw new Error('User not authenticated');

    try {
      // Upload file using Cloud Functions
      const uploadFn = httpsCallable<{
        instanceId: string;
        fieldId: string;
        fileName: string;
        fileType: string;
        fileData: string; // base64 encoded
      }, FormAttachment>(this.functions, 'uploadFormAttachment');

      const fileData = await this.fileToBase64(file);
      const result = await uploadFn({
        instanceId,
        fieldId,
        fileName: file.name,
        fileType: file.type,
        fileData
      });

      const attachment = result.data;

      // Update form instance with new attachment
      const instance = await this.getFormInstance(instanceId);
      if (instance) {
        const updates: Partial<FormInstance> = {
          attachments: [...(instance.attachments || []), attachment]
        };
        await this.updateFormInstance(instanceId, updates, `File uploaded: ${file.name}`);
      }

      return attachment;
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      throw error;
    }
  }

  // Helper methods
  private separateFormData(data: Record<string, any>, template: FormTemplate) {
    const phiData: Record<string, any> = {};
    const nonPhiData: Record<string, any> = {};

    Object.entries(data).forEach(([fieldId, value]) => {
      const field = template.fields.find(f => f.id === fieldId);
      if (field && field.isPhi) {
        phiData[fieldId] = value;
      } else {
        nonPhiData[fieldId] = value;
      }
    });

    return { phiData, nonPhiData };
  }

  private calculateCompletionPercentage(data: Record<string, any>, template: FormTemplate): number {
    const requiredFields = template.fields.filter(f => f.required);
    if (requiredFields.length === 0) return 100;

    const completedFields = requiredFields.filter(f => {
      const value = data[f.id];
      return value !== null && value !== undefined && value !== '';
    });

    return Math.round((completedFields.length / requiredFields.length) * 100);
  }

  private calculateFieldChanges(oldData: Record<string, any>, newData: Record<string, any>) {
    const changes: any[] = [];
    
    // Check for modified and added fields
    Object.entries(newData).forEach(([fieldId, newValue]) => {
      const oldValue = oldData[fieldId];
      if (oldValue !== newValue) {
        changes.push({
          fieldId,
          fieldName: fieldId, // Could be enhanced to get actual field name
          oldValue,
          newValue,
          changeType: oldValue === undefined ? 'added' : 'modified'
        });
      }
    });

    // Check for removed fields
    Object.entries(oldData).forEach(([fieldId, oldValue]) => {
      if (!(fieldId in newData)) {
        changes.push({
          fieldId,
          fieldName: fieldId,
          oldValue,
          newValue: undefined,
          changeType: 'removed'
        });
      }
    });

    return changes;
  }

  private async storePhiData(instanceId: string, phiData: Record<string, any>): Promise<void> {
    // Use Healthcare API to store PHI data
    await this.dataSeparationService.storePhiData(`form_instance_${instanceId}`, phiData);
  }

  private async loadPhiData(instanceId: string): Promise<Record<string, any>> {
    try {
      return await this.dataSeparationService.retrievePhiData(`form_instance_${instanceId}`);
    } catch (error) {
      console.warn('Failed to load PHI data:', error);
      return {};
    }
  }

  private canViewPhiData(user: UserProfile): boolean {
    return user.status === 'ACTIVE' && 
           user.accessLevel !== 'VIEWER';
  }

  private async getClientIP(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return 'unknown';
    }
  }

  private async calculateDocumentHash(instance: FormInstance): Promise<string> {
    const documentData = JSON.stringify({
      templateId: instance.templateId,
      data: instance.data,
      timestamp: instance.updatedAt
    });
    
    const encoder = new TextEncoder();
    const data = encoder.encode(documentData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data:type;base64, prefix
      };
      reader.onerror = error => reject(error);
    });
  }
}
