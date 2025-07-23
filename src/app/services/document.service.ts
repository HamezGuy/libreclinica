import { Injectable, Inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { AngularFirestore } from '@angular/fire/compat/firestore';
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
    private firestore: AngularFirestore
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
    // Create the event
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

    // Publish the event BEFORE saving to allow validation
    this.eventBus.publish(event);

    // Save to Firestore
    return from(
      this.firestore
        .collection(documentType.toLowerCase())
        .doc(documentId)
        .set({
          ...data,
          _metadata: {
            createdAt: new Date(),
            createdBy: userId,
            lastModifiedAt: new Date(),
            lastModifiedBy: userId,
            version: 1
          }
        })
    ).pipe(
      tap(() => {
        console.log(`Document saved: ${documentType}/${documentId}`);
        // Could publish a success event here if needed
      })
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
    // First get the current document for audit trail
    return this.firestore
      .collection(documentType.toLowerCase())
      .doc(documentId)
      .get()
      .pipe(
        switchMap(doc => {
          const currentData = doc.data() || {};
          
          // Create update event with old and new values
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

          // Publish the event
          this.eventBus.publish(event);

          // Perform the update
          return from(
            this.firestore
              .collection(documentType.toLowerCase())
              .doc(documentId)
              .update({
                ...updates,
                '_metadata.lastModifiedAt': new Date(),
                '_metadata.lastModifiedBy': userId,
                '_metadata.version': (currentData as any)?._metadata?.version + 1 || 1
              })
          );
        }),
        tap(() => {
          console.log(`Document updated: ${documentType}/${documentId}`);
        })
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
    // Create delete event
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

    // Publish the event
    this.eventBus.publish(event);

    // Soft delete by marking as deleted
    return from(
      this.firestore
        .collection(documentType.toLowerCase())
        .doc(documentId)
        .update({
          '_metadata.deletedAt': new Date(),
          '_metadata.deletedBy': userId,
          '_metadata.isDeleted': true
        })
    ).pipe(
      tap(() => {
        console.log(`Document deleted: ${documentType}/${documentId}`);
      })
    );
  }

  private generateEventId(): string {
    return `doc_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
