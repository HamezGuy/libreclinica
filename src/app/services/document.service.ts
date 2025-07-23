import { Injectable, Inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { Firestore, doc, setDoc, updateDoc, getDoc, collection } from '@angular/fire/firestore';
import { IEventBus, DocumentSavedEvent } from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';

/**
 * Document Service - Demonstrates event-driven architecture
 * All save operations trigger events that are handled by multiple subscribers
 */
@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  constructor(
    @Inject(EVENT_BUS_TOKEN) private eventBus: IEventBus,
    private firestore: Firestore
  ) {}

  /**
   * Save a document and trigger events
   * This demonstrates the event-driven architecture where save operations
   * trigger events that are handled by audit, validation, and sync handlers
   */
  saveDocument(
    documentType: string,
    documentId: string,
    data: any,
    userId: string
  ): Observable<void> {
    const event: DocumentSavedEvent = {
      id: this.generateEventId(),
      type: 'DOCUMENT_SAVED',
      timestamp: new Date(),
      documentId,
      documentType,
      data,
      userId,
      metadata: {
        source: 'DocumentService',
        version: '1.0'
      }
    };

    this.eventBus.publish(event);

    const docRef = doc(this.firestore, documentType.toLowerCase(), documentId);
    const saveData = {
      ...data,
      _metadata: {
        createdAt: new Date(),
        createdBy: userId,
        lastModifiedAt: new Date(),
        lastModifiedBy: userId,
        version: 1
      }
    };

    return from(setDoc(docRef, saveData)).pipe(
      tap(() => console.log(`Document saved: ${documentType}/${documentId}`))
    );
  }

  /**
   * Update a document with event triggering
   */
  updateDocument(
    documentType: string,
    documentId: string,
    updates: any,
    userId: string
  ): Observable<void> {
    const docRef = doc(this.firestore, documentType.toLowerCase(), documentId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        const currentData = docSnap.exists() ? docSnap.data() : {};
        
        const event: DocumentSavedEvent = {
          id: this.generateEventId(),
          type: 'DOCUMENT_SAVED',
          timestamp: new Date(),
          documentId,
          documentType,
          data: { ...currentData, ...updates },
          userId,
          metadata: {
            source: 'DocumentService',
            version: '1.0',
            operation: 'UPDATE',
            oldValue: currentData,
            newValue: updates
          }
        };

        this.eventBus.publish(event);

        const updateData = {
          ...updates,
          '_metadata.lastModifiedAt': new Date(),
          '_metadata.lastModifiedBy': userId,
          '_metadata.version': (currentData as any)?._metadata?.version + 1 || 1
        };

        return from(updateDoc(docRef, updateData));
      }),
      tap(() => console.log(`Document updated: ${documentType}/${documentId}`))
    );
  }

  /**
   * Delete a document with event triggering
   */
  deleteDocument(
    documentType: string,
    documentId: string,
    userId: string
  ): Observable<void> {
    const event: DocumentSavedEvent = {
      id: this.generateEventId(),
      type: 'DOCUMENT_SAVED',
      timestamp: new Date(),
      documentId,
      documentType,
      data: null,
      userId,
      metadata: {
        source: 'DocumentService',
        version: '1.0',
        operation: 'DELETE'
      }
    };

    this.eventBus.publish(event);

    const docRef = doc(this.firestore, documentType.toLowerCase(), documentId);
    const deleteUpdate = {
      '_metadata.deletedAt': new Date(),
      '_metadata.deletedBy': userId,
      '_metadata.isDeleted': true
    };

    return from(updateDoc(docRef, deleteUpdate)).pipe(
      tap(() => console.log(`Document soft-deleted: ${documentType}/${documentId}`))
    );
  }

  private generateEventId(): string {
    return `doc_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
