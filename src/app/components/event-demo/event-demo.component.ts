import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';

import { DocumentService } from '../../services/document.service';
import { FormSubmissionService } from '../../services/form-submission.service';
import { IEventBus } from '../../core/interfaces';
import { EVENT_BUS_TOKEN } from '../../core/injection-tokens';

/**
 * Event Demo Component - Demonstrates the event-driven architecture
 * Shows how components interact with services that trigger events
 */
@Component({
  selector: 'app-event-demo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  template: `
    <div class="event-demo-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Event-Driven Architecture Demo</mat-card-title>
          <mat-card-subtitle>
            All actions trigger events handled by multiple subscribers
          </mat-card-subtitle>
        </mat-card-header>
        
        <mat-card-content>
          <!-- Document Save Demo -->
          <section class="demo-section">
            <h3>Document Operations</h3>
            <mat-form-field appearance="outline">
              <mat-label>Document Name</mat-label>
              <input matInput [(ngModel)]="documentName" placeholder="Enter document name">
            </mat-form-field>
            
            <div class="button-group">
              <button mat-raised-button color="primary" (click)="saveDocument()">
                Save Document
              </button>
              <button mat-raised-button color="accent" (click)="updateDocument()">
                Update Document
              </button>
              <button mat-raised-button color="warn" (click)="deleteDocument()">
                Delete Document
              </button>
            </div>
          </section>

          <!-- Form Submission Demo -->
          <section class="demo-section">
            <h3>Form Submission</h3>
            <mat-form-field appearance="outline">
              <mat-label>Patient ID</mat-label>
              <input matInput [(ngModel)]="patientId" placeholder="Enter patient ID">
            </mat-form-field>
            
            <mat-form-field appearance="outline">
              <mat-label>Lab Result</mat-label>
              <input matInput [(ngModel)]="labResult" placeholder="Enter lab result">
            </mat-form-field>
            
            <button mat-raised-button color="primary" (click)="submitForm()">
              Submit Clinical Form
            </button>
          </section>

          <!-- Event Stream Monitor -->
          <section class="demo-section">
            <h3>Event Stream Monitor</h3>
            <div class="event-monitor">
              <div *ngFor="let event of recentEvents" class="event-item">
                <span class="event-type">{{ event.type }}</span>
                <span class="event-time">{{ event.timestamp | date:'short' }}</span>
                <span class="event-id">{{ event.id }}</span>
              </div>
              <div *ngIf="recentEvents.length === 0" class="no-events">
                No events yet. Try performing some actions above.
              </div>
            </div>
          </section>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .event-demo-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }

    .demo-section {
      margin-bottom: 30px;
      padding: 20px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }

    .demo-section h3 {
      margin-top: 0;
      color: #1976d2;
    }

    mat-form-field {
      width: 100%;
      margin-bottom: 15px;
    }

    .button-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .event-monitor {
      background: #f5f5f5;
      border-radius: 4px;
      padding: 15px;
      max-height: 300px;
      overflow-y: auto;
    }

    .event-item {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      margin-bottom: 5px;
      background: white;
      border-radius: 4px;
      font-size: 14px;
    }

    .event-type {
      font-weight: bold;
      color: #1976d2;
    }

    .event-time {
      color: #666;
    }

    .event-id {
      color: #999;
      font-family: monospace;
      font-size: 12px;
    }

    .no-events {
      text-align: center;
      color: #999;
      padding: 20px;
    }
  `]
})
export class EventDemoComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  documentName = 'Test Study Protocol';
  patientId = 'PAT-001';
  labResult = '120 mg/dL';
  recentEvents: any[] = [];

  constructor(
    @Inject(EVENT_BUS_TOKEN) private eventBus: IEventBus,
    private documentService: DocumentService,
    private formService: FormSubmissionService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Subscribe to all events for monitoring
    this.eventBus.getEventStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.recentEvents.unshift(event);
        if (this.recentEvents.length > 10) {
          this.recentEvents.pop();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  saveDocument(): void {
    const docId = `DOC-${Date.now()}`;
    this.documentService.saveDocument(
      'Study',
      docId,
      {
        name: this.documentName,
        protocol: 'v1.0',
        status: 'active',
        createdAt: new Date()
      },
      'demo-user'
    ).subscribe({
      next: () => {
        this.showMessage('Document saved! Check the event monitor.');
      },
      error: (error) => {
        this.showMessage('Error saving document: ' + error.message, true);
      }
    });
  }

  updateDocument(): void {
    const docId = 'DOC-123'; // In real app, would select existing doc
    this.documentService.updateDocument(
      'Study',
      docId,
      {
        name: this.documentName + ' (Updated)',
        lastModified: new Date()
      },
      'demo-user'
    ).subscribe({
      next: () => {
        this.showMessage('Document updated! Events triggered.');
      },
      error: (error) => {
        this.showMessage('Error updating document: ' + error.message, true);
      }
    });
  }

  deleteDocument(): void {
    const docId = 'DOC-123';
    this.documentService.deleteDocument(
      'Study',
      docId,
      'demo-user'
    ).subscribe({
      next: () => {
        this.showMessage('Document deleted! Audit event logged.');
      },
      error: (error) => {
        this.showMessage('Error deleting document: ' + error.message, true);
      }
    });
  }

  submitForm(): void {
    this.formService.submitForm(
      'FORM-LAB-001',
      'STUDY-001',
      this.patientId,
      {
        glucose_level: this.labResult,
        test_date: new Date(),
        lab_name: 'Central Lab',
        patient_name: 'John Doe', // PHI - will be separated
        patient_dob: '1980-01-01' // PHI - will be separated
      },
      'demo-user'
    ).subscribe({
      next: (result) => {
        this.showMessage(`Form submitted! ID: ${result.submissionId}`);
      },
      error: (error) => {
        this.showMessage('Error submitting form: ' + error.message, true);
      }
    });
  }

  private showMessage(message: string, isError = false): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: isError ? 'error-snackbar' : 'success-snackbar'
    });
  }
}
